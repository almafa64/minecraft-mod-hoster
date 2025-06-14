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

/** @typedef {Object} ModFile
 * @property {number} mod_date
 * @property {number} size
*/

/** @typedef {Map<string, ModFile>} ModFiles */

/** @type {Map<string, ModFiles>} { dir: { filename: modify date }}*/
var all_modfiles = new Map();
/** @type {Set<string>} */
const zipping = new Set();

function format_date(date)
{
	function z(a) { return a.toString().padStart(2,0); }
	return `${z(date.getFullYear())}.${z(date.getMonth()+1)}.${z(date.getDate())}. ${z(date.getHours())}:${z(date.getMinutes())}:${z(date.getSeconds())}`;
}

/**
 * @param {Request} req
 * @param {string} job
 */
function log_user_job(req, job)
{
	const date = new Date();
	console.log(`[${format_date(date)}] '${get_ip(req)}' ${job}`);
}

/**
 * @param {Request} req
 */
function get_ip(req) { return req.header("x-real-ip") || req.connection.remoteAddress; }

/**
 * https://stackoverflow.com/a/35951373
 * @param {ModFiles} map1
 * @param {ModFiles} map2
 * @returns {boolean} true if same
 */
function compare_modfiles(map1, map2) {
	if (map1.size !== map2.size) return false;

	for (const [key, val] of map1) {
		const testVal = map2.get(key);
		// in cases of an undefined value, make sure the key
		// actually exists on the object so there are no false positives
		if ((testVal !== undefined && val.mod_date == testVal.mod_date && val.size == testVal.size) || (testVal === undefined && !map2.has(key)))
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

	body += `<ul>`;
	for(var i = 0; i < dirs.length; i++)
	{
		body += `<li><a href='${make_href(dirs[i])}'>${dirs[i]}</a></li>`;
	}
	return body + "</ul>";
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
			const stats = await fsPromise.stat(filepath);
			/** @type {ModFile} */
			const modfile = {
				mod_date: stats.mtimeMs,
				size: stats.size,
			};
			modfiles.set(file, modfile);
		}
	}

	await populate_modfiles(both_files, both_dir);
	await populate_modfiles(client_files, client_dir);

	return modfiles;
}

server.use(restify.plugins.multipartBodyParser())
server.use(restify.plugins.queryParser())

// ---- static ----

server.get('/minecraft/*', restify.plugins.serveStatic({ directory: static_dir_path, appendRequestPath: false }));

// ---- api ----

server.get(`${api_mods_url}/:name`, (req, res, next) => {
	const api_version = req.query["v"] || "1";
	const name = req.params.name;
	const path_name = path.join(mods_path, name);

	if(!fs.existsSync(path_name))
		return next(new errs.ResourceNotFoundError(`There is no '${name}' modpack!`));

	log_user_job(req, `[api] getting '${name}' folder`);

	const both_dir = path.join(path_name, "both");
	const client_dir = path.join(path_name, "client_only");

	collect_mods(both_dir, client_dir).catch(err => next(err)).then(modfiles => {
		if(api_version == "2")
			res.send(Object.fromEntries(modfiles));
		else 
			res.send(Object.keys(Object.fromEntries(modfiles)));
		
		next();
	});
});

server.get(api_mods_url, (req, res, next) => {
	log_user_job(req, `[api] getting folders`);

	fs.readdir(mods_path, {withFileTypes: true}, (err, mod_dirs) => {
		mod_dirs = mod_dirs.filter(e => e.isDirectory()).map(v => v.name);
		res.send(mod_dirs);
		next();
	});
});

// ---- mods ----

server.get(main_url_path, (req, res, next) => {
	log_user_job(req, `getting versions`);

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

	log_user_job(req, `getting '${modname}' from '${name}'`);

	res.writeHead(200, {
		"Content-Length": fs.statSync(modpath).size,
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

	log_user_job(req, `getting '${name}' zip`);

	collect_mods(both_dir, client_dir).catch(err => next(err)).then(modfiles => {
		function send_old_zip()
		{
			if(!fs.existsSync(zip_path)) return false;

			const last_modfiles = all_modfiles.get(name);
			if(last_modfiles === undefined || !compare_modfiles(last_modfiles, modfiles)) return false;

			res.writeHead(200, {
				"Content-Length": fs.statSync(zip_path).size,
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
