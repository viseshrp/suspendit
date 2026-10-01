export function pageAddress(value: string): boolean {
	try { return ["http:", "https:", "file:"].includes(new URL(value).protocol); }
	catch { return false; }
}

export function suspendedUrl(tab: chrome.tabs.Tab): string {
	const url = tab.url ?? "";
	if (!pageAddress(url)) throw new Error("This page cannot be suspended.");
	return `${chrome.runtime.getURL("suspended.html")}#${new URLSearchParams({ url, title: tab.title || url })}`;
}

export function suspendedPage(address = ""): { url: string; title: string } | undefined {
	const prefix = `${chrome.runtime.getURL("suspended.html")}#`;
	if (!address.startsWith(prefix)) return;
	const params = new URLSearchParams(address.slice(prefix.length));
	const url = params.get("url") ?? "";
	if (!pageAddress(url)) return;
	return { url, title: params.get("title") || url };
}

export function isSuspended(tab: chrome.tabs.Tab): boolean {
	return tab.discarded || Boolean(suspendedPage(tab.url));
}
