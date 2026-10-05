import { expect, test } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { close, evaluate, launch, target } from "../helpers/browser";

type UpdateMeasurement = { updateMs: number; reusedRows: number; replacedRows: number; keptFocus: boolean; keptScroll: boolean };
declare global { interface Window { updateMeasurement: Promise<UpdateMeasurement> } }

async function watchUpdate(page: Awaited<ReturnType<typeof target>>, selector: string, title: string) {
	await evaluate(page, ({ selector, title }) => {
		window.updateMeasurement = new Promise((resolve, reject) => {
			const root = document.getElementById("windows") as HTMLElement;
			const list = document.getElementById("tab-list") as HTMLElement;
			const focus = root.querySelector<HTMLButtonElement>(".tab-link") as HTMLButtonElement;
			focus.focus({ preventScroll: true });
			list.scrollTop = 800;
			const scrollTop = list.scrollTop;
			const rows = new Map(Array.from(root.querySelectorAll<HTMLElement>(".tab-row"), (row) => [row.dataset.tabId, row]));
			const start = performance.now();
			const timeout = setTimeout(() => { observer.disconnect(); reject(new Error("Live update was not rendered")); }, 5000);
			let replacedRows = 0;
			const observer = new MutationObserver((records) => {
				for (const record of records) for (const node of record.removedNodes) {
					if (node instanceof Element) replacedRows += Number(node.matches(".tab-row")) + node.querySelectorAll(".tab-row").length;
				}
				if (document.querySelector(selector)?.textContent !== title) return;
				clearTimeout(timeout);
				observer.disconnect();
				const reusedRows = Array.from(root.querySelectorAll<HTMLElement>(".tab-row")).filter((row) => rows.get(row.dataset.tabId) === row).length;
				resolve({ updateMs: performance.now() - start, reusedRows, replacedRows,
					keptFocus: document.activeElement === focus, keptScroll: list.scrollTop === scrollTop });
			});
			observer.observe(root, { subtree: true, childList: true, characterData: true });
		});
	}, { selector, title });
}

// Real Chrome tabs holding suspended-page metadata, unloaded by the production worker.
// Keep at most four fixture pages loading until their URLs commit and the worker unloads them.
// biome-ignore lint/correctness/noEmptyPattern: Playwright requires destructured fixture arguments.
test("opening, searching, and live updates with 500 and 1000 tabs", async ({}, info) => {
	test.setTimeout(180_000);
	const server = createServer((req, res) => {
		res.setHeader("Content-Type", "text/html");
		res.end(`<!doctype html><html lang="en"><title>Reference ${req.url}</title><p>Performance fixture</p></html>`);
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address();
	if (!address || typeof address === "string") throw new Error("Test server did not start");
	const base = `http://127.0.0.1:${address.port}`;
	const measurements: object[] = [];
	try {
		const worker = await launch(`${base}/Today`);
		let count = 1;
		for (const total of [500, 1000]) {
			while (count < total) {
				const size = Math.min(4, total - count);
				const created = await evaluate(worker, async ({ base, start, size }) => {
					const tabs: { id: number; url: string }[] = [];
					for (let index = start; index < start + size; index++) {
						const url = `${base}/Bench-${String(index).padStart(4, "0")}`;
						const saved = `${chrome.runtime.getURL("suspended.html")}#${new URLSearchParams({ url, title: `Reference ${index}` })}`;
						const tab = await chrome.tabs.create({ url: saved, active: false });
						tabs.push({ id: tab.id as number, url: saved });
					}
					return tabs;
				}, { base, start: count, size });
				await expect.poll(() => evaluate(worker, async (ids) => {
					const tabs = await Promise.all(ids.map((id) => chrome.tabs.get(id)));
					return tabs.map((tab) => ({ id: tab.id, url: tab.url, pendingUrl: tab.pendingUrl ?? "", discarded: tab.discarded }));
				}, created.map((tab) => tab.id)), {
					timeout: 8000,
					message: "Fixture placeholders must commit and unload before creating more tabs",
				}).toEqual(created.map((tab) => ({ ...tab, pendingUrl: "", discarded: true })));
				count += size;
			}
			const groupId = await evaluate(worker, async () => {
				const ungrouped = (await chrome.tabs.query({})).filter((tab) => !tab.active && tab.groupId === -1);
				for (let index = 0; index < ungrouped.length; index += 25) {
					const id = await chrome.tabs.group({ tabIds: ungrouped.slice(index, index + 25).map((tab) => tab.id as number) as [number, ...number[]] });
					await chrome.tabGroups.update(id, { title: `Research ${index}`, color: "yellow" });
				}
				return (await chrome.tabGroups.query({}))[0].id;
			});
			expect(await evaluate(worker, () => chrome.tabs.query({}))).toHaveLength(total);
			await evaluate(worker, () => chrome.action.openPopup());
			const page = await target((entry) => entry.url.endsWith("/popup.html"));
			await expect.poll(() => evaluate(page, () => document.querySelectorAll(".tab-row").length)).toBe(total);
			const openMs = await evaluate(page, () => performance.now());
			const search = await evaluate(page, async (total) => {
				const input = document.getElementById("search") as HTMLInputElement;
				const original = document.querySelector(".tab-row");
				const start = performance.now();
				input.value = `Bench-${String(total - 1).padStart(4, "0")}`;
				input.dispatchEvent(new Event("input"));
				await new Promise(requestAnimationFrame);
				const searchMs = performance.now() - start;
				const matches = document.querySelectorAll(".tab-row").length;
				const clearStart = performance.now();
				input.value = "";
				input.dispatchEvent(new Event("input"));
				await new Promise(requestAnimationFrame);
				return { searchMs, clearMs: performance.now() - clearStart, matches, searchRetainedRow: document.querySelector(".tab-row") === original };
			}, total);
			expect(search.matches).toBe(1);
			expect(search.searchRetainedRow).toBe(true);
			const title = `Updated research ${total}`;
			await watchUpdate(page, `[data-group-id="${groupId}"] .group-name`, title);
			await evaluate(worker, ({ groupId, title }) => chrome.tabGroups.update(groupId, { title }), { groupId, title });
			const update = await evaluate(page, () => window.updateMeasurement);
			const [active] = await evaluate(worker, () => chrome.tabs.query({ active: true }));
			const activePage = await target((entry) => entry.url === `${base}/Today`);
			const pageTitle = `Updated page ${total}`;
			await watchUpdate(page, `[data-tab-id="${active.id}"] .tab-title`, pageTitle);
			// Briefly attach to the awake fixture only; no tab is discarded during this check.
			await evaluate(activePage, (title) => { document.title = title; }, pageTitle);
			const tabUpdate = await evaluate(page, () => window.updateMeasurement);
			const measurement = { tabs: total, openMs, ...search, groupUpdate: update, tabUpdate };
			measurements.push(measurement);
			console.log(JSON.stringify(measurement));
			expect(openMs).toBeLessThan(2000);
			expect(search.searchMs).toBeLessThan(500);
			expect(search.clearMs).toBeLessThan(500);
			for (const result of [update, tabUpdate]) {
				expect(result.updateMs).toBeLessThan(1000);
				expect(result.reusedRows).toBe(total);
				expect(result.replacedRows).toBe(0);
				expect(result.keptFocus).toBe(true);
				expect(result.keptScroll).toBe(true);
			}
			await evaluate(page, () => { setTimeout(() => window.close(), 0); });
		}
	} finally {
		await writeFile(info.outputPath("performance.json"), `${JSON.stringify(measurements, null, 2)}\n`);
		await close(info.outputPath("chrome.log"));
		await new Promise<void>((resolve) => server.close(() => resolve()));
	}
});
