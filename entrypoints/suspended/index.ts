import { suspendedPage } from "../shared/suspended";
import { getErrorMessage } from "../shared/utils";

const resume = document.getElementById("resume") as HTMLButtonElement;
const status = document.getElementById("status") as HTMLParagraphElement;
function render() {
	const page = suspendedPage(location.href);
	document.title = page ? `${page.title} · Suspended` : "Tab suspended · SuspendIt";
	(document.getElementById("page-title") as HTMLElement).textContent = page?.title ?? "Page unavailable";
	const address = document.getElementById("page-address") as HTMLElement;
	address.textContent = page?.url ?? "";
	address.title = page?.url ?? "";
	resume.disabled = !page;
	status.textContent = page ? "Your tab stays here until you’re ready." :
		"The saved address is missing or invalid. Use Back to return to the previous page.";
}
resume.addEventListener("click", async () => {
	const page = suspendedPage(location.href);
	if (!page) { render(); return; }
	resume.disabled = true;
	status.textContent = "Loading page…";
	try {
		const tab = await chrome.tabs.getCurrent();
		if (tab?.id === undefined) throw new Error("This tab is no longer available.");
		// Chrome's navigation API also supports local files without host permissions.
		await chrome.tabs.update(tab.id, { url: page.url });
	} catch (error) {
		status.textContent = `Could not resume. ${getErrorMessage(error)}`;
		resume.disabled = false;
	}
});
window.addEventListener("hashchange", render);
render();
