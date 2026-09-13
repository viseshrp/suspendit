import { defineBackground } from "wxt/utils/define-background";
import { isSuspendRequest, resultMessage } from "../shared/tabs";
import { suspendTabs } from "./suspend";

export const MENU_ID = "suspend-tab";

export async function createContextMenu() {
	await chrome.contextMenus.removeAll();
	chrome.contextMenus.create({
		id: MENU_ID,
		title: "Suspend this tab",
		contexts: ["all"],
		documentUrlPatterns: ["http://*/*", "https://*/*", "file:///*"],
	}, () => {
		if (chrome.runtime.lastError) console.error(chrome.runtime.lastError.message);
	});
}

export async function suspendFromMenu(info: chrome.contextMenus.OnClickData, tab?: chrome.tabs.Tab) {
	if (info.menuItemId !== MENU_ID || tab?.id === undefined) return;
	const result = await suspendTabs({ type: "suspend", scope: "tab", id: tab.id });
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
	chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
		if (sender.id !== chrome.runtime.id || sender.url !== chrome.runtime.getURL("popup.html") || !isSuspendRequest(message)) return;
		void suspendTabs(message).then(sendResponse);
		return true;
	});
}

export default defineBackground(registerListeners);
