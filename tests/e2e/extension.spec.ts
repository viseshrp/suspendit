import { expect, test } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { close, evaluate, launch, screenshot, target } from "../helpers/browser";

let server: Server;
let base: string;
let worker: Awaited<ReturnType<typeof launch>>;
let popupTarget: typeof worker | undefined;
let activeId: number;
let windowId: number;
const originalUrls = new Map<number, string>();

test.beforeAll(async () => {
	server = createServer((req, res) => {
		const title = decodeURIComponent((req.url ?? "/Today").slice(1)).replace(/[<>&"]/g, "");
		res.setHeader("Content-Type", "text/html");
		res.end(`<!doctype html><html lang="en"><title>${title}</title><h1>${title}</h1><p>Native suspension test.</p>${title === "Audio" ? "<script>window.audio = new AudioContext(); const oscillator = audio.createOscillator(); const gain = audio.createGain(); gain.gain.value = 0.002; oscillator.connect(gain); gain.connect(audio.destination); oscillator.start(); audio.resume();</script>" : ""}</html>`);
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address();
	if (!address || typeof address === "string") throw new Error("Test server did not start");
	base = `http://127.0.0.1:${address.port}`;
});
test.afterAll(async () => { await new Promise<void>((resolve) => server.close(() => resolve())); });

test.beforeEach(async () => {
	originalUrls.clear();
	popupTarget = undefined;
	worker = await launch(`${base}/Today`);
	const [active] = await evaluate(worker, () => chrome.tabs.query({ active: true, currentWindow: true }));
	activeId = active.id as number;
	windowId = active.windowId;
	await expect.poll(async () => (await getTab(activeId)).status).toBe("complete");
});

// biome-ignore lint/correctness/noEmptyPattern: Playwright requires destructured fixture arguments.
test.afterEach(async ({}, info) => {
	if (info.status !== info.expectedStatus && popupTarget) {
		await screenshot(popupTarget, info.outputPath("popup-failure.png")).catch(() => {});
	}
	await close(info.outputPath("chrome.log"));
});

async function getTab(id: number) {
	// Native discard can replace a tab ID. Follow the test page's original URL.
	const result = await evaluate(worker, async ({ id, url }) => {
		const tabs = await chrome.tabs.query({});
		const tab = tabs.find((tab) => tab.id === id) ?? tabs.find((tab) => tab.url === url);
		if (!tab) throw new Error(`Test tab ${id} disappeared`);
		return tab;
	}, { id, url: originalUrls.get(id) });
	const url = result.pendingUrl || result.url;
	if (url) originalUrls.set(id, url);
	return result;
}
async function createTab(title: string, options: { windowId?: number; pinned?: boolean } = {}) {
	const tab = await evaluate(worker, (props) => chrome.tabs.create(props), { url: `${base}/${encodeURIComponent(title)}`, active: false, windowId, ...options });
	const id = tab.id as number;
	await expect.poll(async () => (await getTab(id)).status).toBe("complete");
	return id;
}

async function popup() {
	await evaluate(worker, () => chrome.action.openPopup());
	popupTarget = await target((entry) => entry.url.endsWith("/popup.html"));
	await expect.poll(() => evaluate(popupTarget as typeof worker, () => document.querySelector("#counts")?.textContent)).toContain("suspended");
	return popupTarget;
}

async function click(selector: string) {
	await expect.poll(() => evaluate(popupTarget as typeof worker, (selector) => {
		const button = document.querySelector<HTMLButtonElement>(selector);
		return Boolean(button && !button.disabled && button.getBoundingClientRect().height);
	}, selector)).toBe(true);
	await evaluate(popupTarget as typeof worker, (selector) => {
		// Let Runtime.evaluate return before an action closes the toolbar popup.
		setTimeout(() => document.querySelector<HTMLButtonElement>(selector)?.click(), 0);
	}, selector);
}

async function discardState(ids: number[]) {
	return Promise.all(ids.map(async (id) => (await getTab(id)).discarded));
}

test("individual suspension preserves the original URL and Chrome restores the document", async () => {
	const id = await createTab("Architecture notes");
	const original = await getTab(id);
	const page = await popup();
	await click('[aria-label="Suspend Architecture notes"]');
	await expect.poll(() => discardState([id])).toEqual([true]);
	expect((await getTab(id)).url).toBe(original.url);
	await expect.poll(() => evaluate(page, () => document.querySelector("#status")?.textContent)).toContain("1 tab suspended");
	await click('[aria-label="Resume Architecture notes"]');
	await expect.poll(async () => (await getTab(id)).discarded).toBe(false);
	await expect.poll(async () => (await getTab(id)).status).toBe("complete");
	const restored = await target((entry) => entry.url === original.url);
	expect(await evaluate(restored, () => (document as Document & { wasDiscarded: boolean }).wasDiscarded)).toBe(true);
});

test("an active tab switches to an existing awake tab before native discard", async () => {
	const neighbor = await createTab("Nearby tab");
	await popup();
	await click('[aria-label="Suspend Today"]');
	await expect.poll(() => discardState([activeId])).toEqual([true]);
	expect((await getTab(neighbor)).active).toBe(true);
	expect(await evaluate(worker, () => chrome.tabs.query({}))).toHaveLength(2);
});

test("a single-tab window explains why its active tab cannot be suspended", async () => {
	const page = await popup();
	expect(await evaluate(page, () => {
		const button = document.querySelector<HTMLButtonElement>('[aria-label="Suspend Today"]');
		return { disabled: button?.disabled, title: button?.title, allDisabled: document.querySelector<HTMLButtonElement>("#suspend-all")?.disabled };
	})).toEqual({ disabled: true, title: "Keep another tab awake in this window", allDisabled: true });
});

test("group and current-window actions preserve active, pinned, and audio tabs", async () => {
	const first = await createTab("Architecture notes");
	const second = await createTab("API reference");
	const outside = await createTab("Later");
	const pinned = await createTab("Pinned", { pinned: true });
	const audio = await createTab("Audio");
	await expect.poll(async () => (await getTab(audio)).audible).toBe(true);
	const group = await evaluate(worker, async (ids) => {
		const id = await chrome.tabs.group({ tabIds: ids as [number, ...number[]] });
		await chrome.tabGroups.update(id, { title: "Research", color: "green" });
		return id;
	}, [first, second]);
	await popup();
	await click('[aria-label="Suspend group Research"]');
	await expect.poll(() => discardState([first, second, outside, activeId, pinned, audio])).toEqual([true, true, false, false, false, false]);
	expect((await getTab(first)).groupId).toBe(group);
	await click("#suspend-window");
	await expect.poll(() => discardState([outside, activeId, pinned, audio])).toEqual([true, false, false, false]);
	await click('[aria-label="Suspend Pinned"]');
	await expect.poll(() => discardState([pinned])).toEqual([true]);
});

test("window and all-window actions keep each window's active tab awake", async () => {
	const local = await createTab("Local tab");
	const other = await evaluate(worker, async (url) => {
		const window = await chrome.windows.create({ url, focused: false });
		if (!window) throw new Error("Could not create a test window");
		return { windowId: window.id as number, activeId: window.tabs?.[0].id as number };
	}, `${base}/Other`);
	const remote = await createTab("Remote tab", { windowId: other.windowId });
	await getTab(other.activeId);
	await evaluate(worker, (id) => chrome.windows.update(id, { focused: true }), windowId);
	await popup();
	await click(`#window-${other.windowId}`);
	await expect.poll(() => discardState([local, remote, activeId, other.activeId])).toEqual([false, true, false, false]);
	await click("#suspend-all");
	await expect.poll(() => discardState([local, remote, activeId, other.activeId])).toEqual([true, true, false, false]);
});

// biome-ignore lint/correctness/noEmptyPattern: Playwright requires destructured fixture arguments.
test("popup search, light/dark appearance, and responsive layout", async ({}, info) => {
	const first = await createTab("Architecture notes");
	const second = await createTab("Design references");
	await createTab("Weekend reading");
	await evaluate(worker, async (ids) => {
		const groupId = await chrome.tabs.group({ tabIds: ids as [number, ...number[]] });
		await chrome.tabGroups.update(groupId, { title: "Research", color: "yellow" });
	}, [first, second]);
	const page = await popup();
	async function search(query: string) {
		await evaluate(page, (query) => {
			const input = document.querySelector<HTMLInputElement>("#search") as HTMLInputElement;
			input.value = query;
			input.dispatchEvent(new Event("input", { bubbles: true }));
		}, query);
	}
	await search("Research");
	expect(await evaluate(page, () => document.querySelectorAll(".tab-row").length)).toBe(2);
	await search("nothing matches");
	expect(await evaluate(page, () => (document.querySelector("#empty") as HTMLElement).hidden)).toBe(false);
	await search("");
	for (const colorScheme of ["light", "dark"] as const) {
		await screenshot(page, info.outputPath(`popup-${colorScheme}.png`), colorScheme);
		const dimensions = await evaluate(page, () => ({
			content: document.documentElement.scrollWidth, viewport: innerWidth,
			mainHeight: document.querySelector("main")?.getBoundingClientRect().height ?? 0,
			footerBottom: document.querySelector("footer")?.getBoundingClientRect().bottom ?? 0,
			height: innerHeight,
		}));
		expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport);
		expect(dimensions.mainHeight).toBeGreaterThan(200);
		expect(dimensions.footerBottom).toBeLessThanOrEqual(dimensions.height);
	}
});
