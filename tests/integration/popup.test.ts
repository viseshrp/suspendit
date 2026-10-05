// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { suspendedUrl } from "../../entrypoints/shared/suspended";
import { createMockChrome, tab } from "../helpers/mock_chrome";

const html = readFileSync(resolve("entrypoints/popup/index.html"), "utf8");
const button = (id: string) => document.getElementById(id) as HTMLButtonElement;
const input = () => document.getElementById("search") as HTMLInputElement;
const status = () => document.getElementById("status") as HTMLElement;
let state: ReturnType<typeof createMockChrome>;

beforeEach(() => {
	vi.resetModules();
	vi.useFakeTimers();
	document.body.innerHTML = new DOMParser().parseFromString(html, "text/html").body.innerHTML;
	state = createMockChrome([tab(1, { active: true, highlighted: true }), tab(2, { groupId: 7 }), tab(3, { groupId: 7 }), tab(4, { windowId: 2 }), tab(5, { discarded: true })]);
	state.groups.push({ id: 7, title: "Research", color: "green", collapsed: false, windowId: 1, shared: false });
	vi.spyOn(window, "close").mockImplementation(() => {});
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
async function start() { await import("../../entrypoints/popup"); await vi.runAllTimersAsync(); }
async function click(id: string) { button(id).click(); await vi.runAllTimersAsync(); }
function search(text: string) { input().value = text; input().dispatchEvent(new Event("input")); }
async function connectProtectionWorker() {
	const { changeProtection } = await import("../../entrypoints/background/protection");
	state.mock.runtime.sendMessage.mockImplementation(changeProtection);
}

it("shows live window/group/tab counts, search results, and collapsed windows", async () => {
	await start();
	expect(document.getElementById("counts")?.textContent).toBe("5 tabs · 1 suspended");
	expect(button("toggle-2").getAttribute("aria-expanded")).toBe("false");
	await click("toggle-2");
	expect(button("toggle-2").getAttribute("aria-expanded")).toBe("true");
	await click("toggle-2");
	search("RESEARCH");
	expect(document.querySelectorAll(".tab-row")).toHaveLength(2);
	search("no-match");
	expect(document.getElementById("empty")?.hidden).toBe(false);
	search("");
	state.tabs.push(tab(6));
	state.mock.tabs.onCreated.emit();
	await vi.runAllTimersAsync();
	expect(document.querySelectorAll(".tab-row")).toHaveLength(6);
});

it("sends individual, selected, group, window, and all-window suspension requests", async () => {
	state.tabs[1].highlighted = true;
	await start();
	for (const [id, request] of [
		["suspend-2", { type: "suspend", scope: "tab", id: 2 }],
		["group-7", { type: "suspend", scope: "group", id: 7 }],
		["window-2", { type: "suspend", scope: "window", id: 2 }],
		["suspend-window", { type: "suspend", scope: "window", id: 1 }],
		["suspend-selected", { type: "suspend", scope: "selected", id: 1 }],
		["suspend-all", { type: "suspend", scope: "all" }],
	] as const) {
		await click(id);
		expect(state.mock.runtime.sendMessage).toHaveBeenLastCalledWith(request);
		expect(status().textContent).toBe("1 tab suspended.");
	}
});

it("collapses popup groups and restores their state after searching", async () => {
	await start();
	await click("toggle-group-7");
	expect(button("toggle-group-7").getAttribute("aria-expanded")).toBe("false");
	expect(document.getElementById("group-tabs-7")?.hidden).toBe(true);
	state.mock.tabs.onUpdated.emit();
	await vi.runAllTimersAsync();
	expect(document.getElementById("group-tabs-7")?.hidden).toBe(true);
	search("research");
	expect(document.getElementById("group-tabs-7")?.hidden).toBe(false);
	await click("toggle-group-7");
	expect(document.getElementById("group-tabs-7")?.hidden).toBe(true);
	search("");
	expect(document.getElementById("group-tabs-7")?.hidden).toBe(true);
	await click("toggle-group-7");
	expect(document.getElementById("group-tabs-7")?.hidden).toBe(false);
	search("Tab 4");
	expect(button("toggle-2").getAttribute("aria-expanded")).toBe("true");
	await click("toggle-2");
	expect(button("toggle-2").getAttribute("aria-expanded")).toBe("false");
	await click("toggle-2");
	expect(button("toggle-2").getAttribute("aria-expanded")).toBe("true");
	expect(state.groups[0].collapsed).toBe(false);
	window.dispatchEvent(new Event("resize"));
	expect(document.documentElement.style.height).toBe(`${window.innerHeight}px`);
});

it("prevents duplicate suspension requests while allowing protection changes and refreshes afterwards", async () => {
	await start();
	let finish: (value: unknown) => void = () => {};
	state.mock.runtime.sendMessage.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
	button("suspend-all").click();
	button("suspend-window").dispatchEvent(new Event("click"));
	button("open-2").dispatchEvent(new Event("click", { bubbles: true }));
	state.mock.tabs.onUpdated.emit();
	expect(state.mock.runtime.sendMessage).toHaveBeenCalledTimes(1);
	state.mock.runtime.sendMessage.mockResolvedValueOnce({ ok: true, sites: ["example.com"] });
	await click("protect-2");
	expect(state.mock.runtime.sendMessage).toHaveBeenLastCalledWith({ type: "protection", action: "protect", site: "example.com" });
	expect(button("protect-2").getAttribute("aria-pressed")).toBe("true");
	finish({ suspended: 2, skipped: 3, failed: 0, errors: [] });
	await vi.runAllTimersAsync();
	expect(status().textContent).toBe("2 tabs suspended · 3 skipped.");
});

it("surfaces failures and empty worker replies without claiming success", async () => {
	await start();
	state.mock.runtime.sendMessage.mockResolvedValueOnce({ suspended: 0, skipped: 0, failed: 1, errors: ["Chrome refused"] });
	await click("suspend-all");
	expect(status().dataset.error).toBe("true");
	expect(status().textContent).toContain("Chrome refused");
	state.mock.runtime.sendMessage.mockRejectedValueOnce(new Error("Worker unavailable"));
	await click("suspend-all");
	expect(status().textContent).toContain("Worker unavailable");
	state.mock.runtime.sendMessage.mockResolvedValueOnce(undefined);
	await click("suspend-all");
	expect(status().textContent).toContain("Reopen the popup");
});

it("resumes by activating the original tab, focuses its window, and closes the popup", async () => {
	await start();
	await click("open-5");
	expect(state.mock.tabs.update).toHaveBeenCalledWith(5, { active: true });
	expect(state.mock.windows.update).toHaveBeenCalledWith(1, { focused: true });
	expect(window.close).toHaveBeenCalledOnce();
	state.mock.tabs.update.mockRejectedValueOnce(new Error("Tab closed"));
	await click("open-2");
	expect(status().textContent).toContain("Tab closed");
	state.mock.tabs.update.mockResolvedValueOnce(undefined as never);
	await click("open-2");
	expect(status().textContent).toContain("no longer available");
});

it("shows the saved title, URL and favicon and restores placeholders from the popup", async () => {
	const original = { ...state.tabs[1], title: "Saved page", url: "https://example.com/report?one=1#part" };
	state.tabs[1] = { ...original, title: "Tab suspended", url: suspendedUrl(original) };
	await start();
	expect(button("open-2").getAttribute("aria-label")).toBe("Resume Saved page");
	expect(button("suspend-2").disabled).toBe(true);
	const icon = document.querySelector('[data-tab-id="2"] img') as HTMLImageElement;
	expect(new URL(icon.src).searchParams.get("pageUrl")).toBe(original.url);
	await connectProtectionWorker();
	await click("protect-2");
	expect(button("protect-2").getAttribute("aria-pressed")).toBe("true");
	expect(state.storage.protectedSites).toEqual(["example.com"]);
	expect(button("suspend-2").title).toBe("Already suspended");
	expect(state.mock.tabs.update).not.toHaveBeenCalled();
	search("report?one=1#part");
	expect(document.querySelectorAll(".tab-row")).toHaveLength(1);
	await click("open-2");
	expect(state.mock.tabs.update).toHaveBeenCalledWith(2, { active: true, url: original.url });
});

it("keeps untrusted titles as text and explains disabled actions", async () => {
	state.tabs.splice(0, state.tabs.length,
		tab(1, { active: true, highlighted: true, title: "<img src=x onerror=alert(1)>" }),
		tab(2, { discarded: true, title: "", url: "file:///tmp/report.txt" }),
		tab(3, { id: undefined, url: undefined, title: undefined, discarded: true }),
	);
	state.tabs[1].url = suspendedUrl(state.tabs[1]);
	await start();
	expect(document.querySelector(".tab-title img")).toBeNull();
	expect(document.querySelector(".tab-title")?.textContent).toContain("<img");
	expect(button("suspend-1").disabled).toBe(true);
	expect(button("suspend-1").title).toContain("Keep another tab awake");
	expect(button("suspend-selected").disabled).toBe(true);
	expect(button("suspend-2").title).toBe("Already suspended");
	expect(button("suspend-all").disabled).toBe(true);
	expect(button("protect-2").hidden).toBe(true);
	expect(document.querySelector<HTMLButtonElement>('[data-tab-id="unavailable-1-3"] .tab-protect')?.hidden).toBe(true);
});

it("uses Chrome's favicon service and falls back when an icon cannot load", async () => {
	state.tabs[0].url = "https://example.com/a?x=1&y=two#section";
	state.tabs[1].url = "chrome://settings/";
	await start();
	const icon = document.querySelector('[data-tab-id="1"] img') as HTMLImageElement;
	const url = new URL(icon.src);
	expect(`${url.protocol}//${url.host}${url.pathname}`).toBe("chrome-extension://test-id/_favicon/");
	expect(url.searchParams.get("pageUrl")).toBe(state.tabs[0].url);
	expect(url.searchParams.get("size")).toBe("32");
	expect(icon.getAttribute("loading")).toBe("lazy");
	expect(icon.hidden).toBe(false);
	icon.dispatchEvent(new Event("error"));
	expect(icon.hidden).toBe(true);
	expect((document.querySelector('[data-tab-id="2"] img') as HTMLImageElement).hidden).toBe(true);
});

it("renders untitled groups and audio/pinned states with keyboard focus preserved", async () => {
	state.groups[0].title = "";
	state.tabs[1].audible = true;
	state.tabs[2].pinned = true;
	state.tabs.push(tab(6, { windowId: 3 }));
	await start();
	expect(document.querySelector(".group-name")?.textContent).toBe("Untitled group");
	expect(document.body.textContent).toContain("Audio");
	expect(document.body.textContent).toContain("Pinned");
	expect(button("group-7").disabled).toBe(true);
	button("open-2").focus();
	state.mock.tabGroups.onUpdated.emit();
	await vi.runAllTimersAsync();
	expect(document.activeElement?.id).toBe("open-2");
});

it("handles an unavailable browser query and subsequent refresh", async () => {
	state.mock.tabs.query.mockRejectedValueOnce(new Error("Browser busy"));
	await start();
	expect(status().textContent).toContain("Could not read tabs");
	expect(button("suspend-selected").disabled).toBe(true);
	expect(button("suspend-all").disabled).toBe(true);
	state.mock.tabs.onUpdated.emit();
	await vi.runAllTimersAsync();
	expect(document.querySelectorAll(".tab-row")).toHaveLength(5);
	const row = button("suspend-2");
	row.dataset.id = "-2";
	row.click();
	expect(state.mock.runtime.sendMessage).not.toHaveBeenCalled();
});

it("updates tab details in place without querying every tab or losing focus", async () => {
	await start();
	const protectionNote = document.getElementById("protection-note")?.firstChild;
	const row = document.querySelector('[data-tab-id="2"]');
	const neighbor = button("open-3");
	const icon = row?.querySelector("img") as HTMLImageElement;
	icon.dispatchEvent(new Event("error"));
	neighbor.focus();
	state.mock.tabs.query.mockClear();
	for (let index = 0; index < 20; index++) {
		state.tabs[1].title = `Updated ${index}`;
		state.tabs[1].audible = true;
		state.mock.tabs.onUpdated.emit(2, { title: state.tabs[1].title }, { ...state.tabs[1] });
	}
	await vi.runAllTimersAsync();
	expect(row?.querySelector(".tab-title")?.textContent).toBe("Updated 19");
	expect(row?.querySelector(".tab-meta")?.textContent).toContain("Audio");
	expect(document.querySelector('[data-tab-id="2"]')).toBe(row);
	expect(button("open-3")).toBe(neighbor);
	expect(document.activeElement).toBe(neighbor);
	expect(row?.querySelector("img")).toBe(icon);
	expect(icon.hidden).toBe(true);
	expect(state.mock.tabs.query).not.toHaveBeenCalled();
	expect(document.getElementById("protection-note")?.firstChild).toBe(protectionNote);
	state.tabs[1].pendingUrl = "https://other.example/page";
	state.mock.tabs.onUpdated.emit(2, { status: "loading" }, { ...state.tabs[1] });
	await vi.runAllTimersAsync();
	expect(button("protect-2").disabled).toBe(true);
	state.tabs[1].url = "https://other.example/page";
	delete state.tabs[1].pendingUrl;
	state.tabs[1].favIconUrl = "https://other.example/icon.png";
	state.mock.tabs.onUpdated.emit(2, { url: state.tabs[1].url }, { ...state.tabs[1] });
	await vi.runAllTimersAsync();
	expect(new URL(icon.src).searchParams.get("pageUrl")).toBe(state.tabs[1].url);
	expect(icon.hidden).toBe(false);
	expect(button("protect-2").disabled).toBe(false);
	expect(button("protect-2").getAttribute("aria-label")).toBe("Protect other.example");
});

it("protects every matching hostname while keeping unrelated sites and individual suspension available", async () => {
	state.tabs.splice(0, state.tabs.length,
		tab(1, { active: true, highlighted: true }),
		tab(2, { groupId: 7, highlighted: true, url: "https://Docs.Example.com:8443/edit" }),
		tab(3, { groupId: 7, url: "http://docs.example.com/view" }),
		tab(4, { windowId: 2, url: "https://other.example.com/" }),
	);
	await connectProtectionWorker();
	await start();
	const row = document.querySelector('[data-tab-id="2"]');
	button("protect-2").focus();
	state.mock.tabs.query.mockClear();
	await click("protect-2");
	expect(state.storage.protectedSites).toEqual(["docs.example.com"]);
	for (const id of ["protect-2", "protect-3"]) expect(button(id).getAttribute("aria-pressed")).toBe("true");
	expect(button("protect-4").getAttribute("aria-pressed")).toBe("false");
	expect(row?.querySelector(".tab-meta")?.textContent).toContain("docs.example.com · Protected");
	for (const id of ["group-7", "window-1", "suspend-window", "suspend-selected"]) expect(button(id).disabled).toBe(true);
	expect(button("window-2").disabled).toBe(false);
	expect(button("suspend-all").disabled).toBe(false);
	expect(button("suspend-2").disabled).toBe(false);
	expect(button("suspend-2").title).toContain("overrides site protection");
	expect(document.activeElement).toBe(button("protect-2"));
	expect(document.querySelector('[data-tab-id="2"]')).toBe(row);
	await click("protect-3");
	expect(state.storage.protectedSites).toEqual([]);
	for (const id of ["protect-2", "protect-3"]) expect(button(id).getAttribute("aria-pressed")).toBe("false");
	expect(button("group-7").disabled).toBe(false);
	expect(button("suspend-selected").disabled).toBe(false);
	expect(state.mock.tabs.query).not.toHaveBeenCalled();
	expect(state.mock.tabs.update).not.toHaveBeenCalled();
	expect(state.mock.tabs.discard).not.toHaveBeenCalled();
});

it("removes saved sites without open tabs and keeps keyboard focus in the filtered popup", async () => {
	state.storage.protectedSites = ["z.example", "a.example", "m.example"];
	await connectProtectionWorker();
	await start();
	(document.getElementById("protected-sites") as HTMLDetailsElement).open = true;
	search("no matching tab");
	expect(document.querySelectorAll(".tab-row")).toHaveLength(0);
	expect(Array.from(document.querySelectorAll(".protected-host"), (host) => host.textContent)).toEqual(["a.example", "m.example", "z.example"]);
	for (const [site, next] of [["m.example", "unprotect-z.example"], ["z.example", "unprotect-a.example"], ["a.example", "protected-summary"]]) {
		button(`unprotect-${site}`).focus();
		await click(`unprotect-${site}`);
		expect(document.getElementById(`unprotect-${site}`)).toBeNull();
		expect(document.activeElement?.id).toBe(next);
	}
	expect(state.storage.protectedSites).toEqual([]);
	expect(document.getElementById("protected-count")?.textContent).toBe("0");
	expect(document.getElementById("protected-empty")?.hidden).toBe(false);
	expect(state.mock.tabs.update).not.toHaveBeenCalled();
});

it("pauses bulk actions after a read failure and restores them through Retry", async () => {
	state.mock.storage.local.get.mockRejectedValueOnce(new Error("Storage unavailable"));
	await start();
	const note = document.getElementById("protection-note") as HTMLElement;
	for (const id of ["suspend-window", "suspend-selected", "suspend-all", "window-1", "group-7"]) expect(button(id).disabled).toBe(true);
	expect(button("protect-2").disabled).toBe(true);
	expect(button("suspend-2").disabled).toBe(false);
	expect(button("open-5").disabled).toBe(false);
	expect(button("protection-clear").hidden).toBe(true);
	await click("suspend-2");
	expect(note.textContent).toContain("Storage unavailable");
	expect(note.dataset.error).toBe("true");
	button("protection-retry").focus();
	await click("protection-retry");
	expect(button("suspend-all").disabled).toBe(false);
	expect(button("protect-2").disabled).toBe(false);
	expect(button("protection-retry").hidden).toBe(true);
	expect(note.dataset.error).toBe("false");
});

it("recovers an unreadable list after a failed clear and ignores duplicate pending clears", async () => {
	state.storage.protectedSites = null;
	await start();
	expect(button("protection-clear").hidden).toBe(false);
	expect(button("suspend-all").disabled).toBe(true);
	state.mock.runtime.sendMessage.mockResolvedValueOnce({ ok: false, error: "Storage full" });
	await click("protection-clear");
	expect(document.getElementById("protection-note")?.textContent).toContain("Could not clear protected sites");
	let finish: (value: unknown) => void = () => {};
	state.mock.runtime.sendMessage.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
	button("protection-clear").focus();
	button("protection-clear").click();
	button("protection-clear").click();
	expect(state.mock.runtime.sendMessage).toHaveBeenCalledTimes(2);
	expect(state.mock.runtime.sendMessage).toHaveBeenLastCalledWith({ type: "protection", action: "clear" });
	expect(button("protection-clear").getAttribute("aria-disabled")).toBe("true");
	expect(document.activeElement?.id).toBe("protection-clear");
	finish({ ok: true, sites: [] });
	await vi.runAllTimersAsync();
	expect(button("protection-clear").hidden).toBe(true);
	expect(button("protection-retry").hidden).toBe(true);
	expect(button("suspend-all").disabled).toBe(false);
});

it.each([
	["no worker reply", [], undefined],
	["a rejected removal", ["example.com"], { ok: false, error: "Storage full" }],
	["a disconnected worker", [], new Error("Worker unavailable")],
])("keeps confirmed sites and recovers through Retry after %s", async (_case, sites, reply) => {
	state.storage.protectedSites = sites;
	await start();
	if (reply instanceof Error) state.mock.runtime.sendMessage.mockRejectedValueOnce(reply);
	else state.mock.runtime.sendMessage.mockResolvedValueOnce(reply);
	const pressed = button("protect-2").getAttribute("aria-pressed");
	await click("protect-2");
	expect(button("protect-2").getAttribute("aria-pressed")).toBe(pressed);
	expect(button("protect-2").hasAttribute("aria-disabled")).toBe(false);
	expect(button("suspend-all").disabled).toBe(true);
	expect(document.getElementById("protection-note")?.dataset.error).toBe("true");
	expect(button("protection-retry").hidden).toBe(false);
	expect(button("protection-clear").hidden).toBe(true);
	expect(state.mock.tabs.update).not.toHaveBeenCalled();
	await click("protection-retry");
	expect(document.getElementById("protection-note")?.dataset.error).toBe("false");
	expect(button("protection-retry").hidden).toBe(true);
	expect(button("protect-2").getAttribute("aria-pressed")).toBe(pressed);
});

it("holds a site's bulk actions while saving without losing focus or accepting duplicate changes", async () => {
	state.tabs[1].highlighted = true;
	state.tabs[3].url = "https://other.example/";
	await start();
	let finish: (value: unknown) => void = () => {};
	state.mock.runtime.sendMessage.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
	button("protect-2").focus();
	button("protect-2").click();
	button("protect-3").click();
	expect(state.mock.runtime.sendMessage).toHaveBeenCalledTimes(1);
	expect(button("protect-2").getAttribute("aria-disabled")).toBe("true");
	expect(button("protect-2").disabled).toBe(false);
	expect(document.activeElement?.id).toBe("protect-2");
	for (const id of ["window-1", "group-7", "suspend-selected"]) expect(button(id).disabled).toBe(true);
	expect(button("window-2").disabled).toBe(false);
	expect(button("suspend-all").disabled).toBe(false);
	finish({ ok: true, sites: ["example.com"] });
	await vi.runAllTimersAsync();
	expect(button("protect-2").getAttribute("aria-pressed")).toBe("true");
	expect(button("protect-2").hasAttribute("aria-disabled")).toBe(false);
	expect(document.activeElement?.id).toBe("protect-2");
});

it.each(["reply", "error"])("keeps the newest protected sites when an obsolete read returns an %s", async (outcome) => {
	let finish: (value: Record<string, unknown>) => void = () => {};
	let fail: (error: Error) => void = () => {};
	state.mock.storage.local.get.mockImplementationOnce(() => new Promise((resolve, reject) => { finish = resolve; fail = reject; }));
	await start();
	expect(button("suspend-all").disabled).toBe(true);
	expect(button("protect-2").disabled).toBe(true);
	state.mock.storage.local.onChanged.emit({ unrelated: { newValue: true } });
	expect(state.mock.storage.local.get).toHaveBeenCalledTimes(1);
	state.storage.protectedSites = ["example.com"];
	state.mock.storage.local.onChanged.emit({ protectedSites: { newValue: ["example.com"] } });
	await vi.runAllTimersAsync();
	expect(button("protect-2").getAttribute("aria-pressed")).toBe("true");
	if (outcome === "reply") finish({ protectedSites: [] });
	else fail(new Error("Obsolete storage error"));
	await vi.runAllTimersAsync();
	expect(button("protect-2").getAttribute("aria-pressed")).toBe("true");
	expect(button("protect-2").disabled).toBe(false);
	expect(document.getElementById("protection-note")?.dataset.error).toBe("false");
	expect(button("protection-retry").hidden).toBe(true);
});

it("keeps a newer stored list when an older protection reply arrives", async () => {
	await start();
	let finish: (value: unknown) => void = () => {};
	state.mock.runtime.sendMessage.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
	button("protect-2").click();
	state.storage.protectedSites = ["other.example"];
	state.mock.storage.local.onChanged.emit({ protectedSites: { newValue: ["other.example"] } });
	await vi.runAllTimersAsync();
	finish({ ok: true, sites: ["example.com"] });
	await vi.runAllTimersAsync();
	expect(button("protect-2").getAttribute("aria-pressed")).toBe("false");
	expect(Array.from(document.querySelectorAll(".protected-host"), (host) => host.textContent)).toEqual(["other.example"]);
	expect(button("protect-2").hasAttribute("aria-disabled")).toBe(false);
});

it("reuses rows across filtering, reordering, group changes, and window moves", async () => {
	await start();
	const original = button("open-2");
	search("Tab 4");
	search("");
	expect(button("open-2")).toBe(original);
	state.tabs[1].index = 0;
	state.mock.tabs.onMoved.emit(2);
	await vi.runAllTimersAsync();
	expect(document.querySelector(".tab-row")?.getAttribute("data-tab-id")).toBe("2");
	expect(button("open-2")).toBe(original);
	state.tabs[1].groupId = -1;
	state.tabs[1].windowId = 2;
	state.mock.tabs.onUpdated.emit(2, { groupId: -1 }, { ...state.tabs[1] });
	state.mock.tabs.onAttached.emit(2);
	await vi.runAllTimersAsync();
	expect(original.closest(".window")?.getAttribute("data-window-id")).toBe("2");
	expect(original.closest(".group")).toBeNull();
	expect(document.querySelector('[data-group-id="7"] .group-count')?.textContent).toBe("1");
	state.tabs.splice(1, 2);
	state.groups.length = 0;
	state.mock.tabs.onRemoved.emit(2);
	state.mock.tabGroups.onRemoved.emit();
	await vi.runAllTimersAsync();
	expect(document.getElementById("open-2")).toBeNull();
	expect(document.querySelector(".group")).toBeNull();
	state.tabs.push(tab(2, { title: "New tab" }));
	state.mock.tabs.onUpdated.emit(2, {}, { ...state.tabs.at(-1) });
	await vi.runAllTimersAsync();
	expect(button("open-2")).not.toBe(original);
	expect(button("open-2").textContent).toContain("New tab");
	state.tabs.splice(0, state.tabs.length, tab(9, { windowId: 3 }));
	state.mock.tabs.onRemoved.emit();
	await vi.runAllTimersAsync();
	expect(document.querySelectorAll(".window")).toHaveLength(1);
	expect(document.querySelector(".window")?.getAttribute("data-window-id")).toBe("3");
});

it("keeps newer tab metadata when an older browser query finishes", async () => {
	await start();
	const snapshot = state.tabs.map((tab) => ({ ...tab }));
	let finish: (tabs: chrome.tabs.Tab[]) => void = () => {};
	state.mock.tabs.query.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
	state.mock.tabGroups.onUpdated.emit();
	await vi.advanceTimersByTimeAsync(75);
	state.tabs[1].title = "Latest title";
	state.mock.tabs.onUpdated.emit(2, { title: "Latest title" }, { ...state.tabs[1] });
	finish(snapshot);
	await vi.runAllTimersAsync();
	expect(button("open-2").textContent).toContain("Latest title");
});

it("ignores obsolete browser replies and errors after a structural change", async () => {
	await start();
	let finish: (tabs: chrome.tabs.Tab[]) => void = () => {};
	state.mock.tabs.query.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
	state.mock.tabGroups.onUpdated.emit();
	await vi.advanceTimersByTimeAsync(75);
	state.tabs[1].title = "Current title";
	state.mock.tabs.onUpdated.emit(2, {}, { ...state.tabs[1] });
	state.mock.tabs.onRemoved.emit();
	finish([]);
	await vi.runAllTimersAsync();
	expect(button("open-2").textContent).toContain("Current title");
	let fail: (error: Error) => void = () => {};
	state.mock.tabs.query.mockImplementationOnce(() => new Promise((_resolve, reject) => { fail = reject; }));
	state.mock.tabGroups.onUpdated.emit();
	await vi.advanceTimersByTimeAsync(75);
	state.mock.tabs.onCreated.emit();
	fail(new Error("Obsolete error"));
	await vi.runAllTimersAsync();
	expect(status().textContent).not.toContain("Obsolete error");
	expect(button("suspend-all").disabled).toBe(false);
});
