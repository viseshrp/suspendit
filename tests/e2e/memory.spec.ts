import { expect, test } from "@playwright/test";
import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { promisify } from "node:util";
import { browserCommand, close, evaluate, launch, target } from "../helpers/browser";

const run = promisify(execFile);

async function rendererMemory(ids?: number[]) {
	if (!ids) {
		const { processInfo } = await browserCommand<{ processInfo: { type: string; id: number }[] }>("SystemInfo.getProcessInfo");
		ids = processInfo.filter((process) => process.type === "renderer").map((process) => process.id);
	}
	if (!ids.length) return [];
	const { stdout } = await run("ps", ["-o", "pid=,rss=", "-p", ids.join(",")]);
	return stdout.trim().split("\n").filter(Boolean).map((line) => {
		const [id, kib] = line.trim().split(/\s+/).map(Number);
		return { id, mib: kib / 1024 };
	});
}

for (const route of ["tab", "all windows"] as const) {
	for (const sameSite of [false, true]) {
		// biome-ignore lint/correctness/noEmptyPattern: Playwright requires destructured fixture arguments.
		test(`placeholder suspension releases memory: ${route}, ${sameSite ? "same-site" : "separate-site"} awake tab`, async ({}, info) => {
			test.setTimeout(90_000);
			test.skip(process.platform === "win32", "Renderer RSS measurement uses macOS/Linux ps.");
			let allocate: (() => void) | undefined;
			let heartbeats = 0;
			let pageLoads = 0;
			const server = createServer((req, res) => {
				if (req.url === "/allocate") { allocate = () => res.end("go"); return; }
				if (req.url === "/heartbeat") { heartbeats++; res.end("alive"); return; }
				res.setHeader("Content-Type", "text/html");
				res.setHeader("Cache-Control", "no-store");
				if (req.url === "/heavy") pageLoads++;
				res.end(req.url === "/heavy" ? `<!doctype html><html lang="en"><title>Memory fixture waiting</title><script>
				fetch('/allocate').then(() => {
					window.buffers = Array.from({ length: 8 }, () => {
						const bytes = new Uint8Array(16 * 1024 * 1024);
						for (let offset = 0; offset < bytes.length; offset += 65536) {
							crypto.getRandomValues(bytes.subarray(offset, offset + 65536));
						}
						return bytes;
					});
					document.title = "Memory fixture ready";
					setInterval(() => {
						for (const bytes of window.buffers) for (let offset = 0; offset < bytes.length; offset += 4096) bytes[offset] ^= 1;
						fetch('/heartbeat');
					}, 500);
				});
				</script><p>128 MiB held until Chrome unloads this page.</p></html>` :
					"<!doctype html><html lang=en><title>Awake tab</title><p>Keep this tab awake.</p></html>");
			});
			await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
			const address = server.address();
			if (!address || typeof address === "string") throw new Error("Test server did not start");
			try {
				const worker = await launch(`http://127.0.0.1:${address.port}/idle`);
				const version = await browserCommand<{ product: string }>("Browser.getVersion");
				const [awake] = await evaluate(worker, () => chrome.tabs.query({ active: true }));
				const url = `http://${sameSite ? "127.0.0.1" : "localhost"}:${address.port}/heavy`;
				await evaluate(worker, (options) => chrome.tabs.create(options), { url, active: false, ...(sameSite ? { openerTabId: awake.id } : {}) });
				const getTab = async () => (await evaluate(worker, () => chrome.tabs.query({}))).find((tab) => tab.url === url || tab.url?.includes(encodeURIComponent(url))) as chrome.tabs.Tab;
				await expect.poll(() => Boolean(allocate)).toBe(true);
				await expect.poll(async () => (await getTab()).status).toBe("complete");
				await evaluate(worker, (id) => chrome.action.openPopup({ windowId: id }), awake.windowId);
				const popup = await target((entry) => entry.url.endsWith("/popup.html"));
				await expect.poll(() => evaluate(popup, () => Boolean(document.querySelector('[aria-label="Suspend Memory fixture waiting"]')))).toBe(true);
				await new Promise((resolve) => setTimeout(resolve, 500));
				const baseline = await rendererMemory();
				allocate?.();
				await expect.poll(async () => (await getTab()).title).toBe("Memory fixture ready");
				await expect.poll(() => heartbeats).toBeGreaterThan(0);
				const before = await rendererMemory();
				// The fixture is already running at baseline. Ignore newly started renderers:
				// their entire RSS must not be mistaken for the fixture's allocation.
				const growth = before.filter((process) => baseline.some((previous) => previous.id === process.id)).map((process) => ({ ...process,
					growthMiB: process.mib - (baseline.find((previous) => previous.id === process.id)?.mib ?? 0),
				})).sort((a, b) => b.growthMiB - a.growthMiB);
				await writeFile(info.outputPath("allocation.json"), JSON.stringify({ baseline, before, growth }, null, 2));
				const fixture = growth[0];
				expect(fixture.growthMiB).toBeGreaterThan(96);
				const selector = route === "tab" ? '[aria-label="Suspend Memory fixture ready"]' : "#suspend-all";
				await expect.poll(() => evaluate(popup, (selector) => Boolean(document.querySelector<HTMLButtonElement>(selector) && !document.querySelector<HTMLButtonElement>(selector)?.disabled), selector)).toBe(true);
				await evaluate(popup, (selector) => { document.querySelector<HTMLButtonElement>(selector)?.click(); }, selector);
				await expect.poll(async () => (await getTab()).url).toContain("/suspended.html#");
				const started = performance.now();
				const samples: { elapsedMs: number; heartbeats: number; processes: Awaited<ReturnType<typeof rendererMemory>> }[] = [];
				// Chrome can keep an empty renderer alive for its 23-second reuse timer.
				// Require physical memory release, with 12 seconds of scheduling headroom.
				while (true) {
					const processes = await rendererMemory(before.map((process) => process.id));
					const elapsedMs = performance.now() - started;
					samples.push({ elapsedMs, heartbeats, processes });
					const released = fixture.mib - (processes.find((process) => process.id === fixture.id)?.mib ?? 0);
					if (elapsedMs >= 35_000 || (elapsedMs >= 3_000 && released > 64)) break;
					await new Promise((resolve) => setTimeout(resolve, 500));
				}
				const after = samples[samples.length - 1];
				const afterMiB = after.processes.find((process) => process.id === fixture.id)?.mib ?? 0;
				const releasedMiB = fixture.mib - afterMiB;
				const finalProcesses = await rendererMemory();
				const measurement = { browser: version.product, route, sameSite, finalProcesses, allocationMiB: 128, baseline, before, samples,
					fixture: { processId: fixture.id, growthMiB: fixture.growthMiB, beforeMiB: fixture.mib, afterMiB, releasedMiB },
				};
				await writeFile(info.outputPath("memory.json"), `${JSON.stringify(measurement, null, 2)}\n`);
				console.log(JSON.stringify({ browser: version.product, route, sameSite, observedMs: Math.round(after.elapsedMs), ...measurement.fixture }));
				// Require stopped page activity, no spontaneous reload, an awake neighbor,
				// and restoration only after an explicit Resume click.
				for (const sample of samples.slice(-5)) expect(sample.heartbeats).toBe(after.heartbeats);
				expect(pageLoads).toBe(1);
				expect(await getTab()).toMatchObject({ active: false, discarded: true });
				expect(await evaluate(worker, (id) => chrome.tabs.get(id), awake.id as number)).toMatchObject({ active: true, discarded: false, status: "complete" });
				await evaluate(worker, (id) => chrome.tabs.update(id, { active: true }), (await getTab()).id as number);
				await evaluate(worker, (id) => chrome.windows.update(id, { focused: true }), awake.windowId);
				const placeholder = await target((entry) => entry.url.includes("/suspended.html#"));
				await expect.poll(() => evaluate(placeholder, () => {
					const button = document.querySelector<HTMLButtonElement>("#resume");
					return Boolean(button && !button.disabled);
				})).toBe(true);
				expect(pageLoads).toBe(1);
				await evaluate(placeholder, () => document.querySelector<HTMLButtonElement>("#resume")?.click());
				await expect.poll(() => pageLoads).toBe(2);
				await expect.poll(async () => (await getTab()).status).toBe("complete");
				const restored = await target((entry) => entry.url === url);
				expect(await evaluate(restored, () => location.href)).toBe(url);
				expect(releasedMiB).toBeGreaterThan(64);
			} finally {
				await close(info.outputPath("chrome.log"));
				await new Promise<void>((resolve) => server.close(() => resolve()));
			}
		});
	}
}
