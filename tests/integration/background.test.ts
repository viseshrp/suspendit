import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { suspendedUrl } from "../../entrypoints/shared/suspended";
import { createMockChrome, tab } from "../helpers/mock_chrome";

let background: typeof import("../../entrypoints/background");
beforeEach(async () => { vi.resetModules(); background = await import("../../entrypoints/background"); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it("registers native context menu on install/startup and reports registration errors", async () => {
	const { mock } = createMockChrome();
	background.registerListeners();
	mock.runtime.onInstalled.emit();
	await vi.waitFor(() => expect(mock.contextMenus.create).toHaveBeenCalled());
	expect(mock.contextMenus.create.mock.calls.map(([properties]) => properties)).toMatchObject([
		{ id: "suspend-tab", title: "Suspend this tab", contexts: ["all"] },
		{ id: "suspend-selected-tabs", title: "Suspend selected tabs", contexts: ["all"] },
	]);
	mock.runtime.onStartup.emit();
	await vi.waitFor(() => expect(mock.contextMenus.removeAll).toHaveBeenCalledTimes(2));
	const log = vi.spyOn(console, "error").mockImplementation(() => {});
	mock.runtime.lastError = { message: "Menu unavailable" };
	await background.createContextMenu();
	expect(log).toHaveBeenCalledWith("Menu unavailable");
});

it("adds the tab-strip context when Chrome exposes it", async () => {
	const { mock } = createMockChrome();
	Object.assign(mock.contextMenus, { ContextType: { TAB: "tab" } });
	await background.createContextMenu();
	expect(mock.contextMenus.create.mock.calls.map(([properties]) => properties)).toMatchObject([
		{ id: "suspend-tab", contexts: ["all", "tab"] },
		{ id: "suspend-selected-tabs", contexts: ["all", "tab"] },
	]);
});

it("routes native page-menu clicks and exposes failure in the toolbar tooltip", async () => {
	const { mock } = createMockChrome([tab(1, { active: true })]);
	const info = { menuItemId: "suspend-tab", editable: false };
	await background.suspendFromMenu({ ...info, menuItemId: "other" }, tab(1));
	await background.suspendFromMenu(info);
	expect(mock.tabs.discard).not.toHaveBeenCalled();
	await background.suspendFromMenu(info, tab(1));
	expect(mock.action.setBadgeText).toHaveBeenLastCalledWith({ tabId: 1, text: "!" });
	expect(mock.action.setTitle.mock.calls[0][0].title).toContain("Keep another tab awake");
});

it("individually suspends a protected site from the menu and clears its failure badge", async () => {
	const { mock, tabs } = createMockChrome([tab(1)], { protectedSites: ["example.com"] });
	background.registerListeners();
	mock.contextMenus.onClicked.emit({ menuItemId: "suspend-tab", editable: false }, tab(1));
	await vi.waitFor(() => expect(mock.action.setBadgeText).toHaveBeenCalledWith({ tabId: 1, text: "" }));
	expect(mock.action.setTitle).toHaveBeenCalledWith({ tabId: 1, title: "SuspendIt" });
	expect(tabs[0].url).toContain("/suspended.html#");
});

it("keeps protected sites awake when the selected menu targets the clicked window", async () => {
	const clickedTab = tab(1, { windowId: 2, active: true, highlighted: true });
	const { mock } = createMockChrome([
		clickedTab,
		tab(2, { windowId: 2, highlighted: true, url: "https://other.example/page" }),
		tab(3, { windowId: 2 }),
		tab(4, { windowId: 1, highlighted: true }),
		tab(5, { windowId: 2, highlighted: true, url: "http://Example.com:8080/protected" }),
	], { protectedSites: ["example.com"] });
	await background.suspendFromMenu({ menuItemId: "suspend-selected-tabs", editable: false }, clickedTab);
	expect(mock.tabs.query).toHaveBeenCalledWith({ windowType: "normal", windowId: 2, highlighted: true });
	expect(mock.tabs.discard.mock.calls.flat()).toEqual([2]);
});

it("accepts valid popup requests and ignores other origins or invalid messages", async () => {
	const { mock, storage } = createMockChrome([tab(1), tab(2, { highlighted: true })]);
	background.registerListeners();
	const sender = { id: "test-id", url: "chrome-extension://test-id/popup.html" };
	const request = { type: "suspend", scope: "tab", id: 1 };
	const respond = vi.fn();
	expect(mock.runtime.onMessage.emit(request, { ...sender, id: "other" }, respond)).toEqual([undefined]);
	expect(mock.runtime.onMessage.emit(request, { ...sender, url: "https://example.com" }, respond)).toEqual([undefined]);
	expect(mock.runtime.onMessage.emit(null, sender, respond)).toEqual([undefined]);
	expect(mock.runtime.onMessage.emit(request, sender, respond)).toEqual([true]);
	await vi.waitFor(() => expect(respond).toHaveBeenCalledWith({ suspended: 1, skipped: 0, failed: 0, errors: [], tabId: 1 }));
	const selectedRespond = vi.fn();
	expect(mock.runtime.onMessage.emit({ type: "suspend", scope: "selected", id: 1 }, sender, selectedRespond)).toEqual([true]);
	await vi.waitFor(() => expect(selectedRespond).toHaveBeenCalledWith({ suspended: 1, skipped: 0, failed: 0, errors: [] }));
	const protection = { type: "protection", action: "protect", site: "docs.example.com" };
	expect(mock.runtime.onMessage.emit(protection, { ...sender, id: "other" }, respond)).toEqual([undefined]);
	expect(mock.runtime.onMessage.emit(protection, { ...sender, url: "https://example.com" }, respond)).toEqual([undefined]);
	for (const invalid of [
		{ ...protection, action: "toggle" },
		...["Docs.Example.com", "docs.example.com:80", "docs.example.com/path", "", 42].map((site) => ({ ...protection, site })),
	]) expect(mock.runtime.onMessage.emit(invalid, sender, respond)).toEqual([undefined]);
	expect(mock.storage.local.set).not.toHaveBeenCalled();
	const protectionRespond = vi.fn();
	expect(mock.runtime.onMessage.emit(protection, sender, protectionRespond)).toEqual([true]);
	await vi.waitFor(() => expect(protectionRespond).toHaveBeenCalledWith({ ok: true, sites: ["docs.example.com"] }));
	expect(storage).toEqual({ protectedSites: ["docs.example.com"] });
});

it("uses the tab ID Chrome returns when native discard replaces the tab's contents", async () => {
	const { mock } = createMockChrome([tab(1), tab(20, { url: "https://example.com/1", discarded: true })]);
	mock.tabs.discard.mockResolvedValueOnce(tab(20, { url: "https://example.com/1", discarded: true }));
	await background.suspendFromMenu({ menuItemId: "suspend-tab", editable: false }, tab(1));
	expect(mock.action.setBadgeText).toHaveBeenCalledWith({ tabId: 20, text: "" });
});

it("unloads only completed inactive placeholders, including after session restoration", async () => {
	const { mock } = createMockChrome([tab(1)]);
	background.registerListeners();
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
