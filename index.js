"use strict"

// ---- user settings ----

const PRIVATE_KEY_PATH = "<YOUR PRIVATE SSL KEY PATH HERE>";
const CERTIFICATE_PATH = "<YOUR PUBLIC SSL KEY PATH HERE>";
const PORT = 443;

// ---- server code ----

const restify = require('restify');
const errs = require('restify-errors');
const fs = require("fs");
const fsPromise = require("fs/promises");
const path = require("path");
const archiver = require('archiver');
const { strictEqual } = require('assert');

/**	@type {restify.ServerOptions} */
const server_opts = { strictNext: true }

if(fs.existsSync(PRIVATE_KEY_PATH) && fs.existsSync(CERTIFICATE_PATH))
{
	Object.assign(server_opts, {
		key: fs.readFileSync(PRIVATE_KEY_PATH),
		certificate: fs.readFileSync(CERTIFICATE_PATH)
	});
}

const server = restify.createServer(server_opts);
const mods_path = path.resolve(".", "mods");
const static_dir_path = path.resolve(".", "static");
const main_url_path = "/minecraft/mods";
const api_url = "/api/minecraft";
const api_mods_url = `${api_url}/mods`;

/** @typedef {Map<string, number>} ModFiles */

/** @type {Map<string, ModFiles>} { dir: { filename: modify date }}*/
var all_modfiles = new Map();
/** @type {Set<string>} */
const zipping = new Set();

/**
 * https://stackoverflow.com/a/35951373
 * @param {Map} map1
 * @param {Map} map2
 * @returns {boolean} true if same
 */
function compare_maps(map1, map2) {
	if (map1.size !== map2.size) return false;

	for (const [key, val] of map1) {
		const testVal = map2.get(key);
		// in cases of an undefined value, make sure the key
		// actually exists on the object so there are no false positives
		if (testVal !== val || (testVal === undefined && !map2.has(key)))
			return false;
	}

	return true;
}

/**
 * @param {string[]} dirs
 * @returns {string}
 */
function generate_main_page(dirs)
{
	var body = '<link rel="shortcut icon" href="/minecraft/favicon.ico">';
	if(dirs.length == 0) return body + "No mods here!";

	function make_href(name) { return `${main_url_path}/${name}`};

	body += `<ul><li><a href='${make_href(dirs[0])}'>${dirs[0]}`;
	for(var i = 1; i < dirs.length; i++)
	{
		body += `</a></li><li><a href='${make_href(dirs[i])}'>${dirs[i]}`;
	}
	return body + "</a></li></ul>";
}

/**
 * @param {string} dir
 * @returns {Promise<ModFiles>}
 */
async function collect_mods(both_dir, client_dir)
{
	/** @type {ModFiles} */
	const modfiles = new Map();

	const both_files = await fsPromise.readdir(both_dir);
	const client_files = await fsPromise.readdir(client_dir);

	async function populate_modfiles(files, dir)
	{
		for(var file of files)
		{
			if(!file.endsWith(".jar")) continue;
			const filepath = path.join(dir, file);
			modfiles.set(file, (await fsPromise.stat(filepath)).mtimeMs);
		}
	}

	await populate_modfiles(both_files, both_dir);
	await populate_modfiles(client_files, client_dir);

	return modfiles;
}

server.use(restify.plugins.multipartBodyParser())

// ---- static ----

server.get('/minecraft/*', restify.plugins.serveStatic({ directory: static_dir_path, appendRequestPath: false }));

// ---- api ----

server.get(`${api_mods_url}/:name`, (req, res, next) => {
	const name = req.params.name;
	const path_name = path.join(mods_path, name);

	if(!fs.existsSync(path_name))
		return next(new errs.ResourceNotFoundError(`There is no '${name}' modpack!`));

	const both_dir = path.join(path_name, "both");
	const client_dir = path.join(path_name, "client_only");

	collect_mods(both_dir, client_dir).catch(err => next(err)).then(modfiles => {
		res.send(Object.keys(Object.fromEntries(modfiles)));
		next();
	});
});

server.get(api_mods_url, (req, res, next) => {
	fs.readdir(mods_path, {withFileTypes: true}, (err, mod_dirs) => {
		mod_dirs = mod_dirs.filter(e => e.isDirectory()).map(v => v.name);
		res.send(mod_dirs);
		next();
	});
});

// ---- mods ----

server.get(main_url_path, (req, res, next) => {
	fs.readdir(mods_path, {withFileTypes: true}, (err, mod_dirs) => {
		mod_dirs = mod_dirs.filter(e => e.isDirectory()).map(v => v.name);
		const body = generate_main_page(mod_dirs);
		res.writeHead(200, {
			"Content-Length": Buffer.byteLength(body),
			"Content-Type": "text/html"
		})
		res.end(body);
	});
});

// debug
server.on("connection", (socket) => console.log(`connection from '${socket.remoteAddress}'`))

server.get(`${main_url_path}/:name/:mod`, (req, res, next) => {
	const name = req.params.name;
	const modname = req.params.mod;
	const path_name = path.join(mods_path, name);

	if(!fs.existsSync(path_name))
		return next(new errs.ResourceNotFoundError(`There is no '${name}' modpack!`));
	
	var modpath = path.join(path_name, "both", modname);
	if(!fs.existsSync(modpath))
	{
		modpath = path.join(path_name, "client_only", modname);
		if(!fs.existsSync(modpath))
			return next(new errs.ResourceNotFoundError(`There is no '${modname}' mod in '${name}' modpack!`));
	}

	res.writeHead(200, {
		"Content-Type": "application/octet-stream",
		"Content-Disposition": `attachment;filename=${modname}`
	});

	fs.createReadStream(modpath, {highWaterMark: 1024 * 1024}).on("close", () => next()).on('error', err => {
		console.error("oh no: " + err);
		next(new errs.InternalServerError("Failed to read jar! Please try again!"));
	}).pipe(res);
});

server.get(`${main_url_path}/:name`, (req, res, next) => {
	const name = req.params.name;
	const path_name = path.join(mods_path, name);

	if(!fs.existsSync(path_name))
		return next(new errs.ResourceNotFoundError(`There is no '${name}' modpack!`));

	const zip_path = path.join(path_name, "mods.zip");

	const both_dir = path.join(path_name, "both");
	const client_dir = path.join(path_name, "client_only");

	collect_mods(both_dir, client_dir).catch(err => next(err)).then(modfiles => {
		function send_old_zip()
		{
			if(!fs.existsSync(zip_path)) return false;

			const last_modfiles = all_modfiles.get(name);
			if(last_modfiles === undefined || !compare_maps(last_modfiles, modfiles)) return false;

			res.writeHead(200, {
				"Content-Type": "application/zip",
				"Content-Disposition": `attachment;filename=${name}.zip`,
			});

			fs.createReadStream(zip_path, {highWaterMark: 1024 * 1024}).on("close", () => next()).on('error', err => {
				console.error("oh no: " + err);
				next(new errs.InternalServerError("Failed to read zip! Please try again!"));
			}).pipe(res);

			return true;
		}

		function run() {
			if(zipping.has(name))
			{
				setTimeout(run, 50);
				return true;
			}

			return send_old_zip();
		}

		if(run()) return;

		const archive = archiver('zip', { zlib: { level: 9 }});
		const writeStream = fs.createWriteStream(zip_path);

		res.writeHead(200, {
			"Content-Type": "application/octet-stream",
			"Content-Disposition": `attachment;filename=${name}.zip`
		});

		zipping.add(name);

		archive.on("close", () => {
			all_modfiles.set(name, modfiles);
			zipping.delete(name);
			next();
		}).on('error', err => {
			console.error("oh no: " + err);
			fs.rmSync(zip_path);
			zipping.delete(name);
			next(new errs.InternalServerError("Failed to archive files! Please try again!"));
		});
		archive.pipe(writeStream);
		archive.pipe(res);
		archive.glob("*.jar", { cwd: both_dir });
		archive.glob("*.jar", { cwd: client_dir });
		archive.finalize();
	});
});

server.listen(PORT, () => console.log(`${server.name} listening at ${server.url}`));