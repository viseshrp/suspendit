# Testing

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm quality
pnpm test
pnpm smoke
pnpm test:e2e
pnpm package
```

Unit/integration tests cover native discard decisions, active-tab handoff, scope changes,
partial failures, replaced tab IDs, context-menu registration/routing, message validation,
popup search/actions, safe title rendering, and browser errors. Coverage includes every
production TypeScript file and requires 90% statements, branches, functions, and lines.

The Playwright suite launches its bundled Chrome with the **production extension** in a
fresh temporary profile. It opens the real toolbar popup and checks native discarded state,
preservation of the page URL and group, reloading with `document.wasDiscarded`, all action
scopes, pinned/audio/active protection, the single-tab limitation, search, and light/dark
layout. HTTP test pages are served on loopback. There are no test entrypoints or mocked
extension APIs in this suite.

The test helper connects through Chrome's DevTools protocol to the extension worker and
popup only. Attaching Playwright to every web page caused Chromium 145 and 153 to crash when
native discard destroyed an attached page's renderer, on both macOS and Ubuntu. The tests
leave ordinary pages detached during suspension and inspect their state using `chrome.tabs`.
They attach to the restored page only after activation to check `document.wasDiscarded`.
Chrome can replace tab IDs while discarding; assertions follow each test page's original URL.

CI runs the browser suite on Ubuntu. Automated tests use full Chrome in headless mode;
the manual steps below cover visible browser interaction. Test profiles are isolated and
deleted after each case. The suite saves
popup screenshots and browser logs. The audio test briefly plays a quiet tone to verify
Chrome's real audible-tab state.

## Manual check

1. Load `.output/chrome-mv3` unpacked and open several ordinary web tabs in two windows.
2. Create a group, pin a tab, and start audio in another tab. Use group/window/all-window
   actions and confirm the active, pinned, and audio tabs stay awake.
3. Right-click a page, choose **Suspend this tab**, and verify another existing awake tab
   becomes active. Selecting the suspended tab should reload the original URL.
4. In a window containing only one awake tab, confirm individual suspension explains the
   limitation. Check the toolbar **!** tooltip after a refused context-menu action.

The page context menu was also checked with native mouse input in an isolated Chrome for
Testing profile: the popup reported one suspended tab, and its Resume action loaded the
original page URL.

The smoke check validates the production manifest, sole HTML page, permission list, icon
files, 32 KiB JavaScript limit, and 100 KiB ZIP limit.
