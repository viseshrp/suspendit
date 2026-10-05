import {
	PROTECTED_SITES_KEY, READ_FAILED, UNREADABLE_SITES, parseProtectedSites, tabSite,
	type ProtectionReply, type ProtectionRequest,
} from "../shared/protection";
import { getErrorMessage } from "../shared/utils";

export const PROTECTION_UNAVAILABLE = "Protected sites are unavailable, so this tab stayed awake. Try again.";
export const PROTECTION_CHANGED = "Site protection changed while suspending. Chrome had already unloaded the tab; it keeps its address and reloads when selected.";

let sites: Set<string> | undefined;
let revision = 0;
let reading: Promise<ReadonlySet<string>> | undefined;
let writing: ReadonlySet<string> | undefined;
let writes: Promise<unknown> = Promise.resolve();
const changing = new Map<string, number>();

export function watchProtection() {
	// Register before reading so a change cannot be missed during worker startup.
	// https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/events
	chrome.storage.local.onChanged.addListener(handleStorageChange);
	void loadProtection().catch(console.error);
}

export function loadProtection(): Promise<ReadonlySet<string>> {
	if (sites) return Promise.resolve(sites);
	reading ??= readStoredSites().finally(() => { reading = undefined; });
	return reading;
}

async function readStoredValue(): Promise<unknown> {
	try {
		const stored = await chrome.storage.local.get(PROTECTED_SITES_KEY);
		return stored[PROTECTED_SITES_KEY];
	} catch (error) {
		throw new Error(`${READ_FAILED} ${getErrorMessage(error)}`);
	}
}

async function readStoredSites(): Promise<ReadonlySet<string>> {
	// Read again only when a storage change arrived during this read.
	for (;;) {
		const started = revision;
		const value = await readStoredValue();
		if (sites) return sites;
		if (revision !== started) continue;
		const stored = parseProtectedSites(value);
		if (!stored) throw new Error(UNREADABLE_SITES);
		sites = stored;
		return stored;
	}
}

function sameSites(a: ReadonlySet<string>, b: ReadonlySet<string> | undefined): boolean {
	return b !== undefined && a.size === b.size && [...a].every((site) => b.has(site));
}

function handleStorageChange(changes: { [key: string]: chrome.storage.StorageChange }) {
	if (!(PROTECTED_SITES_KEY in changes)) return;
	const changed = parseProtectedSites(changes[PROTECTED_SITES_KEY].newValue);
	// Own writes need no read. Never install event payloads: an older event may arrive late.
	if (changed && (sameSites(changed, writing) || sameSites(changed, sites))) return;
	sites = undefined;
	revision++;
	void loadProtection().catch(console.error);
}

export function changeProtection(request: ProtectionRequest): Promise<ProtectionReply> {
	const site = request.action === "clear" ? undefined : request.site;
	// Hold the site before queuing so a bulk action cannot pass an accepted change.
	if (site !== undefined) changing.set(site, (changing.get(site) ?? 0) + 1);
	const change = writes.then(() => applyChange(request));
	writes = change.catch(() => {});
	return change.then(
		(saved): ProtectionReply => ({ ok: true, sites: [...saved].sort() }),
		(error): ProtectionReply => ({ ok: false, error: getErrorMessage(error) }),
	).finally(() => { if (site !== undefined) release(site); });
}

function release(site: string) {
	const remaining = (changing.get(site) ?? 1) - 1;
	if (remaining) changing.set(site, remaining);
	else changing.delete(site);
}

async function applyChange(request: ProtectionRequest): Promise<ReadonlySet<string>> {
	if (request.action === "clear") return clearUnreadableSites();
	const current = await loadProtection();
	const next = new Set(current);
	if (request.action === "protect") next.add(request.site);
	else next.delete(request.site);
	return next.size === current.size ? current : saveSites(next);
}

async function clearUnreadableSites(): Promise<ReadonlySet<string>> {
	const value = await readStoredValue();
	return parseProtectedSites(value) ? loadProtection() : saveSites(new Set());
}

async function saveSites(next: Set<string>): Promise<ReadonlySet<string>> {
	const before = revision;
	writing = next;
	try {
		// Unique hostnames are sorted for storage and replies: {b.example, a.example}
		// becomes ["a.example", "b.example"]. No page path or title is saved.
		// https://developer.chrome.com/docs/extensions/reference/api/storage/StorageArea#method-set
		await chrome.storage.local.set({ [PROTECTED_SITES_KEY]: [...next].sort() });
	} catch (error) {
		sites = undefined;
		revision++;
		throw new Error(`Could not save protected sites. ${getErrorMessage(error)}`);
	} finally {
		writing = undefined;
	}
	const unchanged = revision === before;
	revision++;
	if (unchanged) {
		sites = next;
		return next;
	}
	// A change from elsewhere requires a read that starts after this write finishes.
	sites = undefined;
	return loadProtection();
}

export function siteProtection(tab: chrome.tabs.Tab): "allowed" | "protected" | "unavailable" {
	const site = tabSite(tab);
	if (!site) return "allowed";
	if (changing.has(site) || sites?.has(site)) return "protected";
	return sites ? "allowed" : "unavailable";
}
