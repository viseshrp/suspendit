import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { isSuspended, pageAddress, suspendedPage, suspendedUrl } from "../../entrypoints/shared/suspended";
import { awakeNeighbor, skipReason } from "../../entrypoints/shared/tabs";
import { createMockChrome, tab } from "../helpers/mock_chrome";

beforeEach(() => { createMockChrome(); });
afterEach(() => vi.unstubAllGlobals());

it.each(["https://example.com/a?one=1&two=%26#part", "http://example.com/", "file:///tmp/report%20one.html#section"])("round-trips the exact address and untrusted title: %s", (url) => {
	const title = '<img src=x onerror=alert(1)> Résumé 🌙 & #';
	const saved = suspendedUrl(tab(1, { url, title }));
	expect(saved.startsWith(chrome.runtime.getURL("suspended.html#"))).toBe(true);
	expect(suspendedPage(saved)).toEqual({ url, title });
});

it.each(["javascript:alert(1)", "data:text/html,test", "chrome://settings/", "chrome-extension://other/page.html", "/relative", "https://", ""])("rejects unsafe or invalid restore addresses: %s", (url) => {
	expect(pageAddress(url)).toBe(false);
	expect(() => suspendedUrl(tab(1, { url }))).toThrow("cannot be suspended");
	expect(suspendedPage(`${chrome.runtime.getURL("suspended.html")}#${new URLSearchParams({ url })}`)).toBeUndefined();
});

it("rejects foreign placeholders and handles absent titles and addresses", () => {
	expect(suspendedPage()).toBeUndefined();
	expect(suspendedPage("chrome-extension://other/suspended.html#url=https://example.com")).toBeUndefined();
	expect(suspendedPage(chrome.runtime.getURL("suspended.html#"))).toBeUndefined();
	expect(() => suspendedUrl(tab(1, { url: undefined }))).toThrow();
	expect(suspendedPage(suspendedUrl(tab(1, { title: undefined })))?.title).toBe("https://example.com/1");
	expect(suspendedPage(chrome.runtime.getURL("suspended.html#url=https://example.com"))?.title).toBe("https://example.com");
});

it("distinguishes saved placeholders from native discards eligible for conversion", () => {
	const placeholder = tab(2, { url: suspendedUrl(tab(2)) });
	expect(isSuspended(placeholder)).toBe(true);
	expect(skipReason(placeholder, false)).toBe("Already suspended");
	expect(isSuspended(tab(3, { discarded: true }))).toBe(true);
	expect(skipReason(tab(3, { discarded: true }), false)).toBe("");
	expect(skipReason(tab(3, { pendingUrl: "https://example.com/new" }), false)).toBe("Page is loading");
	expect(awakeNeighbor(tab(1), [placeholder, tab(3, { discarded: true }), tab(4)])?.id).toBe(4);
});
