import * as path from "@std/path";
import { BranchData, ModFiles, ZipData } from "./global_things.ts";
import { CLIENT_MOD_ZIP_NAME, get_branches_dir_path } from "./config.ts";
import * as fs from "@std/fs";
import { createHttpError } from "jsr:@oak/commons@1/http_errors";
import { Status } from "jsr:@oak/commons@1/status";
import * as zipjs from "@zip-js/zip-js/data-uri";
import { debounce, DebouncedFunction } from "jsr:@std/async/debounce";
import { tee } from "./logging.ts";

// @ts-types="npm:@types/archiver"
/*import * as archiver from "npm:archiver";
import { createWriteStream } from "node:fs";*/

// TODO: 1 map
const branches: Map<string, BranchData | undefined> = new Map();
const zipping_branches: Set<string> = new Set();
const branches_debounce: Map<string, DebouncedFunction<[path: string]>> = new Map();
const branches_zip_is_dirty: Map<string, boolean> = new Map();

export async function get_branch_names() {
	return branches.keys().toArray();
}

export async function get_branch(branch_name: string) {
	if (branch_name === "")
		return createHttpError(Status.NotFound, "Branch name cannot be empty", { expose: false });

	if (!branches.has(branch_name))
		return createHttpError(Status.NotFound, `There is no '${branch_name}' modpack`, { expose: false });

	const branch_data = branches.get(branch_name);

	if (!branch_data) {
		return createHttpError(Status.NotFound, `'${branch_name}' modpack is not done yet or it's empty`, {
			expose: false,
		});
	}

	return branch_data;
}

/**
 * Gets the path to access `mod_name` mod from `both` or `client_only`
 * @returns `HttpError` if not file not found, otherwise the path (in format "{branch_name}/{both/client_only}/[optional]/{mod_name}")
 */
export async function get_mod_path(branch_name: string, mod_name: string) {
	const BRANCHES_DIR_PATH = get_branches_dir_path();

	if (branch_name === "")
		return createHttpError(Status.NotFound, "Branch name cannot be empty", { expose: false });

	if (!mod_name.endsWith(".jar"))
		return createHttpError(Status.NotFound, "Mod isn't a mod", { expose: false });

	if (!await fs.exists(path.join(BRANCHES_DIR_PATH, branch_name)))
		return createHttpError(Status.NotFound, `There is no '${branch_name}' modpack`, { expose: false });

	const both_dir = path.join(branch_name, "both");

	let mod_path = path.join(both_dir, mod_name);
	if (await fs.exists(path.join(BRANCHES_DIR_PATH, mod_path)))
		return mod_path;

	mod_path = path.join(both_dir, "optional", mod_name);
	if (await fs.exists(path.join(BRANCHES_DIR_PATH, mod_path)))
		return mod_path;

	const client_dir = path.join(branch_name, "client_only");

	mod_path = path.join(client_dir, mod_name);
	if (await fs.exists(path.join(BRANCHES_DIR_PATH, mod_path)))
		return mod_path;

	mod_path = path.join(client_dir, "optional", mod_name);
	if (await fs.exists(path.join(BRANCHES_DIR_PATH, mod_path)))
		return mod_path;

	return createHttpError(Status.NotFound, `There is no '${mod_name}' mod in '${branch_name}' modpack`, {
		expose: false,
	});
}

/**
 * Gets the path to access the zip for `branch_name`
 * @returns `HttpError` if not file not found, otherwise the path (in format "{branch_name}/{CLIENT_MOD_ZIP_NAME}")
 */
export async function get_zip_path(branch_name: string) {
	const BRANCHES_DIR_PATH = get_branches_dir_path();

	if (branch_name === "")
		return createHttpError(Status.NotFound, "'branch name' cannot be empty", { expose: false });

	const no_zip_msg = `There is no '${CLIENT_MOD_ZIP_NAME}' for '${branch_name}' modpack yet! Try again later`;

	if (zipping_branches.has(branch_name))
		return createHttpError(Status.NotFound, no_zip_msg, { expose: false });

	if (!await fs.exists(path.join(BRANCHES_DIR_PATH, branch_name)))
		return createHttpError(Status.NotFound, `There is no '${branch_name}' modpack`, { expose: false });

	const zip_path = path.join(branch_name, CLIENT_MOD_ZIP_NAME);
	if (await fs.exists(path.join(BRANCHES_DIR_PATH, zip_path)))
		return zip_path;

	return createHttpError(Status.NotFound, no_zip_msg, { expose: false });
}

export async function collect_branch(branch_name: string) {
	const branch_path = path.join(get_branches_dir_path(), branch_name);

	const mod_files: ModFiles = new Map();

	async function populate(dir: string) {
		if (!await fs.exists(dir)) return;

		const is_optional = path.basename(dir) === "optional";
		const iter = Deno.readDir(dir);

		const promises: Promise<void>[] = [];

		for await (const file of iter) {
			if (!file.isFile || !file.name.endsWith(".jar")) continue;

			const file_path = path.join(dir, file.name);
			promises.push(
				Deno.stat(file_path).then((stats) => {
					// cut off milliseconds, to match zip format
					const mod_date = Math.floor((stats.mtime ?? new Date(0)).getTime() / 1000) * 1000;

					mod_files.set(file.name, {
						name: file.name,
						mod_date: mod_date,
						size: stats.size,
						is_optional: is_optional,
					});
				}),
			);
		}

		await Promise.all(promises);
	}

	const both_dir = path.join(branch_path, "both");
	const client_dir = path.join(branch_path, "client_only");

	// TODO: optional mods can have dependencies -> api has to handle it (so syncer can auto tick required dependencies for optional mod)
	// ideas:
	//     - optional only holds directories, a mod and its required dependencies go into 1 folder
	//         e.g.: warium_ponder + ponderjs
	//         problems / look out for:
	//             - multiple mod can have same dependency, and they can differ by accident or by desing (e.g: ponderjs 2.0.6 and 2.0.5)
	//     - file which describes what depends on what (e.g.: warium_ponder: ponderjs)
	//         easier to see multiple versions of same dependency
	//         less duplicated files
	//         problems / look out for:
	//             - more work
	//             - can get out of sync from mods (e.g.: not modifying it after changing optional mods)
	// one needs duplicated files, while the other has to be hand written (albeit there isnt too much optional mods so its feasable)

	await populate(both_dir);
	await populate(client_dir);
	await populate(path.join(both_dir, "optional"));
	await populate(path.join(client_dir, "optional"));

	return mod_files;
}

export async function make_client_zip(branch_name: string, mod_file_names: Set<string>) {
	const zip_data: ZipData = {
		size: 0,
		is_present: false,
		mod_date: 0,
	};

	if (branch_name === "") return zip_data;

	// 1. check to exit quickly
	if (zipping_branches.has(branch_name)) return zip_data;

	const branch_path = path.join(get_branches_dir_path(), branch_name);
	if (!await fs.exists(branch_path)) return zip_data;

	const zip_path = path.join(branch_path, CLIENT_MOD_ZIP_NAME);

	try {
		const branch_data = branches.get(branch_name);
		if (branch_data === undefined) throw new Error();

		const stats = await Deno.stat(zip_path);
		if (stats.mtime?.getTime() === branch_data.zip.mod_date && stats.size === branch_data.zip.size)
			return branch_data.zip;
	} catch { /* just continue normally */ }

	// 2. check to not let race condition win
	if (zipping_branches.has(branch_name)) return zip_data;
	zipping_branches.add(branch_name);

	tee(`zipping ${branch_name}`);

	using zip_file = await Deno.open(zip_path, { write: true, create: true, truncate: true });
	const zip_writer = new zipjs.ZipWriter(zip_file, { level: 1, bufferedWrite: true });

	const zipping_file_paths: string[] = [];
	for await (
		const file of fs.expandGlob(path.join(branch_path, "**/*.jar"), {
			includeDirs: false,
			exclude: [path.join(branch_path, "server_only/**")],
		})
	) {
		if (mod_file_names.delete(file.name))
			zipping_file_paths.push(file.path);
	}

	// TODO: do smth if mod_file_names still has names (mods have been deleted since last collection)
	//       ^-- have to re-think how collect_branch and this should work together
	//           ^-- both has to cooperate and call each other when change was detected
	//               ^-- how to do this?

	// TODO: catch this
	try {
		await Promise.all(zipping_file_paths.map(async (p) => {
			const name = path.basename(p);
			const f = await Deno.open(p, { read: true });
			const stats = await Deno.stat(p);
			return zip_writer.add(name, f, { lastModDate: stats.mtime ?? new Date(0) });
		}));
	} catch (e) {
		tee(`error while zipping '${branch_name}.zip': ${e}`);
	} finally {
		await zip_writer.close();
	}

	// const a = archiver.default("zip", { zlib: { level: 1 } });
	// const b = createWriteStream(zip_path);
	// a.pipe(b);

	// for await (
	// 	const file of fs.expandGlob(path.join(branch_path, "**/*.jar"), {
	// 		includeDirs: false,
	// 		exclude: [path.join(branch_path, "server_only/**")],
	// 	})
	// ) {
	// 	a.file(file.path, {name: file.name});
	// }

	// await a.finalize();
	// b.close();

	const stats = await Deno.stat(zip_path);
	zip_data.size = stats.size;
	zip_data.is_present = true;
	zip_data.mod_date = (stats.mtime ?? new Date(0)).getTime();

	zipping_branches.delete(branch_name);

	return zip_data;
}

export async function read_client_zip(branch_name: string) {
	if (branch_name === "") return undefined;

	if (zipping_branches.has(branch_name)) return undefined;

	const branch_path = path.join(get_branches_dir_path(), branch_name);
	if (!await fs.exists(branch_path)) return undefined;

	const zip_path = path.join(branch_path, CLIENT_MOD_ZIP_NAME);

	const mod_files: ModFiles = new Map();
	let zip_reader = undefined;
	try {
		using zip_file = await Deno.open(zip_path, { read: true });
		zip_reader = new zipjs.ZipReader(zip_file);

		for await (const file of zip_reader.getEntriesGenerator()) {
			if (!file.filename.endsWith(".jar")) continue;

			mod_files.set(file.filename, {
				name: file.filename,
				mod_date: file.lastModDate.getTime(),
				size: file.uncompressedSize,
				is_optional: false,
			});
		}
	} catch {
		return undefined;
	} finally {
		zip_reader?.close();
	}

	return mod_files;
}

// TODO:
// 	what if files change between collect_branch and make_zip
// 	mods map cant remove deleted files (collect read it, but zip didnt)
export async function collect_all_branch() {
	// stop this from running after startup
	if (branches.size > 0) return;

	const BRANCHES_DIR_PATH = get_branches_dir_path();

	const branch_names: string[] = [];

	for await (const dir of Deno.readDir(BRANCHES_DIR_PATH)) {
		if (!dir.isDirectory) continue;

		const branch_name = dir.name;
		if (branch_name.startsWith(".")) continue;

		branch_names.push(branch_name);
	}

	await Promise.all(branch_names.map(async (branch_name) => {
		const mod_files_map = await collect_branch(branch_name);
		const zip_files_map = await read_client_zip(branch_name);

		let zip: ZipData;

		if (zip_files_map && compare_modfiles(zip_files_map, mod_files_map)) {
			const stats = await Deno.stat(path.join(BRANCHES_DIR_PATH, branch_name, CLIENT_MOD_ZIP_NAME));
			zip = {
				size: stats.size,
				is_present: true,
				mod_date: (stats.mtime ?? new Date(0)).getTime(),
			};
		} else {
			zip = await make_client_zip(branch_name, new Set(mod_files_map.values().map((v) => v.name)));
		}

		branches.set(branch_name, {
			zip: zip,
			mods: mod_files_map.values().toArray(),
		});

		branches_debounce.set(branch_name, new_fs_debounce());

		branches_zip_is_dirty.set(branch_name, false);
	}));
}

// https://stackoverflow.com/a/35951373
export function compare_modfiles(map1: ModFiles, map2: ModFiles) {
	if (map1.size !== map2.size) return false;

	for (const [key, val] of map1) {
		const testVal = map2.get(key);

		// No need for !map2.has(key) because value cannot be undefined thanks to typescript
		if (testVal === undefined || val.mod_date !== testVal.mod_date || val.size !== testVal.size)
			return false;
	}

	return true;
}

function new_fs_debounce() {
	return debounce(fs_event, 200);
}

// TODO: Store if branch changed while zipping (queue, last, bool, idk)
const fs_event = async (file_path: string) => {
	const BRANCHES_DIR_PATH = get_branches_dir_path();

	const rel_path = path.relative(BRANCHES_DIR_PATH, file_path);
	const branch_name = rel_path.split(path.SEPARATOR, 1)[0];

	console.log(`path: '${rel_path}', branch: ${branch_name}`);

	const mod_files_map = await collect_branch(branch_name);

	/*if (branches_zip_is_dirty.get(branch_name) === true)
		return;*/

	const branch_data = branches.get(branch_name);
	if (branch_data === undefined) {
		const zip_data = await make_client_zip(branch_name, new Set(mod_files_map.values().map((v) => v.name)));
		if (!zip_data.is_present) return;

		branches.set(branch_name, {
			mods: mod_files_map.values().toArray(),
			zip: zip_data,
		});
	} else {
		// tell zip maker that branch has changed (if the change was not the zip)
		if (!rel_path.endsWith(CLIENT_MOD_ZIP_NAME))
			branch_data.zip.size = 0;

		const zip_data = await make_client_zip(branch_name, new Set(mod_files_map.values().map((v) => v.name)));
		if (!zip_data.is_present) return;

		branch_data.zip = zip_data;
		branch_data.mods = mod_files_map.values().toArray();
	}
};

// observations (linux):
// 		renaming: 1 remove (old path), 1 rename (new path), 1 rename (old path, new path)
// 		moving: same as rename
// 		modifying: 2 modify (or 1 if everything has been deleted), 1 access
// 		deleting folder: runs from deepest part until folder
// observations (windows):
// 		renaming: 1 remove (old path), 1 rename (new path)
// 		moving: 1 remove (old path), 1 create (new path), 1 modify (old path parent)
// 		modifying: 1 modify (or 2 if everything has been deleted)
// 		deleting folder (not moving to recycle bin): runs from deepest part until folder
let _watcher_runs = false;
export async function start_watcher() {
	if (_watcher_runs) return;
	_watcher_runs = true;

	const BRANCHES_DIR_PATH = get_branches_dir_path();
	const w = Deno.watchFs(BRANCHES_DIR_PATH);

	for await (const e of w) {
		if (e.kind === "access") continue;
		e.paths.forEach((p) => {
			const rel_path = path.relative(BRANCHES_DIR_PATH, p);
			const path_parts = rel_path.split(path.SEPARATOR, 4);

			// return if there isnt a branch folder
			if (path_parts.length < 2) return;

			const branch_name = path_parts[0];

			// if path has 2 parts, then only let <branch name>/<CLIENT_MOD_ZIP_NAME>
			if (path_parts.length === 2 && path_parts[1] !== CLIENT_MOD_ZIP_NAME) return;

			const folder_name = path_parts[1];

			// if path has 3 parts, then only let <branch name>/<"both", "client_only">/<mod name>.jar
			if (
				path_parts.length === 3 && (
					!path_parts[2].endsWith(".jar") ||
					(folder_name !== "both" && folder_name !== "client_only")
				)
			) { return; }

			// if path has 4 parts, then only let <branch name>/<"both", "client_only">/optional/<mod name>.jar
			if (
				path_parts.length === 4 && (
					!path_parts[3].endsWith(".jar") ||
					path_parts[2] !== "optional" ||
					(folder_name !== "both" && folder_name !== "client_only")
				)
			) { return; }

			let fn = branches_debounce.get(branch_name);
			if (!fn) {
				fn = new_fs_debounce();
				branches_debounce.set(branch_name, fn);
			}
			fn(p);
		});
		//console.log(`kind: ${e.kind}, path(s): '${e.paths.map(v => path.relative(BRANCHES_DIR_PATH, v)).join("', '")}'`);
	}
}
