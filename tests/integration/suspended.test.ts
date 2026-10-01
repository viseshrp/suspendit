// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { suspendedUrl } from "../../entrypoints/shared/suspended";
import { createMockChrome, tab } from "../helpers/mock_chrome";

const html = readFileSync("entrypoints/suspended/index.html", "utf8");
let href: string;
let state: ReturnType<typeof createMockChrome>;
const resume = () => document.getElementById("resume") as HTMLButtonElement;
beforeEach(() => {
	vi.resetModules();
	state = createMockChrome([tab(1, { active: true })]);
	document.body.innerHTML = new DOMParser().parseFromString(html, "text/html").body.innerHTML;
	href = suspendedUrl(tab(1, { title: "<img src=x onerror=alert(1)>" }));
	vi.stubGlobal("location", { get href() { return href; } });
});
afterEach(() => { vi.unstubAllGlobals(); });

it("renders untrusted metadata as text and replaces the placeholder on explicit resume", async () => {
	await import("../../entrypoints/suspended");
	expect(document.getElementById("page-title")?.textContent).toBe("<img src=x onerror=alert(1)>");
	expect(document.querySelector("#page-title img")).toBeNull();
	expect(document.title).toContain("· Suspended");
	expect(state.mock.tabs.update).not.toHaveBeenCalled();
	resume().click();
	await vi.waitFor(() => expect(state.mock.tabs.update).toHaveBeenCalledWith(1, { url: "https://example.com/1" }));
});

it("disables invalid addresses and responds to changes in saved metadata", async () => {
	href = chrome.runtime.getURL("suspended.html#url=javascript:alert(1)");
	await import("../../entrypoints/suspended");
	expect(resume().disabled).toBe(true);
	expect(document.getElementById("status")?.textContent).toContain("missing or invalid");
	href = suspendedUrl(tab(1));
	window.dispatchEvent(new Event("hashchange"));
	expect(resume().disabled).toBe(false);
	href = chrome.runtime.getURL("suspended.html");
	resume().click();
	expect(state.mock.tabs.update).not.toHaveBeenCalled();
	expect(resume().disabled).toBe(true);
});

it("reports navigation failures and permits another attempt", async () => {
	await import("../../entrypoints/suspended");
	state.mock.tabs.update.mockRejectedValueOnce(new Error("Navigation refused"));
	resume().click();
	await vi.waitFor(() => expect(document.getElementById("status")?.textContent).toContain("Navigation refused"));
	expect(resume().disabled).toBe(false);
	state.mock.tabs.getCurrent.mockResolvedValueOnce(undefined);
	resume().click();
	await vi.waitFor(() => expect(document.getElementById("status")?.textContent).toContain("no longer available"));
});
