import { defineConfig } from "wxt";

const icons = Object.fromEntries(
	[16, 19, 32, 38, 48, 96, 128].map((size) => [size, `icon/${size}.png`]),
);

export default defineConfig({
	entrypointsDir: "entrypoints",
	outDirTemplate: "{{browser}}-mv{{manifestVersion}}{{modeSuffix}}",
	vite: () => ({ build: { sourcemap: false } }),
	manifest: {
		version: process.env.RELEASE_VERSION ?? "1.0.0",
		name: "SuspendIt",
		description: "Free up memory. Suspend tabs, groups, or windows using Chrome’s native tab discarding.",
		minimum_chrome_version: "120",
		homepage_url: "https://github.com/viseshrp/suspendit",
		permissions: ["tabs", "tabGroups", "contextMenus"],
		action: { default_title: "SuspendIt", default_icon: icons },
		icons,
	},
});
