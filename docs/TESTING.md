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

## Memory release

`tests/e2e/memory.spec.ts` measures memory separately from Chrome's `discarded` flag.
A loopback page waits for the test to request an allocation, then holds 128 MiB of random bytes.
The test identifies the renderer by its measured RSS increase, excluding processes started
after the baseline. It compares the production popup with a direct native-API control that
never opens the popup, each with a same-site and a separate-site awake tab.
The page remains detached from DevTools throughout suspension. Measurements use only process
IDs returned by the isolated test browser, never the user's Chrome processes.

CI requires Chrome's native discarded state, stopped page heartbeats, no spontaneous reload,
an unaffected awake neighbor, and a fresh document with `document.wasDiscarded` on activation.
Renderer RSS is sampled for up to 15 seconds, or at least 3 seconds when it falls by over
64 MiB. Retained memory is recorded explicitly rather than inferred from a passing lifecycle
check. Native discard sometimes leaves RSS unchanged in Chrome 152 and 153, so an RSS deadline
is not a default CI gate. This is an unresolved browser-memory limitation, not a memory fix.

The check runs on macOS and Linux using `ps`; Windows skips this measurement. `memory.json`
records the Chrome version, action route, site relationship, timed process/heartbeat samples,
and the identified renderer's before/after RSS. It is written before lifecycle and strict-memory
assertions, so a retained-memory failure keeps its evidence.
It is included in the existing `playwright-artifacts` CI download. RSS is a process measurement,
not an exact per-tab allocation or a count of memory saved system-wide.

On September 13, 2026, local runs included both a drop from 255.4 MiB to 114.5 MiB in Chromium
153 and unchanged RSS around 256 MiB in Chrome 152/153. The latter also occurred with a direct
native API call. These fixture observations do not establish the memory state of a user's
installed Chrome profile.

```sh
pnpm build
pnpm exec playwright test memory.spec.ts
```

To reproduce the retained-memory failure, enable the strict 64 MiB release assertion:

```sh
SUSPENDIT_REQUIRE_MEMORY_RELEASE=1 pnpm exec playwright test memory.spec.ts
```

`SUSPENDIT_TEST_CHROME=/absolute/path/to/chrome` selects another Chrome for Testing executable;
the helper still creates and deletes an isolated profile. The Chrome 152 comparison used
152.0.7977.82; the installed browser that prompted this investigation was 152.0.7977.83.

See [memory troubleshooting](troubleshooting.md) for Chrome's cached tab memory display and
how to distinguish it from live renderer memory.

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
