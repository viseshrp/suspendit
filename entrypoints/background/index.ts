import { defineBackground } from "wxt/utils/define-background";
import { suspendedPage } from "../shared/suspended";
import { isSuspendRequest, resultMessage, type SuspendRequest } from "../shared/tabs";
import { suspendTabs } from "./suspend";

// @types/chrome 0.1.37 predates Chromium's tab-strip context, which the
// contextMenus schema defines as "tab".
declare global {
	namespace chrome.contextMenus {
		enum ContextType { TAB = "tab" }
	}
}

export const MENU_ID = "suspend-tab";
export const SELECTED_MENU_ID = "suspend-selected-tabs";

const MENU_ITEMS = [
	{ id: MENU_ID, title: "Suspend this tab" },
	{ id: SELECTED_MENU_ID, title: "Suspend selected tabs" },
];

export async function createContextMenu() {
	await chrome.contextMenus.removeAll();
	// "all" covers page, frame, selection, link, editable, media, and toolbar menus, not the tab strip.
	// Chrome versions without the tab-strip context reject "tab", so add it only when Chrome lists it.
	const contexts: chrome.contextMenus.CreateProperties["contexts"] =
		"TAB" in (chrome.contextMenus.ContextType ?? {}) ? ["all", "tab"] : ["all"];
	for (const item of MENU_ITEMS) {
		chrome.contextMenus.create({
			...item,
			contexts,
			documentUrlPatterns: ["http://*/*", "https://*/*", "file:///*"],
		}, () => {
			if (chrome.runtime.lastError) console.error(chrome.runtime.lastError.message);
		});
	}
}

export async function suspendFromMenu(info: chrome.contextMenus.OnClickData, tab?: chrome.tabs.Tab) {
	if (tab?.id === undefined) return;
	// A selection belongs to the clicked tab's window, not to whichever window has focus.
	const request: SuspendRequest | undefined =
		info.menuItemId === MENU_ID ? { type: "suspend", scope: "tab", id: tab.id }
		: info.menuItemId === SELECTED_MENU_ID ? { type: "suspend", scope: "selected", id: tab.windowId }
		: undefined;
	if (!request) return;
	const result = await suspendTabs(request);
	const tabId = result.tabId ?? tab.id;
	await chrome.action.setBadgeText({ tabId, text: result.failed ? "!" : "" });
	await chrome.action.setTitle({
		tabId,
		title: result.failed ? resultMessage(result) : "SuspendIt",
	});
}

export function registerListeners() {
	const install = () => { void createContextMenu().catch(console.error); };
	chrome.runtime.onInstalled.addListener(install);
	chrome.runtime.onStartup.addListener(install);
	chrome.contextMenus.onClicked.addListener((info, tab) => {
		void suspendFromMenu(info, tab).catch(console.error);
	});
	// Once navigation commits, unload the tiny placeholder too. Selecting it still
	// opens its Resume button; the original site stays unloaded until requested.
	chrome.tabs.onUpdated.addListener((_id, change, tab) => {
		if (change.status === "complete" && !tab.active && !tab.discarded && suspendedPage(tab.url)) {
			void chrome.tabs.discard(tab.id).catch(() => {});
		}
	});
	chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
		if (sender.id !== chrome.runtime.id || sender.url !== chrome.runtime.getURL("popup.html") || !isSuspendRequest(message)) return;
		void suspendTabs(message).then(sendResponse);
		return true;
	});
}

export default defineBackground(registerListeners);
