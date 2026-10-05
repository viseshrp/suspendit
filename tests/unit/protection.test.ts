import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { tabSite } from "../../entrypoints/shared/protection";
import { createMockChrome, tab } from "../helpers/mock_chrome";

let protection: typeof import("../../entrypoints/background/protection");

beforeEach(async () => {
	vi.resetModules();
	protection = await import("../../entrypoints/background/protection");
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function gate() {
	let release = () => {};
	const promise = new Promise<void>((resolve) => { release = resolve; });
	return { promise, release };
}

it("identifies exact normalized sites from web pages and saved pages", () => {
	createMockChrome();
	const cases: [string | undefined, string | undefined][] = [
		["https://Docs.Example.com:8443/edit", "docs.example.com"],
		["http://docs.example.com/view", "docs.example.com"],
		["https://other.example.com/", "other.example.com"],
		["https://example.com./", "example.com."],
		["https://faß.example/", "xn--fa-hia.example"],
		["http://[0:0::1]:8080/", "[::1]"],
		["http://0xffffffff/", "255.255.255.255"],
		["chrome-extension://test-id/suspended.html#url=https%3A%2F%2FDocs.Example.com%3A8443%2Fedit", "docs.example.com"],
		["file:///tmp/note.html", undefined],
		["chrome://settings/", undefined],
		["not a url", undefined],
		[undefined, undefined],
	];
	for (const [url, expected] of cases) expect(tabSite(tab(1, { url })), url).toBe(expected);
});

it("serializes site changes and restores the saved list after a worker restart", async () => {
	const { mock, storage } = createMockChrome();
	protection.watchProtection();
	const replies = await Promise.all([
		protection.changeProtection({ type: "protection", action: "protect", site: "z.example" }),
		protection.changeProtection({ type: "protection", action: "protect", site: "a.example" }),
		protection.changeProtection({ type: "protection", action: "protect", site: "z.example" }),
		protection.changeProtection({ type: "protection", action: "unprotect", site: "z.example" }),
	]);
	expect(replies).toEqual([
		{ ok: true, sites: ["z.example"] },
		{ ok: true, sites: ["a.example", "z.example"] },
		{ ok: true, sites: ["a.example", "z.example"] },
		{ ok: true, sites: ["a.example"] },
	]);
	expect(storage).toEqual({ protectedSites: ["a.example"] });
	expect(mock.storage.local.set).toHaveBeenCalledTimes(3);
	expect(mock.tabs.update).not.toHaveBeenCalled();
	expect(mock.tabs.discard).not.toHaveBeenCalled();
	vi.resetModules();
	const restarted = await import("../../entrypoints/background/protection");
	expect([...await restarted.loadProtection()]).toEqual(["a.example"]);
	expect(restarted.siteProtection(tab(1, { url: "https://a.example/" }))).toBe("protected");
	expect(await restarted.changeProtection({ type: "protection", action: "unprotect", site: "absent.example" }))
		.toEqual({ ok: true, sites: ["a.example"] });
	expect(mock.storage.local.set).toHaveBeenCalledTimes(3);
});

it("keeps a site protected until every queued change to it has replied", async () => {
	const { mock } = createMockChrome([], { protectedSites: ["docs.example.com"] });
	await protection.loadProtection();
	const saving = gate();
	const finish = gate();
	const set = mock.storage.local.set.getMockImplementation();
	if (!set) throw new Error("Missing storage mock");
	mock.storage.local.set.mockImplementationOnce(set).mockImplementationOnce(async (values) => {
		saving.release();
		await finish.promise;
		await set(values);
	});
	const target = tab(1, { url: "https://docs.example.com/" });
	const unprotect = protection.changeProtection({ type: "protection", action: "unprotect", site: "docs.example.com" });
	const protect = protection.changeProtection({ type: "protection", action: "protect", site: "docs.example.com" });
	expect(protection.siteProtection(target)).toBe("protected");
	expect(await unprotect).toEqual({ ok: true, sites: [] });
	await saving.promise;
	expect(protection.siteProtection(target)).toBe("protected");
	finish.release();
	expect(await protect).toEqual({ ok: true, sites: ["docs.example.com"] });
	expect(protection.siteProtection(target)).toBe("protected");
});

it("preserves saved protection after a failed write and processes the next change", async () => {
	const { mock, storage } = createMockChrome([], { protectedSites: ["saved.example"] });
	await protection.loadProtection();
	mock.storage.local.set.mockRejectedValueOnce(new Error("Storage full"));
	const failed = protection.changeProtection({ type: "protection", action: "unprotect", site: "saved.example" });
	const next = protection.changeProtection({ type: "protection", action: "protect", site: "next.example" });
	expect(await failed).toMatchObject({ ok: false, error: expect.stringContaining("Storage full") });
	expect(await next).toEqual({ ok: true, sites: ["next.example", "saved.example"] });
	expect(storage.protectedSites).toEqual(["next.example", "saved.example"]);
});

it.each([null, "docs.example.com", ["Docs.Example.com"], ["docs.example.com", 42]])
("keeps unreadable saved data blocked until explicitly cleared: %j", async (saved) => {
	const { mock, storage } = createMockChrome([], { protectedSites: saved });
	await expect(protection.loadProtection()).rejects.toThrow();
	expect(protection.siteProtection(tab(1))).toBe("unavailable");
	expect(await protection.changeProtection({ type: "protection", action: "protect", site: "example.com" }))
		.toMatchObject({ ok: false });
	expect(mock.storage.local.set).not.toHaveBeenCalled();
	expect(await protection.changeProtection({ type: "protection", action: "clear" })).toEqual({ ok: true, sites: [] });
	expect(storage.protectedSites).toEqual([]);
	expect(protection.siteProtection(tab(1))).toBe("allowed");
});

it("does not clear a list repaired after an unreadable result", async () => {
	const { mock, storage } = createMockChrome([], { protectedSites: null });
	await expect(protection.loadProtection()).rejects.toThrow();
	storage.protectedSites = ["saved.example"];
	expect(await protection.changeProtection({ type: "protection", action: "clear" }))
		.toEqual({ ok: true, sites: ["saved.example"] });
	expect(mock.storage.local.set).not.toHaveBeenCalled();
});

it("ignores a stale startup read after saved protection changes", async () => {
	const { mock } = createMockChrome();
	const finishRead = gate();
	mock.storage.local.get.mockImplementationOnce(async () => {
		await finishRead.promise;
		return { protectedSites: ["old.example"] };
	});
	protection.watchProtection();
	const loading = protection.loadProtection();
	await mock.storage.local.set({ protectedSites: ["new.example"] });
	finishRead.release();
	expect([...await loading]).toEqual(["new.example"]);
	expect(protection.siteProtection(tab(1, { url: "https://old.example/" }))).toBe("allowed");
	expect(protection.siteProtection(tab(2, { url: "https://new.example/" }))).toBe("protected");
});

it("reads the saved list after an external change during a write and a late event", async () => {
	const { mock, storage } = createMockChrome();
	protection.watchProtection();
	await protection.loadProtection();
	const set = mock.storage.local.set.getMockImplementation();
	if (!set) throw new Error("Missing storage mock");
	mock.storage.local.set.mockImplementationOnce(async (values) => {
		await set(values);
		storage.protectedSites = ["external.example"];
		mock.storage.local.onChanged.emit({ protectedSites: { newValue: ["external.example"] } });
		await protection.loadProtection();
	});
	expect(await protection.changeProtection({ type: "protection", action: "protect", site: "own.example" }))
		.toEqual({ ok: true, sites: ["external.example"] });
	mock.storage.local.onChanged.emit({ protectedSites: { newValue: ["own.example"] } });
	mock.storage.local.onChanged.emit({ unrelated: { newValue: true } });
	expect([...await protection.loadProtection()]).toEqual(["external.example"]);
	expect(protection.siteProtection(tab(1, { url: "https://own.example/" }))).toBe("allowed");
	expect(protection.siteProtection(tab(2, { url: "https://external.example/" }))).toBe("protected");
});
