import { Context } from "@oak/oak/context";

export interface ModFile {
	name: string;
	mod_date: number;
	size: number;
	is_optional: boolean;
}

export interface ZipData {
	size: number;
	is_present: boolean;
	mod_date: number;
}

export interface BranchData {
	zip: ZipData;
	mods: ModFile[];
}

export type ModFiles = Map<string, ModFile>;

export function pad_number(num: number, digit = 2) {
	return num.toString().padStart(digit, "0");
}

/**
 * Formats a date object into the format `yyyy. mm. dd. hh:mm:ss`
 */
export function format_date(date: Date) {
	// z as in "zero", want to keep return short
	const z = pad_number;
	return `${date.getFullYear()}.${z(date.getMonth() + 1)}.${z(date.getDate())}. ${z(date.getHours())}:${
		z(date.getMinutes())
	}:${z(date.getSeconds())}`;
}

/**
 * gets IP from a request, tries X-Real-Ip, if fails then X-Forwarded-For, if fails then the remote address
 */
export function get_ip(ctx: Context) {
	return ctx.request.headers.get("x-real-ip") ?? ctx.request.ip;
}
