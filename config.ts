import * as path from "@std/path";

const PORT = 3009;

const STATIC_DIR_PATH = path.resolve(".", "static");

const BRANCH_DIR_PATH = path.resolve(".", "branches");

const LOGS_DIR_PATH = path.resolve(".", "logs");

export const CLIENT_MOD_ZIP_NAME = "client_mods.zip";

// TODO: this should be removed
export const MAIN_URL_PATH = "/minecraft";

// TODO: remove
export const DEBUG = true;

// deno-coverage-ignore-start
export function get_port() {
	return PORT;
}
export function get_static_dir_path() {
	return STATIC_DIR_PATH;
}
export function get_branches_dir_path() {
	return BRANCH_DIR_PATH;
}
export function get_logs_dir_path() {
	return LOGS_DIR_PATH;
}
// deno-coverage-ignore-stop
