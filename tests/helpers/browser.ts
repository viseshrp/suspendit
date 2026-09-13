import { chromium, expect } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

type Target = { type: string; url: string; webSocketDebuggerUrl: string };
let browser: ChildProcess;
let profile: string;
let port: string;
let log = "";

export async function launch(url: string) {
	profile = await mkdtemp(join(tmpdir(), "suspendit-e2e-"));
	const extension = resolve(".output/chrome-mv3");
	log = "";
	browser = spawn(chromium.executablePath(), [
		`--user-data-dir=${profile}`, "--remote-debugging-port=0", "--enable-automation",
		"--no-first-run", "--no-default-browser-check", "--no-sandbox", "--window-size=1280,900",
		"--use-mock-keychain", "--password-store=basic", "--disable-sync",
		"--autoplay-policy=no-user-gesture-required",
		...(process.env.PW_HEADLESS === "false" ? [] : ["--headless"]),
		`--disable-extensions-except=${extension}`, `--load-extension=${extension}`, url,
	], { stdio: ["ignore", "ignore", "pipe"] });
	browser.stderr?.on("data", (chunk) => { log = (log + chunk).slice(-20_000); });
	await expect.poll(async () => {
		if (browser.exitCode !== null || browser.signalCode !== null) throw new Error(log);
		try { port = (await readFile(join(profile, "DevToolsActivePort"), "utf8")).split("\n")[0]; } catch { return false; }
		return Boolean(port);
	}).toBe(true);
	return target(async (entry) => entry.type === "service_worker" &&
		await evaluate(entry, () => chrome.runtime.getManifest().name === "SuspendIt").catch(() => false));
}

export async function close(outputPath: string) {
	await writeFile(outputPath, log);
	if (browser && browser.exitCode === null && browser.signalCode === null) {
		const exited = new Promise<void>((resolve) => browser.once("exit", () => resolve()));
		browser.kill();
		await exited;
	}
	if (profile) await rm(profile, { recursive: true, force: true });
}

export async function target(matches: (entry: Target) => boolean | Promise<boolean>) {
	let found: Target | undefined;
	await expect.poll(async () => {
		const response = await fetch(`http://127.0.0.1:${port}/json/list`);
		for (const entry of await response.json() as Target[]) {
			if (await matches(entry)) { found = entry; break; }
		}
		return Boolean(found);
	}).toBe(true);
	return found as Target;
}

// Keep DevTools detached from web pages while Chrome discards their renderers.
// Attaching Playwright to every page crashes Chromium during native discard.
export function command<T>(entry: Target, method: string, params = {}, setup: { method: string; params: object }[] = []): Promise<T> {
	return new Promise((resolve, reject) => {
		const socket = new WebSocket(entry.webSocketDebuggerUrl);
		const timeout = setTimeout(() => finish(new Error(`DevTools timed out: ${method}`)), 10_000);
		const requests = [...setup, { method, params }];
		let index = 0;
		let settled = false;
		function finish(error?: Error, value?: T) {
			if (settled) return;
			settled = true;
			clearTimeout(timeout);
			socket.close();
			if (error) reject(error); else resolve(value as T);
		}
		const send = () => socket.send(JSON.stringify({ id: index + 1, ...requests[index] }));
		socket.addEventListener("open", send);
		socket.addEventListener("error", () => finish(new Error(`DevTools connection failed: ${method}`)));
		socket.addEventListener("close", () => finish(new Error(`DevTools target closed: ${method}`)));
		socket.addEventListener("message", (event) => {
			const message = JSON.parse(String(event.data));
			if (message.id !== index + 1) return;
			if (message.error) finish(new Error(message.error.message));
			else if (++index === requests.length) finish(undefined, message.result);
			else send();
		});
	});
}

export async function evaluate<T, A = undefined>(entry: Target, fn: (arg: A) => T, arg?: A): Promise<Awaited<T>> {
	const response = await command<{ result: { value: Awaited<T> }; exceptionDetails?: { text: string; exception?: { description: string } } }>(entry, "Runtime.evaluate", {
		expression: `(${fn})(${JSON.stringify(arg) ?? ""})`, awaitPromise: true, returnByValue: true,
	});
	if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text);
	return response.result.value;
}

export async function screenshot(entry: Target, path: string, colorScheme?: "light" | "dark") {
	// Media overrides belong to a DevTools session; keep it open through capture.
	const setup = colorScheme ? [
		{ method: "Emulation.setEmulatedMedia", params: { features: [{ name: "prefers-color-scheme", value: colorScheme }] } },
		{ method: "Runtime.evaluate", params: { expression: "new Promise(resolve => setTimeout(resolve, 250))", awaitPromise: true } },
	] : [];
	const { data } = await command<{ data: string }>(entry, "Page.captureScreenshot", { format: "png" }, setup);
	await writeFile(path, Buffer.from(data, "base64"));
}
