import { awakeNeighbor, skipReason } from "../shared/tabs";

const groupColors: Record<chrome.tabGroups.TabGroup["color"], string> = {
	grey: "#89918b", blue: "#6895d4", red: "#d47b7b", yellow: "#ba983f",
	green: "#6b9e79", pink: "#c887ad", purple: "#a48acb", cyan: "#63a9b4", orange: "#c58c5d",
};

function tabRow(tab: chrome.tabs.Tab, allTabs: chrome.tabs.Tab[], busy: boolean) {
	const template = document.getElementById("tab-template") as HTMLTemplateElement;
	const row = template.content.firstElementChild?.cloneNode(true) as HTMLElement;
	row.dataset.tabId = String(tab.id);
	row.dataset.suspended = String(tab.discarded);
	const title = tab.title || tab.url || "Untitled tab";
	let host = "Browser page";
	try {
		const url = new URL(tab.url ?? "");
		host = url.protocol === "file:" ? "Local file" : url.hostname || "Browser page";
	} catch { /* A new tab may not have a URL yet. */ }
	(row.querySelector(".tab-mark") as HTMLElement).textContent = tab.discarded ? "☾" : host.charAt(0).toUpperCase();
	(row.querySelector(".tab-title") as HTMLElement).textContent = title;
	const state = tab.discarded ? "Suspended" : tab.active ? "Active" : tab.audible ? "Audio" : tab.pinned ? "Pinned" : "";
	(row.querySelector(".tab-meta") as HTMLElement).textContent = `${host}${state ? ` · ${state}` : ""}`;
	const open = row.querySelector(".tab-link") as HTMLButtonElement;
	open.dataset.id = String(tab.id);
	open.id = `open-${tab.id}`;
	open.title = title;
	open.setAttribute("aria-label", `${tab.discarded ? "Resume" : "Open"} ${title}`);
	open.disabled = busy || tab.id === undefined;
	const suspend = row.querySelector(".tab-suspend") as HTMLButtonElement;
	const reason = skipReason(tab, false) || (tab.active && !awakeNeighbor(tab, allTabs) ? "Keep another tab awake in this window" : "");
	suspend.dataset.id = String(tab.id);
	suspend.id = `suspend-${tab.id}`;
	suspend.setAttribute("aria-label", `Suspend ${title}`);
	suspend.title = reason || (tab.active ? "Switch to a nearby awake tab and suspend this tab" : `Suspend ${title}`);
	suspend.disabled = busy || Boolean(reason);
	return row;
}

export function renderWindows(
	tabs: chrome.tabs.Tab[],
	groups: chrome.tabGroups.TabGroup[],
	currentWindowId: number,
	query: string,
	collapsed: Set<number>,
	busy: boolean,
) {
	const container = document.getElementById("windows") as HTMLDivElement;
	const fragment = document.createDocumentFragment();
	const groupMap = new Map(groups.map((group) => [group.id, group]));
	const windowIds = [...new Set(tabs.map((tab) => tab.windowId))].sort((a, b) =>
		a === currentWindowId ? -1 : b === currentWindowId ? 1 : a - b,
	);
	let matches = 0;
	for (const [index, windowId] of windowIds.entries()) {
		const windowTabs = tabs.filter((tab) => tab.windowId === windowId).sort((a, b) => a.index - b.index);
		const visible = windowTabs.filter((tab) =>
			`${tab.title ?? ""} ${tab.url ?? ""} ${groupMap.get(tab.groupId)?.title ?? ""}`.toLowerCase().includes(query),
		);
		if (!visible.length) continue;
		matches += visible.length;
		const template = document.getElementById("window-template") as HTMLTemplateElement;
		const section = template.content.firstElementChild?.cloneNode(true) as HTMLElement;
		section.dataset.windowId = String(windowId);
		const name = windowId === currentWindowId ? "This window" : `Window ${index + 1}`;
		(section.querySelector(".window-name") as HTMLElement).textContent = name;
		(section.querySelector(".window-count") as HTMLElement).textContent = String(windowTabs.length);
		const toggle = section.querySelector(".window-toggle") as HTMLButtonElement;
		toggle.dataset.id = String(windowId);
		toggle.id = `toggle-${windowId}`;
		const expanded = Boolean(query) || !collapsed.has(windowId);
		toggle.setAttribute("aria-expanded", String(expanded));
		toggle.setAttribute("aria-controls", `window-tabs-${windowId}`);
		const suspend = section.querySelector(".scope-button") as HTMLButtonElement;
		suspend.dataset.id = String(windowId);
		suspend.id = `window-${windowId}`;
		suspend.setAttribute("aria-label", `Suspend ${name.toLowerCase()}`);
		suspend.title = "Suspend eligible tabs in the entire window";
		suspend.disabled = busy || !windowTabs.some((tab) => !skipReason(tab, true));
		const body = section.querySelector(".window-tabs") as HTMLDivElement;
		body.id = `window-tabs-${windowId}`;
		body.hidden = !expanded;
		const renderedGroups = new Map<number, HTMLElement>();
		for (const tab of visible) {
			const group = groupMap.get(tab.groupId);
			if (!group) {
				body.append(tabRow(tab, tabs, busy));
				continue;
			}
			let groupBody = renderedGroups.get(group.id);
			if (!groupBody) {
				const groupTemplate = document.getElementById("group-template") as HTMLTemplateElement;
				const groupSection = groupTemplate.content.firstElementChild?.cloneNode(true) as HTMLElement;
				groupSection.dataset.groupId = String(group.id);
				groupSection.style.setProperty("--group-color", groupColors[group.color]);
				const title = group.title || "Untitled group";
				(groupSection.querySelector(".group-name") as HTMLElement).textContent = title;
				const members = windowTabs.filter((member) => member.groupId === group.id);
				(groupSection.querySelector(".group-count") as HTMLElement).textContent = String(members.length);
				const button = groupSection.querySelector(".scope-button") as HTMLButtonElement;
				button.dataset.id = String(group.id);
				button.id = `group-${group.id}`;
				button.title = "Suspend eligible tabs in the entire group";
				button.setAttribute("aria-label", `Suspend group ${title}`);
				button.disabled = busy || !members.some((member) => !skipReason(member, true));
				groupBody = groupSection.querySelector(".group-tabs") as HTMLElement;
				renderedGroups.set(group.id, groupBody);
				body.append(groupSection);
			}
			groupBody.append(tabRow(tab, tabs, busy));
		}
		fragment.append(section);
	}
	container.replaceChildren(fragment);
	(document.getElementById("empty") as HTMLElement).hidden = matches > 0;
}
