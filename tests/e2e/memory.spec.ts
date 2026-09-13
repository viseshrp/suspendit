import { expect, test } from "@playwright/test";
import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { promisify } from "node:util";
import { browserCommand, close, evaluate, launch, target } from "../helpers/browser";

const run = promisify(execFile);

async function rendererMemory() {
	const { processInfo } = await browserCommand<{ processInfo: { type: string; id: number }[] }>("SystemInfo.getProcessInfo");
	const ids = processInfo.filter((process) => process.type === "renderer").map((process) => process.id);
	const { stdout } = await run("ps", ["-o", "pid=,rss=", "-p", ids.join(",")]);
	return stdout.trim().split("\n").map((line) => {
		const [id, kib] = line.trim().split(/\s+/).map(Number);
		return { id, mib: kib / 1024 };
	});
}

for (const route of ["popup", "direct API"] as const) {
	for (const sameSite of [false, true]) {
		// biome-ignore lint/correctness/noEmptyPattern: Playwright requires destructured fixture arguments.
		test(`native discard lifecycle and memory: ${route}, ${sameSite ? "same-site" : "separate-site"} awake tab`, async ({}, info) => {
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
					setInterval(() => fetch('/heartbeat'), 500);
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
				const getTab = async () => (await evaluate(worker, (url) => chrome.tabs.query({ url }), url))[0];
				await expect.poll(() => Boolean(allocate)).toBe(true);
				await expect.poll(async () => (await getTab()).status).toBe("complete");
				let popup: typeof worker | undefined;
				if (route === "popup") {
					await evaluate(worker, () => chrome.action.openPopup());
					popup = await target((entry) => entry.url.endsWith("/popup.html"));
					await expect.poll(() => evaluate(popup as typeof worker, () => Boolean(document.querySelector('[aria-label="Suspend Memory fixture waiting"]')))).toBe(true);
				}
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
				const fixture = growth[0];
				expect(fixture.growthMiB).toBeGreaterThan(96);
				if (popup) {
					await expect.poll(() => evaluate(popup as typeof worker, () => Boolean(document.querySelector('[aria-label="Suspend Memory fixture ready"]')))).toBe(true);
					await evaluate(popup, () => { document.querySelector<HTMLButtonElement>('[aria-label="Suspend Memory fixture ready"]')?.click(); });
				} else {
					// Control: never open the popup and bypass SuspendIt's action handling.
					await evaluate(worker, async (url) => {
						const [tab] = await chrome.tabs.query({ url });
						await chrome.tabs.discard(tab.id as number);
					}, url);
				}
				await expect.poll(async () => (await getTab()).discarded).toBe(true);
				const started = performance.now();
				const samples: { elapsedMs: number; heartbeats: number; processes: Awaited<ReturnType<typeof rendererMemory>> }[] = [];
				// A native discard does not promise an RSS decrease by a deadline. Observe
				// actual memory separately; strict mode reproduces retained-memory runs.
				while (true) {
					const processes = await rendererMemory();
					const elapsedMs = performance.now() - started;
					samples.push({ elapsedMs, heartbeats, processes });
					const released = fixture.mib - (processes.find((process) => process.id === fixture.id)?.mib ?? 0);
					if (elapsedMs >= 15_000 || (elapsedMs >= 3_000 && released > 64)) break;
					await new Promise((resolve) => setTimeout(resolve, 500));
				}
				const after = samples[samples.length - 1];
				const afterMiB = after.processes.find((process) => process.id === fixture.id)?.mib ?? 0;
				const releasedMiB = fixture.mib - afterMiB;
				const measurement = { browser: version.product, route, sameSite, allocationMiB: 128, baseline, before, samples,
					fixture: { processId: fixture.id, growthMiB: fixture.growthMiB, beforeMiB: fixture.mib, afterMiB, releasedMiB },
				};
				await writeFile(info.outputPath("memory.json"), `${JSON.stringify(measurement, null, 2)}\n`);
				console.log(JSON.stringify({ browser: version.product, route, sameSite, observedMs: Math.round(after.elapsedMs), ...measurement.fixture }));
				if (releasedMiB <= 64) info.annotations.push({ type: "memory", description: "Chrome retained renderer RSS during the observation window; see memory.json." });
				// Require stopped page activity, no spontaneous reload, an awake neighbor,
				// and a fresh document when the user returns, regardless of RSS retention.
				for (const sample of samples.slice(-5)) expect(sample.heartbeats).toBe(after.heartbeats);
				expect(pageLoads).toBe(1);
				expect(await getTab()).toMatchObject({ url, discarded: true, active: false });
				expect(await evaluate(worker, (id) => chrome.tabs.get(id), awake.id as number)).toMatchObject({ active: true, discarded: false, status: "complete" });
				await evaluate(worker, (id) => chrome.tabs.update(id, { active: true }), (await getTab()).id as number);
				await expect.poll(() => pageLoads).toBe(2);
				await expect.poll(async () => (await getTab()).status).toBe("complete");
				const restored = await target((entry) => entry.url === url);
				expect(await evaluate(restored, () => (document as Document & { wasDiscarded: boolean }).wasDiscarded)).toBe(true);
				if (process.env.SUSPENDIT_REQUIRE_MEMORY_RELEASE === "1") expect(releasedMiB).toBeGreaterThan(64);
			} finally {
				await close(info.outputPath("chrome.log"));
				await new Promise<void>((resolve) => server.close(() => resolve()));
			}
		});
	}
}
