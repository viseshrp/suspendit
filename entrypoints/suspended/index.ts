import { suspendedPage } from "../shared/suspended";

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
resume.addEventListener("click", () => {
	const page = suspendedPage(location.href);
	if (page) location.replace(page.url);
	else render();
});
window.addEventListener("hashchange", render);
render();
