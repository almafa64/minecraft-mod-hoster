import { assertEquals, assertInstanceOf, assertNotInstanceOf } from "@std/assert";
import { afterAll, beforeAll, describe, it } from "@std/testing/bdd";
import { get_zip_path } from "../worker.ts";
import { CLIENT_MOD_ZIP_NAME, get_branches_dir_path } from "../config.ts";
import * as path from "@std/path";
import * as fs from "@std/fs";
import { HttpError } from "jsr:@oak/commons@1/http_errors";
import { Status } from "jsr:@oak/commons@1/status";

describe("get_zip_path()", () => {
	const BRANCHES_DIR_PATH = get_branches_dir_path();

	const test_branch_name = "get_zip_path-test-dir";

	const test_folder_path = path.join(BRANCHES_DIR_PATH, test_branch_name);

	beforeAll(async () => {
		await fs.ensureDir(BRANCHES_DIR_PATH);

		await fs.ensureDir(test_folder_path);
	});

	afterAll(async () => {
		await Deno.remove(test_folder_path, { recursive: true });
	});

	it("should return 404 for empty branch name", async () => {
		const res = await get_zip_path("");
		assertInstanceOf(res, HttpError);
		assertEquals(res.status, Status.NotFound);
	});

	it("should return 404 when branch folder doesn't exists", async () => {
		const res = await get_zip_path("not-test-mods");
		assertInstanceOf(res, HttpError);
		assertEquals(res.status, Status.NotFound);
	});

	it(`should return 404 when zip is not named '${CLIENT_MOD_ZIP_NAME}'`, async () => {
		const file_path = path.join(test_folder_path, "a.zip");
		await Deno.writeTextFile(file_path, "test");

		const res = await get_zip_path(test_branch_name);
		assertInstanceOf(res, HttpError);
		assertEquals(res.status, Status.NotFound);
	});

	it(`should return the path when zip is named '${CLIENT_MOD_ZIP_NAME}'`, async () => {
		const file_path = path.join(test_folder_path, CLIENT_MOD_ZIP_NAME);
		await Deno.writeTextFile(file_path, "test");

		const res = await get_zip_path(test_branch_name);
		assertNotInstanceOf(res, HttpError);
		assertEquals(res, path.relative(BRANCHES_DIR_PATH, file_path));
	});
});
