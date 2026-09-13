export type SuspendRequest =
	| { type: "suspend"; scope: "tab" | "group" | "window"; id: number }
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
			(["tab", "group", "window"].includes(request.scope ?? "") &&
				typeof request.id === "number" &&
				Number.isInteger(request.id) &&
				request.id >= 0))
	);
}

export function skipReason(tab: chrome.tabs.Tab, bulk: boolean): string {
	if (tab.id === undefined || tab.id < 0) return "Tab unavailable";
	if (tab.discarded) return "Already suspended";
	if (!/^(https?:|file:)/i.test(tab.pendingUrl ?? tab.url ?? "")) return "Browser page";
	if (bulk && tab.active) return "Active tab";
	if (bulk && tab.pinned) return "Pinned tab";
	if (bulk && tab.audible) return "Playing audio";
	return "";
}

export function awakeNeighbor(tab: chrome.tabs.Tab, tabs: chrome.tabs.Tab[]) {
	return tabs
		.filter((candidate) =>
			candidate.id !== undefined && candidate.id !== tab.id &&
			candidate.windowId === tab.windowId && !candidate.discarded &&
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
