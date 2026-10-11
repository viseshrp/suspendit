import { isSuspended, pageAddress, suspendedPage } from "./suspended";

// "window" and "selected" carry a window ID; "selected" means that window's highlighted tabs.
export type SuspendRequest =
	| { type: "suspend"; scope: "tab" | "group" | "window" | "selected"; id: number }
	| { type: "suspend"; scope: "all" };

export type SuspendResult = {
	suspended: number;
	skipped: number;
	failed: number;
	errors: string[];
	tabId?: number;
};

export function isSuspendRequest(value: unknown): value is SuspendRequest {
	if (!value || typeof value !== "object") return false;
	const request = value as Partial<SuspendRequest> & { id?: unknown };
	return (
		request.type === "suspend" &&
		(request.scope === "all" ||
			(["tab", "group", "window", "selected"].includes(request.scope ?? "") &&
				typeof request.id === "number" &&
				Number.isInteger(request.id) &&
				request.id >= 0))
	);
}

export function skipReason(tab: chrome.tabs.Tab, bulk: boolean): string {
	if (tab.id === undefined || tab.id < 0) return "Tab unavailable";
	if (suspendedPage(tab.url)) return "Already suspended";
	if (!pageAddress(tab.pendingUrl ?? tab.url ?? "")) return "Browser page";
	if (tab.pendingUrl) return "Page is loading";
	if (bulk && tab.active) return "Active tab";
	if (bulk && tab.pinned) return "Pinned tab";
	if (bulk && tab.audible) return "Playing audio";
	return "";
}

export function awakeNeighbor(tab: chrome.tabs.Tab, tabs: chrome.tabs.Tab[]) {
	return tabs
		.filter((candidate) =>
			candidate.id !== undefined && candidate.id !== tab.id &&
			candidate.windowId === tab.windowId && !isSuspended(candidate) &&
			candidate.status !== "unloaded",
		)
		.sort((a, b) => Math.abs(a.index - tab.index) - Math.abs(b.index - tab.index))[0];
}

export function resultMessage(result: SuspendResult): string {
	const parts = [`${result.suspended} ${result.suspended === 1 ? "tab" : "tabs"} suspended`];
	if (result.skipped) parts.push(`${result.skipped} skipped`);
	if (result.failed) parts.push(`${result.failed} failed`);
	return `${parts.join(" · ")}.${result.errors.length ? ` ${result.errors[0]}` : ""}`;
}
