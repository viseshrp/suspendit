import { chromium, expect, test, type Browser, type BrowserContext, type Page, type Worker } from "@playwright/test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

let server: Server;
let base: string;
let context: BrowserContext;
let attached: Browser | undefined;
let port: string;
let worker: Worker;
let profile: string;
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
	profile = await mkdtemp(join(tmpdir(), "suspendit-e2e-"));
	const extensionPath = resolve(".output/chrome-mv3");
	context = await chromium.launchPersistentContext(profile, {
		channel: "chromium",
		headless: process.env.PW_HEADLESS !== "false",
		ignoreDefaultArgs: ["--mute-audio"],
		args: ["--remote-debugging-port=0", "--autoplay-policy=no-user-gesture-required",
			`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
	});
	worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
	port = (await readFile(join(profile, "DevToolsActivePort"), "utf8")).split("\n")[0];
	const active = await worker.evaluate(async (url) => {
		const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
		await chrome.tabs.update(tab.id as number, { url });
		return { id: tab.id as number, windowId: tab.windowId };
	}, `${base}/Today`);
	activeId = active.id;
	windowId = active.windowId;
	await expect.poll(async () => (await getTab(activeId)).status).toBe("complete");
});

// biome-ignore lint/correctness/noEmptyPattern: Playwright requires destructured fixture arguments.
test.afterEach(async ({}, info) => {
  const popup = attached?.contexts()[0].pages().find((page) => page.url().endsWith("/popup.html"));
  if (info.status !== info.expectedStatus && popup && !popup.isClosed()) {
    await popup.screenshot({ path: info.outputPath("popup-failure.png") }).catch(() => {});
  }
  await attached?.close();
  attached = undefined;
  await context?.close();
  await rm(profile, { recursive: true, force: true });
});

async function getTab(id: number) {
  // Chrome may replace a tab ID when discarding its WebContents. Follow its original URL.
  const result = await worker.evaluate(async ({ id, url }) => {
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
	const tab = await worker.evaluate((props) => chrome.tabs.create(props), { url: `${base}/${encodeURIComponent(title)}`, active: false, windowId, ...options });
	const id = tab.id as number;
	await expect.poll(async () => (await getTab(id)).status).toBe("complete");
	return id;
}

async function popup() {
  await worker.evaluate(() => chrome.action.openPopup());
  // Discover the real toolbar popup, omitted by the initial persistent context.
  attached = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  worker = attached.contexts()[0].serviceWorkers()[0];
  const page = attached.contexts()[0].pages().find((page) => page.url().endsWith("/popup.html"));
  if (!page) throw new Error("Chrome did not open the toolbar popup");
  await expect(page.locator("#counts")).toContainText("suspended");
  return page;
}

async function discardState(ids: number[]) {
  return Promise.all(ids.map(async (id) => (await getTab(id)).discarded));
}

test("individual suspension preserves the original URL and Chrome restores the document", async () => {
	const id = await createTab("Architecture notes");
	const original = await getTab(id);
	const page = await popup();
	await page.getByRole("button", { name: "Suspend Architecture notes", exact: true }).click();
	await expect.poll(() => discardState([id])).toEqual([true]);
	expect((await getTab(id)).url).toBe(original.url);
	await expect(page.getByRole("status")).toContainText("1 tab suspended");
	await page.getByRole("button", { name: "Resume Architecture notes", exact: true }).click();
	await expect.poll(async () => (await getTab(id)).discarded).toBe(false);
	await expect.poll(async () => (await getTab(id)).status).toBe("complete");
	const restored = attached?.contexts()[0].pages().find((tab) => tab.url() === original.url) as Page;
	expect(await restored.evaluate(() => (document as Document & { wasDiscarded: boolean }).wasDiscarded)).toBe(true);
});

test("an active tab switches to an existing awake tab before native discard", async () => {
	const neighbor = await createTab("Nearby tab");
	const page = await popup();
	await page.getByRole("button", { name: "Suspend Today", exact: true }).click();
	await expect.poll(() => discardState([activeId])).toEqual([true]);
	expect((await getTab(neighbor)).active).toBe(true);
	expect(await worker.evaluate(() => chrome.tabs.query({}))).toHaveLength(2);
});

test("a single-tab window explains why its active tab cannot be suspended", async () => {
	const page = await popup();
	const button = page.getByRole("button", { name: "Suspend Today", exact: true });
	await expect(button).toBeDisabled();
	await expect(button).toHaveAttribute("title", "Keep another tab awake in this window");
	await expect(page.locator("#suspend-all")).toBeDisabled();
});

test("group and current-window actions preserve active, pinned, and audio tabs", async () => {
	const first = await createTab("Architecture notes");
	const second = await createTab("API reference");
	const outside = await createTab("Later");
	const pinned = await createTab("Pinned", { pinned: true });
	const audio = await createTab("Audio");
	const audioPage = context.pages().find((page) => page.url() === `${base}/Audio`) as Page;
	await audioPage.bringToFront();
	await audioPage.locator("body").click();
	await audioPage.evaluate(() => { void (globalThis as unknown as { audio: AudioContext }).audio.resume(); });
	await expect.poll(async () => (await getTab(audio)).audible).toBe(true);
	await worker.evaluate((id) => chrome.tabs.update(id, { active: true }), activeId);
	const group = await worker.evaluate(async (ids) => {
		const id = await chrome.tabs.group({ tabIds: ids as [number, ...number[]] });
		await chrome.tabGroups.update(id, { title: "Research", color: "green" });
		return id;
	}, [first, second]);
	const page = await popup();
	await page.getByRole("button", { name: "Suspend group Research", exact: true }).click();
	await expect.poll(() => discardState([first, second, outside, activeId, pinned, audio])).toEqual([true, true, false, false, false, false]);
	expect((await getTab(first)).groupId).toBe(group);
	await page.locator("#suspend-window").click();
	await expect.poll(() => discardState([outside, activeId, pinned, audio])).toEqual([true, false, false, false]);
	// Explicit individual suspension may target a tab protected from bulk actions.
	await page.getByRole("button", { name: "Suspend Pinned", exact: true }).click();
	await expect.poll(() => discardState([pinned])).toEqual([true]);
});

test("window and all-window actions keep each window's active tab awake", async () => {
	const local = await createTab("Local tab");
	const other = await worker.evaluate(async (url) => {
		const window = await chrome.windows.create({ url, focused: false });
		if (!window) throw new Error("Could not create a test window");
		return { windowId: window.id as number, activeId: window.tabs?.[0].id as number };
	}, `${base}/Other`);
	const remote = await createTab("Remote tab", { windowId: other.windowId });
	await getTab(other.activeId);
	await worker.evaluate((id) => chrome.windows.update(id, { focused: true }), windowId);
	const page = await popup();
	await page.locator(`#window-${other.windowId}`).click();
	await expect.poll(() => discardState([local, remote, activeId, other.activeId])).toEqual([false, true, false, false]);
	await page.locator("#suspend-all").click();
	await expect.poll(() => discardState([local, remote, activeId, other.activeId])).toEqual([true, true, false, false]);
});

// biome-ignore lint/correctness/noEmptyPattern: Playwright requires destructured fixture arguments.
test("popup search, light/dark appearance, and responsive layout", async ({}, info) => {
	const first = await createTab("Architecture notes");
	const second = await createTab("Design references");
	await createTab("Weekend reading");
	await worker.evaluate(async (ids) => {
		const groupId = await chrome.tabs.group({ tabIds: ids as [number, ...number[]] });
		await chrome.tabGroups.update(groupId, { title: "Research", color: "green" });
	}, [first, second]);
	const page = await popup();
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));
	await page.getByRole("searchbox").fill("Research");
	await expect(page.locator(".tab-row")).toHaveCount(2);
	await page.getByRole("searchbox").fill("nothing matches");
	await expect(page.locator("#empty")).toBeVisible();
	await page.getByRole("searchbox").fill("");
	for (const colorScheme of ["light", "dark"] as const) {
		await page.emulateMedia({ colorScheme });
		await page.screenshot({ path: info.outputPath(`popup-${colorScheme}.png`) });
		const dimensions = await page.evaluate(() => ({ content: document.documentElement.scrollWidth, viewport: innerWidth }));
		expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport);
	}
	expect(errors).toEqual([]);
});
