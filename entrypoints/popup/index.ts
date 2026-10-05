import {
	PROTECTED_SITES_KEY, READ_FAILED, UNREADABLE_SITES, isProtectionReply, parseProtectedSites,
	type ProtectionRequest,
} from "../shared/protection";
import { isSuspended, suspendedPage } from "../shared/suspended";
import { resultMessage, type SuspendRequest, type SuspendResult } from "../shared/tabs";
import { getErrorMessage } from "../shared/utils";
import { isBulkEligible, renderProtectedSites, renderWindows, type ProtectionView } from "./render";

const search = document.getElementById("search") as HTMLInputElement;
const status = document.getElementById("status") as HTMLParagraphElement;
const suspendWindow = document.getElementById("suspend-window") as HTMLButtonElement;
const suspendSelected = document.getElementById("suspend-selected") as HTMLButtonElement;
const suspendAll = document.getElementById("suspend-all") as HTMLButtonElement;
const protectionNote = document.getElementById("protection-note") as HTMLParagraphElement;
const protectionRetry = document.getElementById("protection-retry") as HTMLButtonElement;
const protectionClear = document.getElementById("protection-clear") as HTMLButtonElement;
const protectedSummary = document.getElementById("protected-summary") as HTMLElement;
const PROTECTION_NOTE = "Bulk actions keep active, pinned, audio, and protected-site tabs awake.";
let protectedSites: Set<string> | undefined;
let protectionProblem = "";
let unreadableSites = false;
let protectionVersion = 0;
const savingSites = new Set<string>();
let clearingSites = false;
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
	const protection = protectionView();
	const suspended = tabs.filter(isSuspended).length;
	(document.getElementById("counts") as HTMLElement).textContent = `${tabs.length} ${tabs.length === 1 ? "tab" : "tabs"} · ${suspended} suspended`;
	suspendWindow.disabled = busy || !tabs.some((tab) => tab.windowId === currentWindowId && isBulkEligible(tab, protection));
	suspendSelected.disabled = busy || !tabs.some((tab) => tab.windowId === currentWindowId && tab.highlighted && isBulkEligible(tab, protection));
	suspendAll.disabled = busy || !tabs.some((tab) => isBulkEligible(tab, protection));
	const query = search.value.trim().toLowerCase();
	renderWindows(tabs, groups, currentWindowId, query,
		query ? searchCollapsed : collapsed, query ? searchCollapsedGroups : collapsedGroups, busy, protection);
	renderProtection();
	if (focusId) document.getElementById(focusId)?.focus({ preventScroll: true });
}

function protectionView(): ProtectionView {
	return { sites: protectedSites, saving: savingSites, paused: !protectedSites || protectionProblem !== "" };
}

function renderProtection() {
	renderProtectedSites(protectionView());
	const focus = document.activeElement;
	const note = protectionProblem || (protectedSites ? PROTECTION_NOTE : "Reading protected sites…");
	if (protectionNote.textContent !== note) protectionNote.textContent = note;
	protectionNote.dataset.error = String(Boolean(protectionProblem));
	protectionRetry.hidden = !protectionProblem;
	protectionClear.hidden = !unreadableSites;
	if ((focus === protectionRetry && protectionRetry.hidden) || (focus === protectionClear && protectionClear.hidden)) {
		protectedSummary.focus({ preventScroll: true });
	}
}

function showProtection() {
	// Until the first tab query finishes, update only the protection UI so #counts keeps its loading text.
	if (loaded) render();
	else renderProtection();
}

async function readProtection() {
	const version = ++protectionVersion;
	try {
		const stored = await chrome.storage.local.get(PROTECTED_SITES_KEY);
		if (version !== protectionVersion) return;
		protectedSites = parseProtectedSites(stored[PROTECTED_SITES_KEY]);
		unreadableSites = protectedSites === undefined;
		protectionProblem = unreadableSites ? `${UNREADABLE_SITES} Bulk actions are paused until you clear them.` : "";
	} catch (error) {
		if (version !== protectionVersion) return;
		protectedSites = undefined;
		unreadableSites = false;
		protectionProblem = `${READ_FAILED} Bulk actions are paused. ${getErrorMessage(error)}`;
	}
	showProtection();
}

async function sendProtectionChange(request: ProtectionRequest): Promise<string> {
	const version = protectionVersion;
	try {
		const reply: unknown = await chrome.runtime.sendMessage(request);
		if (!isProtectionReply(reply)) return "Reopen the popup and try again.";
		if (!reply.ok) return reply.error;
		// A storage read started after this request owns the newer view.
		if (version === protectionVersion) {
			protectionVersion++;
			protectedSites = new Set(reply.sites);
			protectionProblem = "";
			unreadableSites = false;
		}
		return "";
	} catch (error) {
		return getErrorMessage(error);
	}
}

async function setProtection(site: string, protect: boolean) {
	if (savingSites.has(site)) return;
	savingSites.add(site);
	showProtection();
	const error = await sendProtectionChange({ type: "protection", action: protect ? "protect" : "unprotect", site });
	savingSites.delete(site);
	if (error) {
		protectionProblem = protect
			? `Could not protect ${site}. Bulk actions are paused until Retry succeeds. ${error}`
			: `Could not remove protection for ${site}. Bulk actions are paused until Retry succeeds. ${error}`;
	} else {
		showStatus(protect ? `${site} is protected from bulk suspension.` : `${site} is no longer protected.`);
	}
	showProtection();
}

async function clearSavedSites() {
	if (clearingSites) return;
	clearingSites = true;
	protectionClear.setAttribute("aria-disabled", "true");
	const error = await sendProtectionChange({ type: "protection", action: "clear" });
	clearingSites = false;
	protectionClear.removeAttribute("aria-disabled");
	if (error) protectionProblem = `Could not clear protected sites. ${error}`;
	else showStatus("Protected sites are readable again.");
	showProtection();
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
		suspendSelected.disabled = true;
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
		const current = await chrome.tabs.get(id);
		const saved = suspendedPage(current.url);
		const tab = await chrome.tabs.update(id, { active: true, ...(saved ? { url: saved.url } : {}) });
		if (!tab) throw new Error("The tab is no longer available.");
		await chrome.windows.update(tab.windowId, { focused: true });
		window.close();
	} catch (error) {
		showStatus(`Could not open tab. ${getErrorMessage(error)}`, true);
		await refresh();
	}
}

suspendWindow.addEventListener("click", () => { void suspend({ type: "suspend", scope: "window", id: currentWindowId }); });
suspendSelected.addEventListener("click", () => { void suspend({ type: "suspend", scope: "selected", id: currentWindowId }); });
suspendAll.addEventListener("click", () => { void suspend({ type: "suspend", scope: "all" }); });
search.addEventListener("input", () => {
	searchCollapsed.clear();
	searchCollapsedGroups.clear();
	render();
});
// Reuse nufftabs' single delegated click handler for all rows and scope actions.
document.getElementById("windows")?.addEventListener("click", (event) => {
	const button = (event.target as Element).closest<HTMLButtonElement>("button[data-action]");
	if (!button || button.disabled) return;
	// Shields carry data-site instead of data-id, and protection can change while a suspension runs.
	if (button.dataset.action === "protect") {
		const site = button.dataset.site;
		if (site) void setProtection(site, button.getAttribute("aria-pressed") !== "true");
		return;
	}
	if (busy) return;
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

document.getElementById("protected-list")?.addEventListener("click", (event) => {
	const button = (event.target as Element).closest<HTMLButtonElement>("button[data-site]");
	const site = button?.dataset.site;
	if (site) void setProtection(site, false);
});
protectionRetry.addEventListener("click", () => { void readProtection(); });
protectionClear.addEventListener("click", () => { void clearSavedSites(); });
chrome.storage.local.onChanged.addListener((changes) => {
	if (PROTECTED_SITES_KEY in changes) void readProtection();
});
void readProtection();

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
