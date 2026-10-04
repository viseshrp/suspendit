# Product requirements

- English-only Chrome extension with a plain popup and native context menus.
- Suspend individual tabs, Chrome-highlighted tabs in one window, Chrome tab groups, individual windows, or all normal windows.
- Prioritize memory reduction. Use native discard followed by a lightweight local placeholder, preserving the original address/title for explicit restoration. This replaces the earlier native-only requirement with user approval.
- Reuse TabMD/nufftabs build, setup, CI/release, tests, and code organization wherever applicable.
- Plain functions, TypeScript, HTML, CSS; no UI framework, runtime dependencies, classes, adapters, options page, or translations.
- Generate a scalable icon from SVG. Test the production extension with Playwright in isolated Chromium.
- Make focused commits and push each completed part.

## Suspension behavior

Select an existing awake neighbor before individually discarding an active tab. If there is no awake neighbor in the same window, explain the limitation. Bulk actions protect active, pinned, and audible tabs. Suspending selected tabs acts on the tabs Chrome highlights in one window and is a bulk action. An explicit individual action may suspend a pinned or audible tab.

The context menu offers **Suspend this tab** and **Suspend selected tabs** in every context covered by Chrome's `all` value and in the tab strip where Chrome supports the `tab` context. The selection is the highlighted tabs in the clicked tab's window.

Selecting a saved tab shows its placeholder; its Resume button reloads the original address.
The popup also resumes pages. Keep the tab, window, group, and pin state. Discard before
navigation to clear the original document from the back/forward cache. Unload inactive
placeholders too. Do not add host permissions, content scripts, or runtime frameworks.

Source: [Chrome Tabs API](https://developer.chrome.com/docs/extensions/reference/api/tabs#method-discard).
