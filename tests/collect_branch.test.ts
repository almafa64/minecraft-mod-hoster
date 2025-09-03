import { assertEquals, assertExists } from "@std/assert";
import { afterAll, beforeAll, describe, it } from "@std/testing/bdd";
import { stub } from "@std/testing/mock";
import { collect_branch } from "../worker.ts";
import * as path from "@std/path";
import * as fs from "@std/fs";
import { get_branches_dir_path } from "../config.ts";

describe("collect_branch()", () => {
	const BRANCHES_DIR_PATH = get_branches_dir_path();

	const test_branch_name = "collect_branch-test-dir";

	const test_folder_path = path.join(BRANCHES_DIR_PATH, test_branch_name);

	const test_both_path = path.join(test_folder_path, "both");
	const test_both_optional_path = path.join(test_both_path, "optional");
	const test_client_path = path.join(test_folder_path, "client_only");
	const test_client_optional_path = path.join(test_client_path, "optional");

	beforeAll(async () => {
		await fs.ensureDir(BRANCHES_DIR_PATH);

		await fs.ensureDir(test_folder_path);

		await fs.ensureDir(test_both_path);
		await fs.ensureDir(test_both_optional_path);
		await fs.ensureDir(test_client_path);
		await fs.ensureDir(test_client_optional_path);
	});

	afterAll(async () => {
		await Deno.remove(test_folder_path, { recursive: true });
	});

	it("should return empty modfiles when branch folder is empty string", async () => {
		assertEquals((await collect_branch("")).size, 0);
	});

	it("should return empty modfiles when branch folder doesnt exists", async () => {
		assertEquals((await collect_branch("not-test-mods")).size, 0);
	});

	it("should return empty modfiles when branch folder's subfolders are empty", async () => {
		assertEquals((await collect_branch(test_branch_name)).size, 0);
	});

	it("should return mod with epoch time when stats.mtime is null", async () => {
		const file_name = "e.jar";

		const file_path = path.join(test_both_path, file_name);
		await Deno.writeTextFile(file_path, "test");

		const original_stat = Deno.stat;
		using _ = stub(Deno, "stat", async (p) => {
			const stats = await original_stat(p);
			stats.mtime = null;
			return stats;
		});

		const res = await collect_branch(test_branch_name);

		await Deno.remove(file_path);

		assertEquals(res.size, 1);
		const mod = res.get(file_name);
		assertExists(mod);
		assertEquals(mod.is_optional, false);
		assertEquals(mod.name, file_name);
		assertEquals(mod.mod_date, new Date(0).getTime());
	});

	it("should return mod with optional flag when mod exists in both optional folder", async () => {
		const file_name = "opt_b.jar";

		const file_path = path.join(test_both_optional_path, file_name);
		await Deno.writeTextFile(file_path, "test");

		const res = await collect_branch(test_branch_name);

		await Deno.remove(file_path);

		assertEquals(res.size, 1);
		const mod = res.get(file_name);
		assertExists(mod);
		assertEquals(mod.is_optional, true);
		assertEquals(mod.name, file_name);
	});

	it("should return mod without optional flag when mod exists in both folder", async () => {
		const file_name = "b.jar";

		const file_path = path.join(test_both_path, file_name);
		await Deno.writeTextFile(file_path, "test");

		const res = await collect_branch(test_branch_name);

		await Deno.remove(file_path);

		assertEquals(res.size, 1);
		const mod = res.get(file_name);
		assertExists(mod);
		assertEquals(mod.is_optional, false);
		assertEquals(mod.name, file_name);
	});

	it("should return mod without optional flag when mod exists in client folder", async () => {
		const file_name = "c.jar";

		const file_path = path.join(test_client_path, file_name);
		await Deno.writeTextFile(file_path, "test");

		const res = await collect_branch(test_branch_name);

		await Deno.remove(file_path);

		assertEquals(res.size, 1);
		const mod = res.get(file_name);
		assertExists(mod);
		assertEquals(mod.is_optional, false);
		assertEquals(mod.name, file_name);
	});

	it("should return mod with optional flag when mod exists in client optional folder", async () => {
		const file_name = "opt_c.jar";

		const file_path = path.join(test_client_optional_path, file_name);
		await Deno.writeTextFile(file_path, "test");

		const res = await collect_branch(test_branch_name);

		await Deno.remove(file_path);

		assertEquals(res.size, 1);
		const mod = res.get(file_name);
		assertExists(mod);
		assertEquals(mod.is_optional, true);
		assertEquals(mod.name, file_name);
	});

	it("shoud return 4 mods with(out) optional flags in all subfolder", async () => {
		const file_both_opt_name = "opt_b.jar";
		const file_both_name = "b.jar";
		const file_client_name = "c.jar";
		const file_client_opt_name = "opt_c.jar";

		const file_both_opt_path = path.join(test_both_optional_path, file_both_opt_name);
		await Deno.writeTextFile(file_both_opt_path, "test");

		const file_both_path = path.join(test_both_path, file_both_name);
		await Deno.writeTextFile(file_both_path, "test");

		const file_client_path = path.join(test_client_path, file_client_name);
		await Deno.writeTextFile(file_client_path, "test");

		const file_client_opt_path = path.join(test_client_optional_path, file_client_opt_name);
		await Deno.writeTextFile(file_client_opt_path, "test");

		const res = await collect_branch(test_branch_name);

		await Deno.remove(file_both_opt_path);
		await Deno.remove(file_both_path);
		await Deno.remove(file_client_path);
		await Deno.remove(file_client_opt_path);

		assertEquals(res.size, 4);

		const mod_both_opt = res.get(file_both_opt_name);
		assertExists(mod_both_opt);
		assertEquals(mod_both_opt.is_optional, true);
		assertEquals(mod_both_opt.name, file_both_opt_name);

		const mod_both = res.get(file_both_name);
		assertExists(mod_both);
		assertEquals(mod_both.is_optional, false);
		assertEquals(mod_both.name, file_both_name);

		const mod_client = res.get(file_client_name);
		assertExists(mod_client);
		assertEquals(mod_client.is_optional, false);
		assertEquals(mod_client.name, file_client_name);

		const mod_client_opt = res.get(file_client_opt_name);
		assertExists(mod_client_opt);
		assertEquals(mod_client_opt.is_optional, true);
		assertEquals(mod_client_opt.name, file_client_opt_name);
	});
});
