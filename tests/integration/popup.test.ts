// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
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
	state = createMockChrome([tab(1, { active: true }), tab(2, { groupId: 7 }), tab(3, { groupId: 7 }), tab(4, { windowId: 2 }), tab(5, { discarded: true })]);
	state.groups.push({ id: 7, title: "Research", color: "green", collapsed: false, windowId: 1, shared: false });
	vi.spyOn(window, "close").mockImplementation(() => {});
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
async function start() { await import("../../entrypoints/popup"); await vi.runAllTimersAsync(); }
async function click(id: string) { button(id).click(); await vi.runAllTimersAsync(); }
function search(text: string) { input().value = text; input().dispatchEvent(new Event("input")); }

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

it("sends individual, group, window, and all-window suspension requests", async () => {
	await start();
	for (const [id, request] of [
		["suspend-2", { type: "suspend", scope: "tab", id: 2 }],
		["group-7", { type: "suspend", scope: "group", id: 7 }],
		["window-2", { type: "suspend", scope: "window", id: 2 }],
		["suspend-window", { type: "suspend", scope: "window", id: 1 }],
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

it("prevents duplicate requests while an operation is running and refreshes afterwards", async () => {
	await start();
	let finish: (value: unknown) => void = () => {};
	state.mock.runtime.sendMessage.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
	button("suspend-all").click();
	button("suspend-window").dispatchEvent(new Event("click"));
	button("open-2").dispatchEvent(new Event("click", { bubbles: true }));
	state.mock.tabs.onUpdated.emit();
	expect(state.mock.runtime.sendMessage).toHaveBeenCalledTimes(1);
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

it("keeps untrusted titles as text and explains disabled actions", async () => {
	state.tabs.splice(0, state.tabs.length,
		tab(1, { active: true, title: "<img src=x onerror=alert(1)>" }),
		tab(2, { discarded: true, title: "", url: "file:///tmp/report.txt" }),
		tab(3, { id: undefined, url: undefined, title: undefined, discarded: true }),
	);
	await start();
	expect(document.querySelector(".tab-title img")).toBeNull();
	expect(document.querySelector(".tab-title")?.textContent).toContain("<img");
	expect(button("suspend-1").disabled).toBe(true);
	expect(button("suspend-1").title).toContain("Keep another tab awake");
	expect(button("suspend-2").title).toBe("Already suspended");
	expect(button("suspend-all").disabled).toBe(true);
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
	expect(button("suspend-all").disabled).toBe(true);
	state.mock.tabs.onUpdated.emit();
	await vi.runAllTimersAsync();
	expect(document.querySelectorAll(".tab-row")).toHaveLength(5);
	const row = button("suspend-2");
	row.dataset.id = "-2";
	row.click();
	expect(state.mock.runtime.sendMessage).not.toHaveBeenCalled();
});
