import { awakeNeighbor, skipReason, type SuspendRequest, type SuspendResult } from "../shared/tabs";
import { getErrorMessage, runWithConcurrency } from "../shared/utils";

export async function suspendTabs(request: SuspendRequest): Promise<SuspendResult> {
	const result: SuspendResult = { suspended: 0, skipped: 0, failed: 0, errors: [] };
	const bulk = request.scope !== "tab";
	try {
		const tabs = request.scope === "tab"
			? [await chrome.tabs.get(request.id)]
			: await chrome.tabs.query({
				windowType: "normal",
				...(request.scope === "window" ? { windowId: request.id } : {}),
				...(request.scope === "group" ? { groupId: request.id } : {}),
			});
		await runWithConcurrency(tabs, 4, async (original) => {
			try {
				// Re-read immediately before each action: tabs can move, close, or start audio.
				const tab = original.id === undefined ? original : await chrome.tabs.get(original.id);
				if (skipReason(tab, bulk) ||
					(request.scope === "window" && tab.windowId !== request.id) ||
					(request.scope === "group" && tab.groupId !== request.id)) {
					result.skipped++;
					return;
				}
				if (!bulk && tab.active) {
					const neighbor = awakeNeighbor(tab, await chrome.tabs.query({ windowId: tab.windowId }));
					if (neighbor?.id === undefined) {
						throw new Error("Keep another tab awake in this window, then try again.");
					}
					await chrome.tabs.update(neighbor.id, { active: true });
				}
				// Chrome alone unloads the page and restores it on activation.
				const discarded = await chrome.tabs.discard(tab.id as number);
				if (!discarded?.discarded) throw new Error("Chrome could not suspend this tab.");
				if (!bulk) result.tabId = discarded.id;
				result.suspended++;
			} catch (error) {
				result.failed++;
				result.errors.push(getErrorMessage(error));
			}
		});
	} catch (error) {
		result.failed++;
		result.errors.push(getErrorMessage(error));
	}
	return result;
}
