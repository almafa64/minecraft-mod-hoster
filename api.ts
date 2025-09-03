import { Router } from "@oak/oak/router";
import { LOG_TAGS, log_user_job } from "./logging.ts";
import { MAIN_URL_PATH } from "./config.ts";
import { get_branch, get_branch_names } from "./worker.ts";
import { HttpError } from "jsr:@oak/commons@1/http_errors";

const API_URL = `${MAIN_URL_PATH}/api`;
const API_MODS_URL = "/mods";
const API_URL_OLD = `/api${MAIN_URL_PATH}`;

export const router = new Router({ prefix: API_URL });

router.get(API_MODS_URL, async (ctx) => {
	await log_user_job(ctx, LOG_TAGS.API, `getting branches`);

	ctx.response.body = await get_branch_names();
});

router.get(`${API_MODS_URL}/:branch`, async (ctx) => {
	const branch_name = ctx.params.branch;

	await log_user_job(ctx, LOG_TAGS.API, `getting '${branch_name}' branch`);

	const branch_data = await get_branch(branch_name);
	if (branch_data instanceof HttpError) {
		ctx.response.with(branch_data.asResponse());
		return;
	}

	ctx.response.body = branch_data;
});

// ----- These are old, they wont get update -----

export const router_old = new Router({ prefix: API_URL_OLD });

router_old.get(API_MODS_URL, async (ctx) => {
	await log_user_job(ctx, LOG_TAGS.API, `getting branches`);

	ctx.response.body = await get_branch_names();
});

router_old.get(`${API_MODS_URL}/:branch`, async (ctx) => {
	const branch_name = ctx.params.branch;

	await log_user_job(ctx, LOG_TAGS.API, `getting '${branch_name}' branch`);

	const branch_data = await get_branch(branch_name);
	if (branch_data instanceof HttpError) {
		ctx.response.with(branch_data.asResponse());
		return;
	}

	ctx.response.body = branch_data.mods.map((v) => v.name);
});
