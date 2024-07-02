"use strict"

const restify = require('restify');
const errs = require('restify-errors');
const fs = require("fs");
const fsPromise = require("fs/promises");
const path = require("path");
const archiver = require('archiver');

const pkey_path = "<YOUR PRIVATE SSL KEY PATH HERE>";
const key_path = "<YOUR PUBLIC SSL KEY PATH HERE>";

const server = restify.createServer({
	strictNext: true,
	key: fs.readFileSync(pkey_path),
	certificate: fs.readFileSync(key_path),
});
const mods_path = path.resolve(".", "mods");
const main_url_path = "/minecraft/mods";

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
	if(dirs.length == 0) return "No mods here!";

	function make_href(name) { return `${main_url_path}/${name}`};

	var body = `<ul><li><a href='${make_href(dirs[0])}'>${dirs[0]}`;
	for(var i = 1; i < dirs.length; i++)
	{
		body += `</a></li><li><a href='${make_href(dirs[i])}'>${dirs[i]}`;
	}
	return body + "</a></li></ul>";
}

/**
 * @param {string} dir
 * @returns {ModFiles}
 */
async function collect_mods(dir)
{
	const files = await fsPromise.readdir(dir);

	/** @type {ModFiles} */
	const modfiles = new Map();

	for(var file of files)
	{
		if(!file.endsWith(".jar")) continue;
		const filepath = path.join(dir, file);
		modfiles.set(file, (await fsPromise.stat(filepath)).mtimeMs);
	}

	return modfiles;
}

server.use(restify.plugins.multipartBodyParser())

server.get(main_url_path, (req, res, next) => {
	fs.readdir(mods_path, (err, mod_dirs) => {
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

server.get(`${main_url_path}/:name`, (req, res, next) => {
	const name = req.params.name;
	const path_name = path.join(mods_path, name);

	if(!fs.existsSync(path_name))
		return next(new errs.ResourceNotFoundError(`There is no '${name}' modpack!`));

	const zip_path = path.join(path_name, "mods.zip");

	// ToDo dont zip for new client if already zipping -> wait for it then send it

	collect_mods(path_name).catch(err => next(err)).then(modfiles => {
		function send_old_zip()
		{
			if(!fs.existsSync(zip_path)) return false;
	
			const last_modfiles = all_modfiles.get(name);
			if(last_modfiles === undefined || !compare_maps(last_modfiles, modfiles)) return false;
			
			res.writeHead(200, {
				"Content-Type": "application/octet-stream",
				"Content-Disposition": `attachment;filename=${name}.zip` 
			});
	
			fs.createReadStream(zip_path).on("close", () => next()).on('error', err => {
				console.error("oh no: " + err);
				next(new errs.InternalServerError("Failed to read zip! Please try again!"));
			}).pipe(res);
	
			return true;
		}

		function run() {
			if(zipping.has(name))
			{
				setTimeout(run, 50);
				return false;
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
		archive.glob("*.jar", { cwd: path_name });
		archive.finalize();
	});
});

server.listen(443, () => console.log(`${server.name} listening at ${server.url}`));