// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { suspendedUrl } from "../../entrypoints/shared/suspended";
import { createMockChrome, tab } from "../helpers/mock_chrome";

const html = readFileSync("entrypoints/suspended/index.html", "utf8");
let href: string;
const replace = vi.fn();
const resume = () => document.getElementById("resume") as HTMLButtonElement;
beforeEach(() => {
	vi.resetModules();
	createMockChrome();
	document.body.innerHTML = new DOMParser().parseFromString(html, "text/html").body.innerHTML;
	href = suspendedUrl(tab(1, { title: "<img src=x onerror=alert(1)>" }));
	vi.stubGlobal("location", { get href() { return href; }, get hash() { return new URL(href).hash; }, replace });
	replace.mockClear();
});
afterEach(() => { vi.unstubAllGlobals(); });

it("renders untrusted metadata as text and replaces the placeholder on explicit resume", async () => {
	await import("../../entrypoints/suspended");
	expect(document.getElementById("page-title")?.textContent).toBe("<img src=x onerror=alert(1)>");
	expect(document.querySelector("#page-title img")).toBeNull();
	expect(document.title).toContain("· Suspended");
	expect(replace).not.toHaveBeenCalled();
	resume().click();
	expect(replace).toHaveBeenCalledWith("https://example.com/1");
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
	expect(replace).not.toHaveBeenCalled();
	expect(resume().disabled).toBe(true);
});
