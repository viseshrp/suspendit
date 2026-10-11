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
		description: "Free up memory. Unload tabs, groups, or windows and keep a lightweight page to resume them when you need them.",
		minimum_chrome_version: "120",
		homepage_url: "https://github.com/viseshrp/suspendit",
		permissions: ["tabs", "tabGroups", "contextMenus", "favicon", "storage"],
		action: { default_title: "SuspendIt", default_icon: icons },
		icons,
	},
});
