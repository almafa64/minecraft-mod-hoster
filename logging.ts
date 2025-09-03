import { Context } from "@oak/oak/context";
import * as path from "@std/path";
import * as fs from "@std/fs";
import { DEBUG, get_logs_dir_path } from "./config.ts";
import { format_date, get_ip, pad_number } from "./global_things.ts";

export enum LOG_TAGS {
	API = "api",
	PAGE = "page",
}

const LONGEST_TAG_LENGTH = Math.max(
	...Object.values(LOG_TAGS).map((v) => v.length),
);

function get_log_name() {
	if (DEBUG) return "debug.log";

	// z as in "zero pad", want to keep return short
	const z = pad_number;
	const date = new Date();
	return `${date.getFullYear()}-${z(date.getMonth() + 1)}-${z(date.getDate())}_${z(date.getHours())}-${
		z(date.getMinutes())
	}-${z(date.getSeconds())}.log`;
}

let _log_file: Deno.FsFile | undefined = undefined;
async function setup_logging() {
	if (!_log_file) {
		const LOGS_DIR_PATH = get_logs_dir_path();

		await fs.ensureDir(LOGS_DIR_PATH);
		_log_file = await Deno.open(path.join(LOGS_DIR_PATH, get_log_name()), {
			write: true,
			create: true,
			truncate: true,
		});
	}

	return _log_file;
}

export async function tee(msg: string, file?: Deno.FsFile) {
	console.log(msg);

	const encoder = new TextEncoder();
	const data = encoder.encode(msg + "\n");

	if (file)
		await file.write(data);
	else {
		const log_file = await setup_logging();
		await log_file.write(data);
	}
}

export async function log_user_job(ctx: Context, tag: LOG_TAGS, job: string) {
	const date = new Date();
	await tee(`[${format_date(date)}] [${tag}]${" ".padEnd(LONGEST_TAG_LENGTH - tag.length + 1)}'${get_ip(ctx)}' ${job}`);
}
