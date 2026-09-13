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
	const processes = stdout.trim().split("\n").map((line) => {
		const [id, kib] = line.trim().split(/\s+/).map(Number);
		return { id, mib: kib / 1024 };
	});
	return { processes, mib: processes.reduce((sum, process) => sum + process.mib, 0) };
}

// biome-ignore lint/correctness/noEmptyPattern: Playwright requires destructured fixture arguments.
test("native suspension releases a memory-heavy page's renderer memory", async ({}, info) => {
	test.skip(process.platform === "win32", "Renderer RSS measurement uses macOS/Linux ps.");
	let allocate: (() => void) | undefined;
	const server = createServer((req, res) => {
		if (req.url === "/allocate") { allocate = () => res.end("go"); return; }
		res.setHeader("Content-Type", "text/html");
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
		});
		</script><p>128 MiB held until Chrome unloads this page.</p></html>` :
			"<!doctype html><html lang=en><title>Awake tab</title><p>Keep this tab awake.</p></html>");
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address();
	if (!address || typeof address === "string") throw new Error("Test server did not start");
	try {
		const worker = await launch(`http://127.0.0.1:${address.port}/idle`);
		// A separate site isolates the fixture from the awake page's renderer.
		const url = `http://localhost:${address.port}/heavy`;
		await evaluate(worker, (url) => chrome.tabs.create({ url, active: false }), url);
		await expect.poll(() => Boolean(allocate)).toBe(true);
		await evaluate(worker, () => chrome.action.openPopup());
		const popup = await target((entry) => entry.url.endsWith("/popup.html"));
		await expect.poll(() => evaluate(popup, () => Boolean(document.querySelector('[aria-label="Suspend Memory fixture waiting"]')))).toBe(true);
		const baseline = await rendererMemory();
		allocate?.();
		await expect.poll(() => evaluate(popup, () => Boolean(document.querySelector('[aria-label="Suspend Memory fixture ready"]')))).toBe(true);
		const before = await rendererMemory();
		// Identify the fixture renderer by its controlled allocation, without attaching
		// DevTools to the page or mixing in memory from the user's Chrome processes.
		const growth = before.processes.map((process) => ({ ...process,
			growthMiB: process.mib - (baseline.processes.find((previous) => previous.id === process.id)?.mib ?? 0),
		})).sort((a, b) => b.growthMiB - a.growthMiB);
		const fixture = growth[0];
		expect(fixture.growthMiB).toBeGreaterThan(96);
		await evaluate(popup, () => { document.querySelector<HTMLButtonElement>('[aria-label="Suspend Memory fixture ready"]')?.click(); });
		await expect.poll(async () => (await evaluate(worker, (url) => chrome.tabs.query({ url }), url))[0]?.discarded).toBe(true);
		let after = await rendererMemory();
		await expect.poll(async () => {
			after = await rendererMemory();
			return fixture.mib - (after.processes.find((process) => process.id === fixture.id)?.mib ?? 0);
		}, { timeout: 15_000 }).toBeGreaterThan(64);
		const version = await browserCommand<{ product: string }>("Browser.getVersion");
		const afterMiB = after.processes.find((process) => process.id === fixture.id)?.mib ?? 0;
		const measurement = { browser: version.product, allocationMiB: 128, baseline, before, after,
			fixture: { processId: fixture.id, growthMiB: fixture.growthMiB, beforeMiB: fixture.mib, afterMiB, releasedMiB: fixture.mib - afterMiB },
		};
		await writeFile(info.outputPath("memory.json"), `${JSON.stringify(measurement, null, 2)}\n`);
		console.log(JSON.stringify(measurement));
	} finally {
		await close(info.outputPath("chrome.log"));
		await new Promise<void>((resolve) => server.close(() => resolve()));
	}
});
