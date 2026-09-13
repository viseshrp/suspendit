# Memory after suspension

SuspendIt uses `chrome.tabs.discard()` and only counts success when Chrome returns
`discarded: true`. The popup reads that same Chrome property when showing **Suspended**.
Chrome owns the page's unloading, memory release, and reload on activation.

## Live memory can stay high after native discard

This is reproducible in an isolated browser, not just a possible stale display. A test page
holding 128 MiB stopped its periodic network activity after native discard, while its
renderer's resident memory (RSS) stayed around 256 MiB for the 15-second observation window.
We observed this with Chrome for Testing 152.0.7977.82 and 153.0.8010.12, including direct
`chrome.tabs.discard()` calls. Other runs returned more than 140 MiB. Memory reclamation
was not consistent enough to promise an immediate reduction.

Chrome's [discard implementation](https://github.com/chromium/chromium/blob/152.0.7977.83/chrome/browser/resource_coordinator/utils.cc#L33)
first attempts to stop the renderer, subject to other frames, workers, and process-lifetime
constraints. Its [fallback](https://github.com/chromium/chromium/blob/152.0.7977.83/third_party/blink/renderer/bindings/core/v8/script_controller.cc#L235)
discards the document within a surviving renderer. An unloaded page and a renderer returning
memory to the OS are separate observations.

SuspendIt cannot force that release through the native Tabs API. The investigation has not
produced an extension-side fix within the native-only requirement. The test results also do
not establish the cause of any particular tab in a user's installed profile.

## Chrome still shows the old memory number

The memory value in Chrome's tab strip or hovercard is not a live memory measurement. In
Chrome 152.0.7977.83, the resource collector refreshes on a two-minute interval and when a page
finishes loading. It writes a new value only when a memory result exists, so an unloaded page
can retain its last reported value.

Chrome also limits its **inactive tab** and memory-savings presentation to discards initiated
by Memory Saver or its performance suggestions. An extension's native discard is classified
as external and does not get that presentation. The hovercard can therefore continue showing
its cached memory-usage value after SuspendIt has discarded the page.

These behaviors are visible in Chrome 152's
[resource collector](https://github.com/chromium/chromium/blob/152.0.7977.83/chrome/browser/ui/performance_controls/tab_resource_usage_collector.cc),
[discard indicator rules](https://github.com/chromium/chromium/blob/152.0.7977.83/chrome/browser/ui/tab_ui_helper.cc#L346),
and [hovercard display](https://github.com/chromium/chromium/blob/152.0.7977.83/chrome/browser/ui/views/tabs/hovercard/tab_hover_card_bubble_view.cc#L480).
This explains a possible stale display; it does not prove that every reported memory issue
has the same cause.

## Check the affected tab

1. Keep another tab selected so the suspended page stays unloaded.
2. Open Chrome's menu, then **More tools → Task manager**, and locate the affected page.
3. Compare the live task/process memory there. Selecting the suspended tab reloads it and
   allocates memory again.

Tabs from the same site can share a renderer process. Other live pages, frames, or workers
can keep that process alive, and a process-wide memory figure is not an individual tab's usage.
Chrome's [process model](https://chromium.googlesource.com/chromium/src/+/main/docs/process_model_and_site_isolation.md)
describes these sharing rules.

If the page still has a live task with unchanged memory, record the Chrome version, page,
process ID, and memory reading for investigation. An unchanged browser-wide total or hovercard
value alone is insufficient to conclude that the page stayed loaded.

The extension does not have a native API to refresh Chrome's hovercard memory cache or
force a shared renderer to exit. The [memory diagnostic](TESTING.md#memory-release)
records actual renderer RSS separately from its lifecycle assertions. Its optional strict
mode fails when the renderer does not release 64 MiB within the observation window, preserving
a reproducible check for the retained-memory behavior.
