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

Unit/integration tests cover discard-before-navigation, conversion of existing native discards,
active-tab handoff, scope/protection changes during suspension, partial failures, replacement
IDs, context-menu routing, sender validation, placeholder address validation, safe text rendering,
explicit restoration, popup search/actions, collapse state, favicon fallback, row reuse, and
out-of-order browser queries. Every production TypeScript file is included in coverage, with
90% minimum statements, branches, functions, and lines.

The Playwright suite loads the **production extension** into a fresh temporary Chrome profile.
It exercises the real popup, every action scope, active/pinned/audio protections, original
web and local-file address restoration, placeholder reloads, browser restart recovery, keyboard activation,
light/dark/narrow layouts, fixed popup controls, collapsible groups, and Chrome favicons.
Fixture sites run on loopback. No mocked extension APIs or test entrypoints ship in the build.

The helper attaches DevTools to the worker and popup while suspending. Ordinary site pages
stay detached because discarding attached renderers crashed Chromium 145/153. Tests attach to
placeholders/restored documents after activation. Chrome can replace tab IDs during discard;
tests follow each fixture's original address, including its saved placeholder metadata.

CI uses headless Chrome on Ubuntu. Isolated profiles are deleted after each case, with brief
retries while Chrome finishes profile writes. Screenshots, browser logs, memory samples, and
performance reports are uploaded even when a test fails. The audible-tab check briefly plays
a quiet tone. No test inspects or changes the user's personal Chrome tabs.

## Memory release

`tests/e2e/memory.spec.ts` is a mandatory memory regression check on macOS and Linux.
A fixture allocates 128 MiB of random bytes and touches its pages while sending heartbeats.
The test identifies its renderer from an RSS increase of over 96 MiB after allocation,
excluding newly started processes so their entire footprint cannot be mistaken for allocation.

Individual and all-window popup actions run with both same-site and separate-site awake tabs.
Each case requires:

- More than 64 MiB of renderer RSS released within 35 seconds.
- Stopped original-page heartbeats and no spontaneous reload.
- A saved placeholder that also becomes natively discarded in the background.
- An unaffected awake neighbor.
- The original address loaded only after selecting the placeholder and clicking **Resume page**.

The 35-second observation window allows Chrome's 23-second empty-renderer reuse timer plus
scheduling headroom. Tests sample at 500 ms intervals and observe at least 3 seconds even if
release is immediate. They never disable Chrome lifecycle features, force garbage collection,
or kill a renderer to obtain a passing measurement.

There is no optional strict-mode flag: retained memory fails the default suite. `allocation.json`
and `memory.json` preserve baselines, identified PID, Chrome version, action scope, timed RSS/
heartbeat samples, final renderer processes, and before/after measurements. Evidence is written
before assertions. `ps` reads only process IDs returned by the isolated test browser. Windows
skips this OS-specific check. RSS measures physical process memory, not an exact per-tab or
system-wide saving.

```sh
pnpm build
pnpm exec playwright test memory.spec.ts
```

`SUSPENDIT_TEST_CHROME=/absolute/path/to/chrome` selects a Chrome for Testing executable.
`SUSPENDIT_TEST_HEADED=1` runs the owned test browser visibly. Both still use a temporary profile.
See [memory troubleshooting](troubleshooting.md) for observed Chrome 154 results and timing.

## Large tab sessions

`tests/e2e/performance.spec.ts` creates real sessions containing 500 and 1,000 tabs. It creates
placeholder fixtures in batches of at most 16, allowing the production worker to unload each
batch before continuing. One loopback page stays awake, and tabs are grouped in sets of 25.
The fixtures exercise original-title/address decoding, favicons, and placeholder eligibility
without loading 1,000 live websites simultaneously.

The test measures opening, searching, clearing search, a group rename, and a live page title
change. All rows must survive updates and filtering, with keyboard focus and scroll position
preserved. Opening must take under 2 seconds, search/clear under 500 ms, and each live update
under 1 second. `performance.json` records the measurements. These are regression limits,
not timing promises for every computer.

```sh
pnpm build
pnpm exec playwright test performance.spec.ts
```

## Manual check

1. Load `.output/chrome-mv3` unpacked. Open ordinary web tabs in two windows, including a
   group, a pinned tab, and a tab playing audio. Confirm bulk actions protect them as specified.
2. Right-click a page and choose **Suspend this tab**. Another existing awake tab should become
   active. Selecting the suspended tab should show the yellow placeholder; **Resume page**
   should restore the original address. The popup's Resume action should work too.
3. Restart Chrome with session restoration enabled. Check saved titles, addresses, and Resume.
   In a single-awake-tab window, check the disabled individual action and its explanation.
4. Scroll a long popup list. Confirm one scrollbar, fixed controls, collapsible groups, searchable
   original titles/addresses, and recognizable site icons.
5. Watch live memory in Chrome's Task manager for about 30 seconds after suspension. Compare
   the original renderer, not a cached tab-hovercard reading.

The smoke check validates exactly two HTML pages, the existing four permissions, local icons,
no content scripts/options/localization, a 32 KiB JavaScript limit, and a 100 KiB ZIP limit.
