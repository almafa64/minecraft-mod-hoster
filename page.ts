import { Router } from "@oak/oak/router";
import { LOG_TAGS, log_user_job } from "./logging.ts";
import { get_branches_dir_path, MAIN_URL_PATH } from "./config.ts";
import { get_branch_names, get_mod_path, get_zip_path } from "./worker.ts";
import { HttpError } from "jsr:@oak/commons@1/http_errors";
import * as path from "@std/path";

const PAGE_URL_PATH = "/mods";

export const router = new Router({ prefix: MAIN_URL_PATH });

function generate_branch_list_page(branch_names: string[]) {
	let body = '<html><link rel="shortcut icon" href="/minecraft/static/favicon.ico">';

	if (branch_names.length == 0) return body + "No mods here!</html>";

	function make_href(name: string) {
		return `${MAIN_URL_PATH}${PAGE_URL_PATH}/${name}`;
	}

	body += `<ul>`;
	for (const branch_name of branch_names)
		body += `<li><a href='${make_href(branch_name)}'>${branch_name}</a></li>`;
	return body + "</ul></html>";
}

router.get(PAGE_URL_PATH, async (ctx) => {
	await log_user_job(ctx, LOG_TAGS.PAGE, `getting versions`);

	ctx.response.body = generate_branch_list_page(await get_branch_names());
});

router.get(`${PAGE_URL_PATH}/:branch`, async (ctx) => {
	const branch_name = ctx.params.branch;

	await log_user_job(ctx, LOG_TAGS.PAGE, `getting '${branch_name}' zip`);

	const zip_path = await get_zip_path(branch_name);
	if (zip_path instanceof HttpError) {
		ctx.response.with(zip_path.asResponse({ prefer: "html" }));
		return;
	}

	const stat = await Deno.stat(path.join(get_branches_dir_path(), zip_path));
	ctx.response.headers.set("Content-Length", stat.size.toString());
	ctx.response.headers.set("Content-Disposition", `attachment;filename=${branch_name}.zip`);
	await ctx.send({ path: zip_path, root: get_branches_dir_path() });
});

router.get(`${PAGE_URL_PATH}/:branch/:mod`, async (ctx) => {
	const branch_name = ctx.params.branch;
	const mod_name = ctx.params.mod;

	await log_user_job(ctx, LOG_TAGS.PAGE, `getting '${mod_name}' from '${branch_name}'`);

	const mod_path = await get_mod_path(branch_name, mod_name);
	if (mod_path instanceof HttpError) {
		ctx.response.with(mod_path.asResponse({ prefer: "html" }));
		return;
	}

	const stat = await Deno.stat(path.join(get_branches_dir_path(), mod_path));
	ctx.response.headers.set("Content-Length", stat.size.toString());
	ctx.response.headers.set("Content-Disposition", `attachment;filename=${mod_name}`);
	await ctx.send({ path: mod_path, root: get_branches_dir_path() });
});
