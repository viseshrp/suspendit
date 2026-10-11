import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { suspendedPage, suspendedUrl } from "../../entrypoints/shared/suspended";
import { awakeNeighbor, isSuspendRequest, resultMessage, skipReason } from "../../entrypoints/shared/tabs";
import { getErrorMessage, runWithConcurrency } from "../../entrypoints/shared/utils";
import { createMockChrome, tab } from "../helpers/mock_chrome";

let suspendTabs: typeof import("../../entrypoints/background/suspend").suspendTabs;

beforeEach(async () => {
	vi.resetModules();
	({ suspendTabs } = await import("../../entrypoints/background/suspend"));
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("suspension", () => {
	it("individually suspends a protected site while preserving its ID, group, and pin", async () => {
		const { mock, tabs } = createMockChrome([tab(1, { pinned: true, audible: true, groupId: 7 })], { protectedSites: ["example.com"] });
		mock.storage.local.get.mockRejectedValue(new Error("Storage unavailable"));
		expect(await suspendTabs({ type: "suspend", scope: "tab", id: 1 })).toEqual({ suspended: 1, skipped: 0, failed: 0, errors: [], tabId: 1 });
		expect(mock.tabs.discard).toHaveBeenCalledWith(1);
		expect(mock.tabs.discard.mock.invocationCallOrder[0]).toBeLessThan(mock.tabs.update.mock.invocationCallOrder[0]);
		expect(suspendedPage(tabs[0].url)).toEqual({ url: "https://example.com/1", title: "Tab 1" });
		expect(tabs[0]).toMatchObject({ id: 1, groupId: 7, pinned: true });
		expect(mock.storage.local.get).not.toHaveBeenCalled();
	});
	it("selects an existing awake neighbor before discarding an active tab", async () => {
		const { mock, tabs } = createMockChrome([tab(1, { active: true }), tab(2, { discarded: true }), tab(3), tab(4, { windowId: 2 })]);
		const result = await suspendTabs({ type: "suspend", scope: "tab", id: 1 });
		expect(result.suspended).toBe(1);
		expect(mock.tabs.update).toHaveBeenCalledWith(3, { active: true });
		expect(suspendedPage(tabs[0].url)).toBeDefined();
		expect(tabs[1].discarded).toBe(true);
	});
	it("explains when the active tab has no awake neighbor", async () => {
		const { mock } = createMockChrome([tab(1, { active: true }), tab(2, { discarded: true }), tab(3, { windowId: 2 })]);
		const result = await suspendTabs({ type: "suspend", scope: "tab", id: 1 });
		expect(result.failed).toBe(1);
		expect(result.errors[0]).toContain("Keep another tab awake");
		expect(mock.tabs.discard).not.toHaveBeenCalled();
	});
	it("skips active, pinned, audio, browser, and placeholder tabs in every window", async () => {
		const { mock, tabs } = createMockChrome([tab(1, { active: true }), tab(2, { pinned: true }), tab(3, { audible: true }), tab(4, { discarded: true }), tab(5, { url: "chrome://settings" }), tab(6), tab(7, { windowId: 2 }), tab(8, { windowId: 2, active: true })]);
		tabs[3].url = suspendedUrl(tabs[3]);
		expect(await suspendTabs({ type: "suspend", scope: "all" })).toEqual({ suspended: 2, skipped: 6, failed: 0, errors: [] });
		expect(mock.tabs.discard.mock.calls.flat()).toEqual([6, 7]);
		expect(mock.tabs.update).toHaveBeenCalledTimes(2);
	});
	it.each(["group", "window", "selected", "all"] as const)("skips only the protected hostname in a %s action", async (scope) => {
		const { mock, tabs } = createMockChrome([
			tab(1, { groupId: 1, highlighted: true, url: "https://Docs.Example.com:8443/edit" }),
			tab(2, { groupId: 1, highlighted: true, url: "http://docs.example.com/view" }),
			tab(3, { groupId: 1, highlighted: true, url: "https://other.example.com/" }),
			tab(4, { groupId: 1, highlighted: true, url: "https://example.com/" }),
			tab(5, { groupId: 1, highlighted: true, url: "https://child.docs.example.com/" }),
		], { protectedSites: ["docs.example.com"] });
		expect(await suspendTabs({ type: "suspend", scope, id: 1 }))
			.toEqual({ suspended: 3, skipped: 2, failed: 0, errors: [] });
		expect(mock.tabs.discard.mock.calls.flat().sort()).toEqual([3, 4, 5]);
		expect(tabs[0]).toMatchObject({ url: "https://Docs.Example.com:8443/edit", discarded: false });
		expect(tabs[1]).toMatchObject({ url: "http://docs.example.com/view", discarded: false });
	});
	it.each(["unavailable", "unreadable"] as const)("stops bulk suspension before touching tabs when storage is %s", async (state) => {
		const { mock } = createMockChrome([tab(1), tab(2, { url: "file:///tmp/note.html" })], { protectedSites: null });
		if (state === "unavailable") mock.storage.local.get.mockRejectedValue(new Error("Storage unavailable"));
		expect(await suspendTabs({ type: "suspend", scope: "all" }))
			.toMatchObject({ suspended: 0, skipped: 0, failed: 1, errors: [expect.any(String)] });
		expect(mock.tabs.query).not.toHaveBeenCalled();
		expect(mock.tabs.discard).not.toHaveBeenCalled();
		expect(mock.tabs.update).not.toHaveBeenCalled();
	});
	it("keeps web pages awake while changed settings are being read but can suspend local files", async () => {
		const { mock, tabs } = createMockChrome([tab(1), tab(2, { url: "file:///tmp/note.html" })]);
		const protection = await import("../../entrypoints/background/protection");
		protection.watchProtection();
		await protection.loadProtection();
		let finishRead = () => {};
		const reading = new Promise<void>((resolve) => { finishRead = resolve; });
		const query = mock.tabs.query.getMockImplementation();
		if (!query) throw new Error("Missing mock implementation");
		mock.tabs.query.mockImplementationOnce(async (criteria) => {
			mock.storage.local.get.mockImplementationOnce(async () => {
				await reading;
				return { protectedSites: [] };
			});
			mock.storage.local.onChanged.emit({ protectedSites: { newValue: ["example.com"] } });
			return query(criteria);
		});
		expect(await suspendTabs({ type: "suspend", scope: "all" }))
			.toMatchObject({ suspended: 1, skipped: 0, failed: 1 });
		expect(mock.tabs.discard.mock.calls.flat()).toEqual([2]);
		expect(tabs[0]).toMatchObject({ url: "https://example.com/1", discarded: false });
		finishRead();
		await protection.loadProtection();
	});
	it("keeps the original address when a site becomes protected during native discard", async () => {
		const { mock, tabs } = createMockChrome([tab(1)]);
		const protection = await import("../../entrypoints/background/protection");
		const discard = mock.tabs.discard.getMockImplementation();
		if (!discard) throw new Error("Missing mock implementation");
		mock.tabs.discard.mockImplementationOnce(async (id) => {
			const discarded = await discard(id);
			await protection.changeProtection({ type: "protection", action: "protect", site: "example.com" });
			return discarded;
		});
		expect(await suspendTabs({ type: "suspend", scope: "all" }))
			.toMatchObject({ suspended: 0, skipped: 0, failed: 1 });
		expect(tabs[0]).toMatchObject({ url: "https://example.com/1", discarded: true });
		expect(mock.tabs.update).not.toHaveBeenCalled();
	});
	it("suspends only eligible highlighted tabs in the requested window", async () => {
		const { mock } = createMockChrome([
			tab(1, { active: true, highlighted: true }),
			tab(2, { highlighted: true }),
			tab(3),
			tab(4, { pinned: true, highlighted: true }),
			tab(5, { audible: true, highlighted: true }),
			tab(6, { windowId: 2, highlighted: true }),
		]);
		expect(await suspendTabs({ type: "suspend", scope: "selected", id: 1 })).toEqual({ suspended: 1, skipped: 3, failed: 0, errors: [] });
		expect(mock.tabs.discard.mock.calls.flat()).toEqual([2]);
	});
	it("skips a selected tab that loses its highlight before suspension", async () => {
		const { mock, tabs } = createMockChrome([tab(1, { highlighted: true })]);
		const query = mock.tabs.query.getMockImplementation();
		if (!query) throw new Error("Missing mock implementation");
		mock.tabs.query.mockImplementationOnce(async (criteria) => {
			const matches = await query(criteria);
			tabs[0].highlighted = false;
			return matches;
		});
		expect(await suspendTabs({ type: "suspend", scope: "selected", id: 1 })).toEqual({ suspended: 0, skipped: 1, failed: 0, errors: [] });
		expect(mock.tabs.discard).not.toHaveBeenCalled();
	});
	it.each(["window", "group"] as const)("limits a %s action and skips tabs that move out of scope", async (scope) => {
		const { mock } = createMockChrome([tab(1, { groupId: 1 }), tab(2, { groupId: 1 }), tab(3, { groupId: 2, windowId: 2 })]);
		const get = mock.tabs.get.getMockImplementation();
		if (!get) throw new Error("Missing mock implementation");
		mock.tabs.get.mockImplementation(async (id) => ({ ...await get(id), groupId: id === 2 ? 2 : 1, windowId: id === 2 ? 2 : 1 }));
		expect(await suspendTabs({ type: "suspend", scope, id: 1 })).toMatchObject({ suspended: 1, skipped: 1 });
		expect(mock.tabs.discard.mock.calls.flat()).toEqual([1]);
	});
	it("reports per-tab failures and continues processing other tabs", async () => {
		const { mock } = createMockChrome([tab(1), tab(2)]);
		mock.tabs.discard.mockRejectedValueOnce(new Error("Chrome refused this tab"));
		expect(await suspendTabs({ type: "suspend", scope: "all" })).toEqual({ suspended: 1, skipped: 0, failed: 1, errors: ["Chrome refused this tab"] });
	});
	it("does not count an empty Chrome result as success", async () => {
		const { mock } = createMockChrome([tab(1)]);
		mock.tabs.discard.mockResolvedValueOnce(undefined as never);
		expect(await suspendTabs({ type: "suspend", scope: "all" })).toMatchObject({ suspended: 0, failed: 1 });
	});
	it("converts a previously discarded tab without reloading its site", async () => {
		const { mock, tabs } = createMockChrome([tab(1, { discarded: true })]);
		expect(await suspendTabs({ type: "suspend", scope: "all" })).toMatchObject({ suspended: 1, failed: 0 });
		expect(mock.tabs.discard).not.toHaveBeenCalled();
		expect(suspendedPage(tabs[0].url)?.url).toBe("https://example.com/1");
	});
	it.each([
		{ active: true }, { pendingUrl: "https://example.com/new" }, { url: "https://example.com/new" },
		{ discarded: false }, { pinned: true }, { groupId: 2 },
	])("does not replace a tab changed during discard: %j", async (change) => {
		const { mock, tabs } = createMockChrome([tab(1, { groupId: 1 })]);
		mock.tabs.discard.mockImplementationOnce(async () => {
			Object.assign(tabs[0], { discarded: true }, change);
			return tab(1, { discarded: true });
		});
		expect(await suspendTabs({ type: "suspend", scope: "group", id: 1 })).toMatchObject({ suspended: 0, failed: 1 });
		expect(mock.tabs.update).not.toHaveBeenCalled();
	});
	it.each(["window", "selected"] as const)("does not replace a tab moved to another window during %s suspension", async (scope) => {
		const { mock, tabs } = createMockChrome([tab(1, { highlighted: true })]);
		mock.tabs.discard.mockImplementationOnce(async () => {
			Object.assign(tabs[0], { discarded: true, windowId: 2 });
			return { ...tabs[0] };
		});
		expect(await suspendTabs({ type: "suspend", scope, id: 1 })).toMatchObject({ failed: 1 });
		expect(mock.tabs.update).not.toHaveBeenCalled();
	});
	it("leaves the original address recoverable if placeholder navigation fails", async () => {
		const { mock, tabs } = createMockChrome([tab(1), tab(2)]);
		mock.tabs.update.mockRejectedValueOnce(new Error("Navigation refused"));
		mock.tabs.update.mockResolvedValueOnce(undefined as never);
		expect(await suspendTabs({ type: "suspend", scope: "all" })).toMatchObject({ suspended: 0, failed: 2 });
		for (const item of tabs) expect(item).toMatchObject({ url: `https://example.com/${item.id}`, discarded: true });
	});
	it("handles closed tabs, query failures, and tabs without IDs", async () => {
		const { mock } = createMockChrome([tab(1, { id: undefined })]);
		expect(await suspendTabs({ type: "suspend", scope: "all" })).toMatchObject({ skipped: 1 });
		expect(await suspendTabs({ type: "suspend", scope: "tab", id: 9 })).toMatchObject({ failed: 1 });
		mock.tabs.query.mockRejectedValueOnce("Browser busy");
		expect(await suspendTabs({ type: "suspend", scope: "all" })).toMatchObject({ errors: ["Browser busy"] });
	});
});

it("validates messages before invoking a tab API", () => {
	for (const value of [null, 4, {}, { type: "other", scope: "all" }, { type: "suspend", scope: "no" }, { type: "suspend", scope: "tab", id: -1 }, { type: "suspend", scope: "tab", id: 1.2 }, { type: "suspend", scope: "tab", id: "1" }]) expect(isSuspendRequest(value)).toBe(false);
	expect(isSuspendRequest({ type: "suspend", scope: "tab", id: 0 })).toBe(true);
	expect(isSuspendRequest({ type: "suspend", scope: "selected", id: 0 })).toBe(true);
	expect(isSuspendRequest({ type: "suspend", scope: "all" })).toBe(true);
});

it("describes protected or unavailable tabs and selects only awake neighbors", () => {
	createMockChrome();
	expect(skipReason(tab(-1), false)).toBe("Tab unavailable");
	expect(skipReason(tab(1, { url: undefined }), false)).toBe("Browser page");
	expect(skipReason(tab(1, { pendingUrl: "chrome://settings" }), false)).toBe("Browser page");
	expect(awakeNeighbor(tab(4), [tab(1), tab(2), tab(3, { status: "unloaded" })])?.id).toBe(2);
	expect(resultMessage({ suspended: 1, skipped: 2, failed: 1, errors: ["No tab"] })).toBe("1 tab suspended · 2 skipped · 1 failed. No tab");
	expect(resultMessage({ suspended: 0, skipped: 0, failed: 0, errors: [] })).toBe("0 tabs suspended.");
	expect(getErrorMessage("Oops")).toBe("Oops");
});

it("bounds work in flight and handles empty lists", async () => {
	let active = 0;
	let peak = 0;
	const visited: number[] = [];
	await runWithConcurrency([1, 2, 3, 4, 5], 2, async (id) => {
		active++; peak = Math.max(peak, active);
		await Promise.resolve(); visited.push(id); active--;
	});
	expect(peak).toBe(2);
	expect(visited).toHaveLength(5);
	await runWithConcurrency([], 4, vi.fn());
	await runWithConcurrency([undefined], 1, vi.fn());
});
