import { assertEquals } from "@std/assert";
import { beforeEach, describe, it } from "@std/testing/bdd";
import { compare_modfiles } from "../worker.ts";
import { ModFiles } from "../global_things.ts";

describe("compare_modfiles()", () => {
	let map1: ModFiles;
	let map2: ModFiles;

	beforeEach(() => {
		map1 = new Map();
		map2 = new Map();
	});

	it("should return true for empty maps", () => {
		assertEquals(compare_modfiles(map1, map2), true);
	});

	it("should return true for equal maps", () => {
		map1.set("test.jar", {
			name: "test.jar",
			mod_date: 420,
			size: 69,
			is_optional: false,
		});

		map2.set("test.jar", {
			name: "test.jar",
			mod_date: 420,
			size: 69,
			is_optional: false,
		});

		assertEquals(compare_modfiles(map1, map2), true);
	});

	it("should return false for differently named mods", () => {
		map1.set("test.jar", {
			name: "test.jar",
			mod_date: 420,
			size: 69,
			is_optional: false,
		});

		map2.set("apple.jar", {
			name: "apple.jar",
			mod_date: 420,
			size: 69,
			is_optional: false,
		});

		assertEquals(compare_modfiles(map1, map2), false);
	});

	it("should return false for differently sized mods", () => {
		map1.set("test.jar", {
			name: "test.jar",
			mod_date: 420,
			size: 69,
			is_optional: false,
		});

		map2.set("test.jar", {
			name: "test.jar",
			mod_date: 420,
			size: 1337,
			is_optional: false,
		});

		assertEquals(compare_modfiles(map1, map2), false);
	});

	it("should return false for differently dated mods", () => {
		map1.set("test.jar", {
			name: "test.jar",
			mod_date: 420,
			size: 69,
			is_optional: false,
		});

		map2.set("test.jar", {
			name: "test.jar",
			mod_date: 8008,
			size: 69,
			is_optional: false,
		});

		assertEquals(compare_modfiles(map1, map2), false);
	});

	it("should return false for differently sized maps", () => {
		map2.set("test.jar", {
			name: "test.jar",
			mod_date: 420,
			size: 69,
			is_optional: false,
		});

		assertEquals(compare_modfiles(map1, map2), false);
	});
});
