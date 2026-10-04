# Architecture

WXT builds `popup.html`, `suspended.html`, and an event-driven Manifest V3 service worker.
The popup reads tab/window/group metadata and renders native DOM elements cloned from HTML
templates. Titles and URLs are assigned with `textContent`. Site icons use Chrome's built-in
`_favicon` endpoint, with lazy loading and a local fallback. Search and collapsed-window/group
state live only while the popup is open.

The header, search, bulk actions, and status remain fixed around one scrolling tab list. The
selected-tabs button is enabled when an eligible highlighted tab exists in the popup's window.
Group and window chevrons collapse sections in the popup. Search temporarily expands matching
sections and restores the previous collapsed state when cleared.

Rows, groups, and windows are retained by Chrome ID. Rendering counts membership and eligibility
once, updates changed text/buttons, and inserts, moves, or removes only the affected DOM elements.
Filtered rows remain cached until their tabs close, preserving their icons when search is cleared.
Tab metadata events update the corresponding record directly and coalesce rendering over 16 ms.
Structural events coalesce full queries over 75 ms. Query versions reject obsolete results, and
newer metadata is kept when it arrives during a query. The popup releases this state when closed.

The popup sends a validated scope request to the worker, which re-queries tabs, applies
eligibility rules, and invokes `chrome.tabs.discard(tabId)` before navigating the same tab to
`suspended.html`. A selected-tabs request names a window; the worker queries that window's
highlighted tabs. Discard flushes the old document from the back/forward cache. Up to four
suspensions run at once. Previously discarded tabs proceed directly to the placeholder.
Each result is counted separately, so one closed or refused tab does not stop a bulk action.
The worker finishes requests independently of the popup's lifetime.

Only individual suspension may change the active tab. It selects an existing awake neighbor
in the same window. Bulk actions keep active, pinned, and audible tabs awake. Scope membership,
including highlighting for selected tabs, and protection state are rechecked immediately before
each action. Chrome makes the final discard decision.

The placeholder URL fragment holds the original address and title using `URLSearchParams`.
Only HTTP, HTTPS, and file addresses are accepted. The popup decodes these values for title,
search, hostname, and favicon display. DOM text assignments prevent titles from becoming HTML.
After native discard, the worker checks the current address, active state, scope, and bulk
protections again before replacing the page. A failed navigation leaves the discarded original
address recoverable. Returned replacement tab IDs are followed throughout the operation.

An `onUpdated` listener discards completed, inactive placeholders. Activating a saved tab loads
only the placeholder. Its button uses Chrome's navigation API to restore the original address,
including local files; the popup can also activate and navigate the tab directly. Chrome's
normal navigation history applies. Fragment metadata survives Chrome
session restoration and does not depend on service-worker memory. Invalid metadata disables
restoration. Saved URLs remain local to Chrome's normal tab/session/history records.

There are no automatic suspension timers, content scripts, background polling, settings pages,
runtime dependencies, or network services. Chrome owns process cleanup; the browser tests
measure actual renderer RSS rather than inferring memory release from a tab flag.

## Permissions

| Permission | Purpose |
| --- | --- |
| `tabs` | Read titles and URLs for the popup |
| `tabGroups` | Read native group names and colors |
| `contextMenus` | Add the on-demand page action |
| `favicon` | Display site icons through Chrome's favicon service |

The extension requests no host permissions. Browser-level metadata and navigation APIs provide
the other required operations.

Sources: [Tabs API](https://developer.chrome.com/docs/extensions/reference/api/tabs),
[Tab Groups API](https://developer.chrome.com/docs/extensions/reference/api/tabGroups),
[Context Menus API](https://developer.chrome.com/docs/extensions/reference/api/contextMenus),
[Favicon service](https://developer.chrome.com/docs/extensions/how-to/ui/favicons).
