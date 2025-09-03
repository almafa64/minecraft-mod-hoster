import { Application } from "@oak/oak/application";
import * as api from "./api.ts";
import * as page from "./page.ts";
import * as path from "@std/path";
import { get_branches_dir_path, get_port, get_static_dir_path, MAIN_URL_PATH } from "./config.ts";
import * as fs from "@std/fs";
import { collect_all_branch, start_watcher } from "./worker.ts";
import { tee } from "./logging.ts";

const STATIC_URL_PATH = `${MAIN_URL_PATH}/static/`;
const STATIC_DIR_PATH = get_static_dir_path();

await fs.ensureDir(get_branches_dir_path());
await fs.ensureDir(STATIC_DIR_PATH);

await collect_all_branch();
start_watcher();

const app = new Application({ proxy: true });

app.use(api.router.routes());
app.use(api.router.allowedMethods());
app.use(api.router_old.routes());
app.use(api.router_old.allowedMethods());
app.use(page.router.routes());
app.use(page.router.allowedMethods());

// static content
app.use(async (context, next) => {
	if (!context.request.url.pathname.startsWith(STATIC_URL_PATH)) {
		await next();
		return;
	}

	context.request.url.pathname = context.request.url.pathname.replace(STATIC_URL_PATH, "");

	try {
		await context.send({ root: STATIC_DIR_PATH });
	} catch {
		await next();
	}
});

app.addEventListener("listen", ({ port }) => tee(`listening on :${port}`));
app.listen({ port: get_port() });
