import { assertEquals, assertInstanceOf, assertNotInstanceOf } from "@std/assert";
import { afterAll, beforeAll, describe, it } from "@std/testing/bdd";
import { get_mod_path } from "../worker.ts";
import { get_branches_dir_path } from "../config.ts";
import * as path from "@std/path";
import * as fs from "@std/fs";
import { HttpError } from "jsr:@oak/commons@1/http_errors";
import { Status } from "jsr:@oak/commons@1/status";

describe("get_mod_path()", () => {
	const BRANCHES_DIR_PATH = get_branches_dir_path();

	const test_branch_name = "get_mod_path-test-dir";

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

	it("should return 404 for empty branch name", async () => {
		const res = await get_mod_path("", ".jar");
		assertInstanceOf(res, HttpError);
		assertEquals(res.status, Status.NotFound);
	});

	it("should return 404 when branch folder doesn't exists", async () => {
		const res = await get_mod_path("not-test-mods", ".jar");
		assertInstanceOf(res, HttpError);
		assertEquals(res.status, Status.NotFound);
	});

	it("should return 404 when mod_name doesn't end with jar", async () => {
		const res = await get_mod_path(test_branch_name, "a.txt");
		assertInstanceOf(res, HttpError);
		assertEquals(res.status, Status.NotFound);
	});

	it("should return 404 when mod file doesn't exists", async () => {
		const res = await get_mod_path(test_branch_name, "a.jar");
		assertInstanceOf(res, HttpError);
		assertEquals(res.status, Status.NotFound);
	});

	it("should return the path when mod exists in both optional folder", async () => {
		const file_name = "opt_b.jar";

		const file_path = path.join(test_both_optional_path, file_name);
		await Deno.writeTextFile(file_path, "test");

		const res = await get_mod_path(test_branch_name, file_name);
		assertNotInstanceOf(res, HttpError);
		assertEquals(res, path.relative(BRANCHES_DIR_PATH, file_path));
	});

	it("should return the path when mod exists in both folder", async () => {
		const file_name = "b.jar";

		const file_path = path.join(test_both_path, file_name);
		await Deno.writeTextFile(file_path, "test");

		const res = await get_mod_path(test_branch_name, file_name);
		assertNotInstanceOf(res, HttpError);
		assertEquals(res, path.relative(BRANCHES_DIR_PATH, file_path));
	});

	it("should return the path when mod exists in client folder", async () => {
		const file_name = "c.jar";

		const file_path = path.join(test_client_path, file_name);
		await Deno.writeTextFile(file_path, "test");

		const res = await get_mod_path(test_branch_name, file_name);
		assertNotInstanceOf(res, HttpError);
		assertEquals(res, path.relative(BRANCHES_DIR_PATH, file_path));
	});

	it("should return the path when mod exists in client optinal folder", async () => {
		const file_name = "opt_c.jar";

		const file_path = path.join(test_client_optional_path, file_name);
		await Deno.writeTextFile(file_path, "test");

		const res = await get_mod_path(test_branch_name, file_name);
		assertNotInstanceOf(res, HttpError);
		assertEquals(res, path.relative(BRANCHES_DIR_PATH, file_path));
	});
});
