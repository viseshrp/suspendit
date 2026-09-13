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
popup search/actions, collapse state, favicon fallback, row reuse during tab moves and updates,
overlapping browser queries, safe title rendering, and browser errors. Coverage includes every
production TypeScript file and requires 90% statements, branches, functions, and lines.

The Playwright suite launches its bundled Chrome with the **production extension** in a
fresh temporary profile. It opens the real toolbar popup and checks native discarded state,
preservation of the page URL and group, reloading with `document.wasDiscarded`, all action
scopes, pinned/audio/active protection, the single-tab limitation, search, and light/dark
layout, fixed controls with one scrollbar, collapsible groups, and Chrome-provided favicons.
HTTP test pages are served on loopback. There are no test entrypoints or mocked
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
popup screenshots, browser logs, and performance measurements; CI uploads these on every run.
Profile deletion retries briefly while Chrome subprocesses finish their final writes.
The audio test briefly plays a quiet tone to verify
Chrome's real audible-tab state.

## Large tab sessions

`tests/e2e/performance.spec.ts` creates real 500- and 1,000-tab sessions in a temporary profile.
Fixture pages load in batches of at most 16, then Chrome natively discards them; the current
page stays awake. Tabs are grouped in sets of 25. This bounds the fixture's memory use while
exercising the full popup with hundreds of actual Chrome tabs.

The test measures opening, searching, clearing search, a native group rename, and a live page
title change. It verifies that all rows survive both updates, filtering reuses rows, and keyboard
focus and scroll position stay unchanged. CI limits opening to 2 seconds, search/clear to 500 ms,
and each live update to 1 second. Reports are saved as `performance.json` in `test-results` and
included in the `playwright-artifacts` CI download.

Example local run on macOS with Chromium 153, September 13, 2026 (milliseconds):

| Tabs | Open | Search | Clear search | Group update | Title update |
| --- | ---: | ---: | ---: | ---: | ---: |
| 500 | 87 | 1.5 | 33.0 | 84.6 | 21.7 |
| 1,000 | 166.6 | 8.9 | 31.3 | 94.2 | 23.4 |

Before row reuse, a group rename replaced all 500 or 1,000 rows. Both now replace zero.
Clearing search at 1,000 tabs took 62.3 ms before and 31.3 ms after. These are single-run
observations, not hardware-independent guarantees. Opening includes automation observation
latency; search includes an animation-frame boundary, and updates include browser event delivery.

To run just this check:

```sh
pnpm build
pnpm exec playwright test performance.spec.ts
```

## Manual check

1. Load `.output/chrome-mv3` unpacked and open several ordinary web tabs in two windows.
2. Create a group, pin a tab, and start audio in another tab. Use group/window/all-window
   actions and confirm the active, pinned, and audio tabs stay awake.
3. Right-click a page, choose **Suspend this tab**, and verify another existing awake tab
   becomes active. Selecting the suspended tab should reload the original URL.
4. In a window containing only one awake tab, confirm individual suspension explains the
   limitation. Check the toolbar **!** tooltip after a refused context-menu action.
5. Scroll a long tab list. Confirm search/actions remain fixed with only one scrollbar, collapse
   a group, search for it, and clear search to restore the collapse. Check recognizable site icons.

The page context menu was also checked with native mouse input in an isolated Chrome for
Testing profile: the popup reported one suspended tab, and its Resume action loaded the
original page URL.

The smoke check validates the production manifest, sole HTML page, permission list, icon
files, 32 KiB JavaScript limit, and 100 KiB ZIP limit.
