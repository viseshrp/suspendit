# Product requirements

- English-only Chrome extension with a plain popup and native context menu.
- Suspend individual tabs, Chrome tab groups, individual windows, or all normal windows.
- Only `chrome.tabs.discard()` may suspend a page. Preserve the tab, URL, history, and Chrome's restoration behavior.
- Reuse TabMD/nufftabs build, setup, CI/release, tests, and code organization wherever applicable.
- Plain functions, TypeScript, HTML, CSS; no UI framework, runtime dependencies, classes, adapters, options page, or translations.
- Generate a scalable icon from SVG. Test the production extension with Playwright in isolated Chromium.
- Make focused commits and push each completed part.

## Suspension behavior

Select an existing awake neighbor before individually discarding an active tab. If there is no awake neighbor in the same window, explain the limitation. Bulk actions protect active, pinned, and audible tabs. An explicit individual action may suspend a pinned or audible tab.

Chrome restores the original document when its tab is selected. There is no replacement page or custom restore mechanism.

Source: [Chrome Tabs API](https://developer.chrome.com/docs/extensions/reference/api/tabs#method-discard).
