import { suspendedPage } from "./suspended";

export const PROTECTED_SITES_KEY = "protectedSites";
export const READ_FAILED = "Could not read protected sites.";
export const UNREADABLE_SITES = "Saved protected sites are unreadable.";

export type ProtectionRequest =
	| { type: "protection"; action: "protect" | "unprotect"; site: string }
	| { type: "protection"; action: "clear" };
export type ProtectionReply = { ok: true; sites: string[] } | { ok: false; error: string };

export function siteHostname(address: string): string | undefined {
	// URL.hostname omits the port: https://Docs.Example.com:8443/edit -> docs.example.com.
	// It also normalizes faß.example -> xn--fa-hia.example and [0:0::1] -> [::1],
	// while example.com. keeps its trailing dot. Browser and file URLs have no site.
	// https://url.spec.whatwg.org/#dom-url-hostname
	try {
		const url = new URL(address);
		return ["http:", "https:"].includes(url.protocol) ? url.hostname : undefined;
	} catch { return undefined; }
}

export function tabSite(tab: chrome.tabs.Tab): string | undefined {
	// A placeholder saving https://docs.example.com/edit has the site docs.example.com too.
	return siteHostname(suspendedPage(tab.url)?.url ?? tab.url ?? "");
}

export function isSiteHostname(value: unknown): value is string {
	// Accept only parser output: docs.example.com survives http://docs.example.com/;
	// Docs.Example.com and docs.example.com:8443 change on that round trip and are rejected.
	return typeof value === "string" && siteHostname(`http://${value}/`) === value;
}

export function parseProtectedSites(value: unknown): Set<string> | undefined {
	if (value === undefined) return new Set();
	if (Array.isArray(value) && value.every(isSiteHostname)) return new Set(value);
	return undefined;
}

export function isProtectionRequest(value: unknown): value is ProtectionRequest {
	if (!value || typeof value !== "object") return false;
	const request = value as Partial<ProtectionRequest> & { site?: unknown };
	return request.type === "protection" && (request.action === "clear" ||
		((request.action === "protect" || request.action === "unprotect") && isSiteHostname(request.site)));
}

export function isProtectionReply(value: unknown): value is ProtectionReply {
	if (!value || typeof value !== "object") return false;
	const reply = value as Partial<ProtectionReply>;
	return reply.ok === true
		? Array.isArray(reply.sites) && reply.sites.every(isSiteHostname)
		: reply.ok === false && typeof reply.error === "string";
}
