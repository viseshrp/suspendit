import { suspendedUrl } from "../shared/suspended";
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
				...(request.scope === "window" || request.scope === "selected" ? { windowId: request.id } : {}),
				...(request.scope === "group" ? { groupId: request.id } : {}),
				...(request.scope === "selected" ? { highlighted: true } : {}),
			});
		await runWithConcurrency(tabs, 4, async (original) => {
			try {
				// Re-read immediately before each action: tabs can move, close, or start audio.
				const tab = original.id === undefined ? original : await chrome.tabs.get(original.id);
				if (skipReason(tab, bulk) ||
					((request.scope === "window" || request.scope === "selected") && tab.windowId !== request.id) ||
					(request.scope === "group" && tab.groupId !== request.id) ||
					(request.scope === "selected" && !tab.highlighted)) {
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
				// Discard first so the old document cannot survive in the back/forward cache.
				const discarded = tab.discarded ? tab : await chrome.tabs.discard(tab.id as number);
				if (!discarded?.discarded) throw new Error("Chrome could not suspend this tab.");
				if (!bulk) result.tabId = discarded.id;
				const current = await chrome.tabs.get(discarded.id as number);
				// Selection membership was confirmed before discard; only window moves invalidate it here.
				if (current.active || current.pendingUrl || current.url !== tab.url || !current.discarded ||
					skipReason(current, bulk) ||
					((request.scope === "window" || request.scope === "selected") && current.windowId !== request.id) ||
					(request.scope === "group" && current.groupId !== request.id)) {
					throw new Error("The tab changed while suspending. Try again.");
				}
				const savedUrl = suspendedUrl(tab);
				const updated = await chrome.tabs.update(current.id as number, { url: savedUrl });
				if ((updated?.pendingUrl ?? updated?.url) !== savedUrl) throw new Error("Chrome could not save the suspended page.");
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
