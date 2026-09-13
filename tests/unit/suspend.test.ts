import { afterEach, describe, expect, it, vi } from "vitest";
import { suspendTabs } from "../../entrypoints/background/suspend";
import { awakeNeighbor, isSuspendRequest, resultMessage, skipReason } from "../../entrypoints/shared/tabs";
import { getErrorMessage, runWithConcurrency } from "../../entrypoints/shared/utils";
import { createMockChrome, tab } from "../helpers/mock_chrome";

afterEach(() => vi.unstubAllGlobals());

describe("native suspension", () => {
	it("discards the original tab without replacing its URL, id, or group", async () => {
		const { mock, tabs } = createMockChrome([tab(1, { pinned: true, audible: true, groupId: 7 })]);
		expect(await suspendTabs({ type: "suspend", scope: "tab", id: 1 })).toEqual({ suspended: 1, skipped: 0, failed: 0, errors: [], tabId: 1 });
		expect(mock.tabs.discard).toHaveBeenCalledWith(1);
		expect(mock.tabs.update).not.toHaveBeenCalled();
		expect(tabs[0]).toMatchObject({ id: 1, url: "https://example.com/1", groupId: 7, discarded: true });
	});
	it("selects an existing awake neighbor before discarding an active tab", async () => {
		const { mock, tabs } = createMockChrome([tab(1, { active: true }), tab(2, { discarded: true }), tab(3), tab(4, { windowId: 2 })]);
		const result = await suspendTabs({ type: "suspend", scope: "tab", id: 1 });
		expect(result.suspended).toBe(1);
		expect(mock.tabs.update).toHaveBeenCalledWith(3, { active: true });
		expect(tabs[0].discarded).toBe(true);
		expect(tabs[1].discarded).toBe(true);
	});
	it("explains when the active tab has no awake neighbor", async () => {
		const { mock } = createMockChrome([tab(1, { active: true }), tab(2, { discarded: true }), tab(3, { windowId: 2 })]);
		const result = await suspendTabs({ type: "suspend", scope: "tab", id: 1 });
		expect(result.failed).toBe(1);
		expect(result.errors[0]).toContain("Keep another tab awake");
		expect(mock.tabs.discard).not.toHaveBeenCalled();
	});
	it("protects active, pinned, audio, browser, and already discarded tabs in every window", async () => {
		const { mock } = createMockChrome([tab(1, { active: true }), tab(2, { pinned: true }), tab(3, { audible: true }), tab(4, { discarded: true }), tab(5, { url: "chrome://settings" }), tab(6), tab(7, { windowId: 2 }), tab(8, { windowId: 2, active: true })]);
		expect(await suspendTabs({ type: "suspend", scope: "all" })).toEqual({ suspended: 2, skipped: 6, failed: 0, errors: [] });
		expect(mock.tabs.discard.mock.calls.flat()).toEqual([6, 7]);
		expect(mock.tabs.update).not.toHaveBeenCalled();
	});
	it.each(["window", "group"] as const)("limits a %s action and skips tabs that move out of scope", async (scope) => {
		const { mock } = createMockChrome([tab(1, { groupId: 1 }), tab(2, { groupId: 1 }), tab(3, { groupId: 2, windowId: 2 })]);
		mock.tabs.get.mockImplementation(async (id) => tab(id, { groupId: id === 2 ? 2 : 1, windowId: id === 2 ? 2 : 1 }));
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
	expect(isSuspendRequest({ type: "suspend", scope: "all" })).toBe(true);
});

it("describes protected or unavailable tabs and selects only awake neighbors", () => {
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
