# Memory after suspension

SuspendIt discards the original page, replaces it with a lightweight local placeholder, then
unloads that placeholder while it is in the background. The address and title stay in the
placeholder's URL fragment. Selecting the tab shows **Resume page**; clicking it reloads the
original address. Clicking its title in the popup also resumes it.

Native discard alone sometimes stopped a page's activity while leaving its renderer memory
allocated. Replacing the discarded document lets Chrome retire the old page's renderer.
Discarding before navigation also prevents the old document surviving in the back/forward
cache. No website scripts, process-killing APIs, debugger permissions, or Chrome flags are used
by the extension.

## Memory release can take a few seconds

Chrome may retain an empty renderer briefly for reuse. Chrome 154's
[transient keep-alive policy](https://github.com/chromium/chromium/blob/154.0.8037.92/chrome/browser/performance_manager/policies/transient_keep_alive_policy.cc)
has a [23-second default timeout](https://github.com/chromium/chromium/blob/154.0.8037.92/components/performance_manager/features.cc).
[Local tests](measurements/2026-10-01-memory.json) with Chrome for Testing 154.0.8037.92 showed the original renderer exiting after
about 23 seconds in four consecutive cases. Each fixture held 128 MiB of random bytes; its
renderer RSS fell from 216–222 MiB to zero. These are isolated fixture measurements, not a
promise of an identical saving for every website.

Other tabs, frames, or workers can share a process and keep it alive. Chrome controls those
resources. The extension cannot promise that the whole browser's memory will immediately
fall by a fixed amount. A suspended count measures tabs, not RAM saved.

The [automated memory test](TESTING.md#memory-release) now requires a measured decrease of
over 64 MiB within 35 seconds for each 128 MiB fixture. A `discarded: true` flag alone cannot
pass that test.

## Tabs suspended by an older version

Reload the updated extension on Chrome's Extensions page, then run **Suspend this window**
or **Suspend all windows** again. Eligible native-discarded tabs are converted to placeholders
without first loading their sites. Active, pinned, and audio-playing tabs remain protected
in bulk actions. Individual actions can convert pinned tabs.

Already-saved placeholders are skipped. Resume saved tabs before disabling, removing, or
changing the extension's ID: Chrome needs the installed extension to open its local pages.

## Check live memory

1. Keep the site suspended and allow about 30 seconds for Chrome's renderer cleanup.
2. Open Chrome's menu, then **More tools → Task manager**.
3. Compare the original site's task/process memory. The placeholder is a separate, small
   extension page; clicking **Resume page** loads the site and allocates memory again.

Chrome's tab hovercard can retain an earlier memory measurement. In Chrome 152, its
[resource collector](https://github.com/chromium/chromium/blob/152.0.7977.83/chrome/browser/ui/performance_controls/tab_resource_usage_collector.cc)
refreshed periodically and kept the old number when no new memory result was available.
Prefer live task/process measurements when checking suspension. Browser-wide totals include
other tabs and shared resources; they are not per-tab measurements.
