import { resultMessage, skipReason, type SuspendRequest, type SuspendResult } from "../shared/tabs";
import { getErrorMessage } from "../shared/utils";
import { renderWindows } from "./render";

const search = document.getElementById("search") as HTMLInputElement;
const status = document.getElementById("status") as HTMLParagraphElement;
const suspendWindow = document.getElementById("suspend-window") as HTMLButtonElement;
const suspendAll = document.getElementById("suspend-all") as HTMLButtonElement;
let tabs: chrome.tabs.Tab[] = [];
let groups: chrome.tabGroups.TabGroup[] = [];
let currentWindowId = -1;
let busy = false;
let loaded = false;
let refreshVersion = 0;
let refreshTimer: ReturnType<typeof setTimeout> | undefined;
let renderTimer: ReturnType<typeof setTimeout> | undefined;
let tabRevision = 0;
const tabUpdates = new Map<number, { tab: chrome.tabs.Tab; revision: number }>();
const collapsed = new Set<number>();
const collapsedGroups = new Set<number>();
const searchCollapsed = new Set<number>();
const searchCollapsedGroups = new Set<number>();

function showStatus(message: string, error = false) {
	status.textContent = message;
	status.dataset.error = String(error);
}

function render() {
	const focusId = document.activeElement?.id;
	const suspended = tabs.filter((tab) => tab.discarded).length;
	(document.getElementById("counts") as HTMLElement).textContent = `${tabs.length} ${tabs.length === 1 ? "tab" : "tabs"} · ${suspended} suspended`;
	suspendWindow.disabled = busy || !tabs.some((tab) => tab.windowId === currentWindowId && !skipReason(tab, true));
	suspendAll.disabled = busy || !tabs.some((tab) => !skipReason(tab, true));
	const query = search.value.trim().toLowerCase();
	renderWindows(tabs, groups, currentWindowId, query,
		query ? searchCollapsed : collapsed, query ? searchCollapsedGroups : collapsedGroups, busy);
	if (focusId) document.getElementById(focusId)?.focus({ preventScroll: true });
}

async function refresh() {
	const version = ++refreshVersion;
	const revision = tabRevision;
	try {
		const [nextTabs, nextGroups, current] = await Promise.all([
			chrome.tabs.query({ windowType: "normal" }),
			chrome.tabGroups.query({}),
			chrome.windows.getCurrent(),
		]);
		if (version !== refreshVersion) return;
		// Keep updates that arrived while Chrome was answering this query.
		tabs = nextTabs.map((tab) => {
			const update = tab.id === undefined ? undefined : tabUpdates.get(tab.id);
			return update && update.revision > revision ? update.tab : tab;
		});
		tabUpdates.clear();
		groups = nextGroups;
		currentWindowId = current.id ?? -1;
		if (!loaded) {
			for (const tab of tabs) if (tab.windowId !== currentWindowId) collapsed.add(tab.windowId);
			loaded = true;
		}
		render();
	} catch (error) {
		if (version !== refreshVersion) return;
		suspendWindow.disabled = true;
		suspendAll.disabled = true;
		showStatus(`Could not read tabs. ${getErrorMessage(error)}`, true);
	}
}

function scheduleRefresh() {
	if (busy) return;
	++refreshVersion;
	clearTimeout(renderTimer);
	renderTimer = undefined;
	if (refreshTimer !== undefined) return;
	refreshTimer = setTimeout(() => { refreshTimer = undefined; void refresh(); }, 75);
}

function updateTab(id: number, _change: chrome.tabs.OnUpdatedInfo, next?: chrome.tabs.Tab) {
	if (busy) return;
	if (!next) { scheduleRefresh(); return; }
	tabUpdates.set(id, { tab: next, revision: ++tabRevision });
	const index = tabs.findIndex((tab) => tab.id === id);
	const previous = tabs[index];
	if (!previous || previous.windowId !== next.windowId || previous.groupId !== next.groupId || previous.index !== next.index) {
		scheduleRefresh();
		return;
	}
	tabs[index] = next;
	if (renderTimer === undefined) {
		renderTimer = setTimeout(() => { renderTimer = undefined; render(); }, 16);
	}
}

async function suspend(request: SuspendRequest) {
	if (busy) return;
	busy = true;
	render();
	showStatus("Suspending…");
	try {
		// The worker completes the action even if changing the active tab closes the popup.
		const result: SuspendResult | undefined = await chrome.runtime.sendMessage(request);
		if (!result) throw new Error("Reopen the popup and try again.");
		showStatus(resultMessage(result), result.failed > 0);
	} catch (error) {
		showStatus(`Could not suspend tabs. ${getErrorMessage(error)}`, true);
	} finally {
		busy = false;
		await refresh();
	}
}

async function openTab(id: number) {
	try {
		const tab = await chrome.tabs.update(id, { active: true });
		if (!tab) throw new Error("The tab is no longer available.");
		await chrome.windows.update(tab.windowId, { focused: true });
		window.close();
	} catch (error) {
		showStatus(`Could not open tab. ${getErrorMessage(error)}`, true);
		await refresh();
	}
}

suspendWindow.addEventListener("click", () => { void suspend({ type: "suspend", scope: "window", id: currentWindowId }); });
suspendAll.addEventListener("click", () => { void suspend({ type: "suspend", scope: "all" }); });
search.addEventListener("input", () => {
	searchCollapsed.clear();
	searchCollapsedGroups.clear();
	render();
});
// Reuse nufftabs' single delegated click handler for all rows and scope actions.
document.getElementById("windows")?.addEventListener("click", (event) => {
	const button = (event.target as Element).closest<HTMLButtonElement>("button[data-action]");
	if (!button || button.disabled || busy) return;
	const id = Number(button.dataset.id);
	if (!Number.isInteger(id) || id < 0) return;
	const action = button.dataset.action;
	if (action === "toggle" || action === "toggle-group") {
		const searching = Boolean(search.value.trim());
		const state = action === "toggle"
			? searching ? searchCollapsed : collapsed
			: searching ? searchCollapsedGroups : collapsedGroups;
		if (state.has(id)) state.delete(id); else state.add(id);
		render();
	} else if (action === "open") {
		void openTab(id);
	} else if (action === "tab" || action === "group" || action === "window") {
		void suspend({ type: "suspend", scope: action, id });
	}
});

chrome.tabs.onUpdated.addListener(updateTab);
for (const event of [chrome.tabs.onCreated, chrome.tabs.onRemoved,
	chrome.tabs.onActivated, chrome.tabs.onMoved, chrome.tabs.onAttached, chrome.tabs.onDetached,
	chrome.tabs.onReplaced, chrome.tabGroups.onCreated, chrome.tabGroups.onUpdated, chrome.tabGroups.onRemoved]) {
	event.addListener(scheduleRefresh);
}
// Chrome can cap the toolbar popup below its preferred height on a small screen.
window.addEventListener("resize", () => {
	document.documentElement.style.height = `${window.innerHeight}px`;
});
void refresh();
