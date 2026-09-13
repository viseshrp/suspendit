import { skipReason } from "../shared/tabs";

const groupColors: Record<chrome.tabGroups.TabGroup["color"], string> = {
	grey: "#89918b", blue: "#6895d4", red: "#d47b7b", yellow: "#ba983f",
	green: "#6b9e79", pink: "#c887ad", purple: "#a48acb", cyan: "#63a9b4", orange: "#c58c5d",
};
const rows = new Map<string, ReturnType<typeof createRow>>();
const windows = new Map<number, { element: HTMLElement; value: string }>();
const groupViews = new Map<number, { element: HTMLElement; value: string }>();

function clone(id: string) {
	const template = document.getElementById(id) as HTMLTemplateElement;
	return template.content.firstElementChild?.cloneNode(true) as HTMLElement;
}

function createRow() {
	const element = clone("tab-template");
	const icon = element.querySelector(".tab-favicon") as HTMLImageElement;
	icon.addEventListener("error", () => { icon.hidden = true; });
	return {
		element, icon, value: "", iconPage: "",
		title: element.querySelector(".tab-title") as HTMLElement,
		meta: element.querySelector(".tab-meta") as HTMLElement,
		open: element.querySelector(".tab-link") as HTMLButtonElement,
		suspend: element.querySelector(".tab-suspend") as HTMLButtonElement,
	};
}

function tabKey(tab: chrome.tabs.Tab) {
	return tab.id === undefined || tab.id < 0 ? `unavailable-${tab.windowId}-${tab.index}` : String(tab.id);
}

function tabRow(tab: chrome.tabs.Tab, hasNeighbor: boolean, busy: boolean) {
	const key = tabKey(tab);
	let row = rows.get(key);
	if (!row) { row = createRow(); rows.set(key, row); }
	const reason = skipReason(tab, false) || (tab.active && !hasNeighbor ? "Keep another tab awake in this window" : "");
	const value = JSON.stringify([tab.title, tab.url, tab.active, tab.discarded, tab.audible, tab.pinned, tab.favIconUrl, reason, busy]);
	if (row.value === value) return row.element;
	row.value = value;
	row.element.dataset.tabId = key;
	row.element.dataset.suspended = String(tab.discarded);
	const title = tab.title || tab.url || "Untitled tab";
	let host = "Browser page";
	try {
		const url = new URL(tab.url ?? "");
		host = url.protocol === "file:" ? "Local file" : url.hostname || "Browser page";
	} catch { /* A new tab may not have a URL yet. */ }
	const iconPage = JSON.stringify([tab.url, tab.favIconUrl]);
	if (row.iconPage !== iconPage) {
		row.iconPage = iconPage;
		row.icon.hidden = true;
		row.icon.removeAttribute("src");
		if (/^https?:\/\//i.test(tab.url ?? "")) {
			const favicon = new URL(chrome.runtime.getURL("_favicon/"));
			favicon.searchParams.set("pageUrl", tab.url as string);
			favicon.searchParams.set("size", "32");
			row.icon.src = favicon.href;
			row.icon.hidden = false;
		}
	}
	row.title.textContent = title;
	const state = tab.discarded ? "Suspended" : tab.active ? "Active" : tab.audible ? "Audio" : tab.pinned ? "Pinned" : "";
	row.meta.textContent = `${host}${state ? ` · ${state}` : ""}`;
	row.open.dataset.id = String(tab.id);
	row.open.id = `open-${key}`;
	row.open.title = title;
	row.open.setAttribute("aria-label", `${tab.discarded ? "Resume" : "Open"} ${title}`);
	row.open.disabled = busy || tab.id === undefined;
	row.suspend.dataset.id = String(tab.id);
	row.suspend.id = `suspend-${key}`;
	row.suspend.setAttribute("aria-label", `Suspend ${title}`);
	row.suspend.title = reason || (tab.active ? "Switch to a nearby awake tab and suspend this tab" : `Suspend ${title}`);
	row.suspend.disabled = busy || Boolean(reason);
	return row.element;
}

// Keep existing elements in place. Only insert, move, or remove changed children.
function syncChildren(parent: HTMLElement, children: HTMLElement[]) {
	let next = parent.firstElementChild;
	for (const child of children) {
		if (child === next) next = next.nextElementSibling;
		else parent.insertBefore(child, next);
	}
	while (next) {
		const removed = next;
		next = next.nextElementSibling;
		removed.remove();
	}
}

export function renderWindows(
	tabs: chrome.tabs.Tab[],
	groups: chrome.tabGroups.TabGroup[],
	currentWindowId: number,
	query: string,
	collapsed: Set<number>,
	collapsedGroups: Set<number>,
	busy: boolean,
) {
	const groupMap = new Map(groups.map((group) => [group.id, group]));
	const byWindow = new Map<number, { tabs: chrome.tabs.Tab[]; eligible: number; awake: number }>();
	const groupCounts = new Map<number, { total: number; eligible: number }>();
	const liveRows = new Set<string>();
	// Count membership and eligibility once, including tabs hidden by the search.
	for (const tab of tabs) {
		liveRows.add(tabKey(tab));
		let window = byWindow.get(tab.windowId);
		if (!window) { window = { tabs: [], eligible: 0, awake: 0 }; byWindow.set(tab.windowId, window); }
		window.tabs.push(tab);
		const eligible = Number(!skipReason(tab, true));
		window.eligible += eligible;
		if (tab.id !== undefined && !tab.discarded && tab.status !== "unloaded") window.awake++;
		if (groupMap.has(tab.groupId)) {
			let count = groupCounts.get(tab.groupId);
			if (!count) { count = { total: 0, eligible: 0 }; groupCounts.set(tab.groupId, count); }
			count.total++;
			count.eligible += eligible;
		}
	}
	const orderedWindows = [...byWindow.entries()].sort(([a], [b]) => a === currentWindowId ? -1 : b === currentWindowId ? 1 : a - b);
	const windowElements: HTMLElement[] = [];
	let matches = 0;
	for (const [index, [windowId, window]] of orderedWindows.entries()) {
		const visible = window.tabs.sort((a, b) => a.index - b.index).filter((tab) => !query ||
			`${tab.title ?? ""} ${tab.url ?? ""} ${groupMap.get(tab.groupId)?.title ?? ""}`.toLowerCase().includes(query));
		if (!visible.length) continue;
		matches += visible.length;
		let view = windows.get(windowId);
		if (!view) { view = { element: clone("window-template"), value: "" }; windows.set(windowId, view); }
		const name = windowId === currentWindowId ? "This window" : `Window ${index + 1}`;
		const expanded = !collapsed.has(windowId);
		const value = JSON.stringify([name, window.tabs.length, expanded, window.eligible > 0, busy]);
		const body = view.element.querySelector(".window-tabs") as HTMLElement;
		if (view.value !== value) {
			view.value = value;
			view.element.dataset.windowId = String(windowId);
			(view.element.querySelector(".window-name") as HTMLElement).textContent = name;
			(view.element.querySelector(".window-count") as HTMLElement).textContent = String(window.tabs.length);
			const toggle = view.element.querySelector(".window-toggle") as HTMLButtonElement;
			toggle.dataset.id = String(windowId);
			toggle.id = `toggle-${windowId}`;
			toggle.setAttribute("aria-expanded", String(expanded));
			toggle.setAttribute("aria-controls", `window-tabs-${windowId}`);
			const suspend = view.element.querySelector(".scope-button") as HTMLButtonElement;
			suspend.dataset.id = String(windowId);
			suspend.id = `window-${windowId}`;
			suspend.setAttribute("aria-label", `Suspend ${name.toLowerCase()}`);
			suspend.title = "Suspend eligible tabs in the entire window";
			suspend.disabled = busy || !window.eligible;
			body.id = `window-tabs-${windowId}`;
			body.hidden = !expanded;
		}
		const children: HTMLElement[] = [];
		const groupRows = new Map<number, HTMLElement[]>();
		for (const tab of visible) {
			const ownAwake = Number(tab.id !== undefined && !tab.discarded && tab.status !== "unloaded");
			const row = tabRow(tab, window.awake > ownAwake, busy);
			const group = groupMap.get(tab.groupId);
			if (!group) { children.push(row); continue; }
			let members = groupRows.get(group.id);
			if (!members) {
				members = [];
				groupRows.set(group.id, members);
				let view = groupViews.get(group.id);
				if (!view) { view = { element: clone("group-template"), value: "" }; groupViews.set(group.id, view); }
				const count = groupCounts.get(group.id) as { total: number; eligible: number };
				const title = group.title || "Untitled group";
				const expanded = !collapsedGroups.has(group.id);
				const value = JSON.stringify([title, group.color, count.total, count.eligible > 0, expanded, busy]);
				if (view.value !== value) {
					view.value = value;
					view.element.dataset.groupId = String(group.id);
					view.element.style.setProperty("--group-color", groupColors[group.color]);
					(view.element.querySelector(".group-name") as HTMLElement).textContent = title;
					(view.element.querySelector(".group-count") as HTMLElement).textContent = String(count.total);
					const toggle = view.element.querySelector(".group-toggle") as HTMLButtonElement;
					toggle.id = `toggle-group-${group.id}`;
					toggle.dataset.id = String(group.id);
					toggle.setAttribute("aria-expanded", String(expanded));
					toggle.setAttribute("aria-controls", `group-tabs-${group.id}`);
					toggle.setAttribute("aria-label", `${expanded ? "Collapse" : "Expand"} group ${title}`);
					const button = view.element.querySelector(".scope-button") as HTMLButtonElement;
					button.dataset.id = String(group.id);
					button.id = `group-${group.id}`;
					button.title = "Suspend eligible tabs in the entire group";
					button.setAttribute("aria-label", `Suspend group ${title}`);
					button.disabled = busy || !count.eligible;
					const body = view.element.querySelector(".group-tabs") as HTMLElement;
					body.id = `group-tabs-${group.id}`;
					body.hidden = !expanded;
				}
				children.push(view.element);
			}
			members.push(row);
		}
		for (const [id, members] of groupRows) {
			const view = groupViews.get(id) as { element: HTMLElement };
			syncChildren(view.element.querySelector(".group-tabs") as HTMLElement, members);
		}
		syncChildren(body, children);
		windowElements.push(view.element);
	}
	syncChildren(document.getElementById("windows") as HTMLElement, windowElements);
	(document.getElementById("empty") as HTMLElement).hidden = matches > 0;
	for (const id of rows.keys()) if (!liveRows.has(id)) rows.delete(id);
	for (const id of windows.keys()) if (!byWindow.has(id)) windows.delete(id);
	for (const id of groupViews.keys()) if (!groupMap.has(id)) groupViews.delete(id);
}
