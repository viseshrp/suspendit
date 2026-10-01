import { afterEach, expect, it, vi } from "vitest";
import { createContextMenu, registerListeners, suspendFromMenu } from "../../entrypoints/background";
import { suspendedUrl } from "../../entrypoints/shared/suspended";
import { createMockChrome, tab } from "../helpers/mock_chrome";

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it("registers native context menu on install/startup and reports registration errors", async () => {
	const { mock } = createMockChrome();
	registerListeners();
	mock.runtime.onInstalled.emit();
	await vi.waitFor(() => expect(mock.contextMenus.create).toHaveBeenCalled());
	expect(mock.contextMenus.create.mock.calls[0][0]).toMatchObject({ id: "suspend-tab", title: "Suspend this tab", contexts: ["all"] });
	mock.runtime.onStartup.emit();
	await vi.waitFor(() => expect(mock.contextMenus.removeAll).toHaveBeenCalledTimes(2));
	const log = vi.spyOn(console, "error").mockImplementation(() => {});
	mock.runtime.lastError = { message: "Menu unavailable" };
	await createContextMenu();
	expect(log).toHaveBeenCalledWith("Menu unavailable");
});

it("routes native page-menu clicks and exposes failure in the toolbar tooltip", async () => {
	const { mock } = createMockChrome([tab(1, { active: true })]);
	const info = { menuItemId: "suspend-tab", editable: false };
	await suspendFromMenu({ ...info, menuItemId: "other" }, tab(1));
	await suspendFromMenu(info);
	expect(mock.tabs.discard).not.toHaveBeenCalled();
	await suspendFromMenu(info, tab(1));
	expect(mock.action.setBadgeText).toHaveBeenLastCalledWith({ tabId: 1, text: "!" });
	expect(mock.action.setTitle.mock.calls[0][0].title).toContain("Keep another tab awake");
});

it("suspends menu targets and clears an earlier failure badge", async () => {
	const { mock } = createMockChrome([tab(1)]);
	registerListeners();
	mock.contextMenus.onClicked.emit({ menuItemId: "suspend-tab", editable: false }, tab(1));
	await vi.waitFor(() => expect(mock.action.setBadgeText).toHaveBeenCalledWith({ tabId: 1, text: "" }));
	expect(mock.action.setTitle).toHaveBeenCalledWith({ tabId: 1, title: "SuspendIt" });
});

it("accepts valid popup requests and ignores other origins or invalid messages", async () => {
	const { mock } = createMockChrome([tab(1)]);
	registerListeners();
	const sender = { id: "test-id", url: "chrome-extension://test-id/popup.html" };
	const request = { type: "suspend", scope: "tab", id: 1 };
	const respond = vi.fn();
	expect(mock.runtime.onMessage.emit(request, { ...sender, id: "other" }, respond)).toEqual([undefined]);
	expect(mock.runtime.onMessage.emit(request, { ...sender, url: "https://example.com" }, respond)).toEqual([undefined]);
	expect(mock.runtime.onMessage.emit(null, sender, respond)).toEqual([undefined]);
	expect(mock.runtime.onMessage.emit(request, sender, respond)).toEqual([true]);
	await vi.waitFor(() => expect(respond).toHaveBeenCalledWith({ suspended: 1, skipped: 0, failed: 0, errors: [], tabId: 1 }));
});

it("uses the tab ID Chrome returns when native discard replaces the tab's contents", async () => {
	const { mock } = createMockChrome([tab(1), tab(20, { url: "https://example.com/1", discarded: true })]);
	mock.tabs.discard.mockResolvedValueOnce(tab(20, { url: "https://example.com/1", discarded: true }));
	await suspendFromMenu({ menuItemId: "suspend-tab", editable: false }, tab(1));
	expect(mock.action.setBadgeText).toHaveBeenCalledWith({ tabId: 20, text: "" });
});

it("unloads only completed inactive placeholders, including after session restoration", async () => {
	const { mock } = createMockChrome([tab(1)]);
	registerListeners();
	const saved = tab(1, { url: suspendedUrl(tab(1)) });
	for (const candidate of [tab(1), { ...saved, active: true }, { ...saved, discarded: true }]) {
		mock.tabs.onUpdated.emit(1, { status: "complete" }, candidate);
	}
	mock.tabs.onUpdated.emit(1, { status: "loading" }, saved);
	expect(mock.tabs.discard).not.toHaveBeenCalled();
	mock.tabs.onUpdated.emit(1, { status: "complete" }, saved);
	await vi.waitFor(() => expect(mock.tabs.discard).toHaveBeenCalledWith(1));
	mock.tabs.discard.mockRejectedValueOnce(new Error("Tab activated"));
	mock.tabs.onUpdated.emit(1, { status: "complete" }, saved);
	await vi.waitFor(() => expect(mock.tabs.discard).toHaveBeenCalledTimes(2));
});
