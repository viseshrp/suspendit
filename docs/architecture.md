# Architecture

WXT builds two entrypoints: `popup.html` and an event-driven Manifest V3 service worker.
The popup reads tab/window/group metadata and renders native DOM elements cloned from HTML
templates. Titles and URLs are assigned with `textContent`; favicons and fonts never make
external requests. Search and collapsed-window state live only while the popup is open.

The popup sends a validated scope request to the worker, which re-queries tabs, applies
eligibility rules, and invokes `chrome.tabs.discard(tabId)`. Up to four discards run at once.
Each result is counted separately, so one closed or refused tab does not stop a bulk action.
The worker finishes requests independently of the popup's lifetime.

Only individual suspension may change the active tab. It selects an existing awake neighbor
in the same window. Bulk actions keep active, pinned, and audible tabs awake. Scope membership
and protection state are rechecked immediately before each action. Chrome makes the final
discard decision.

Selecting a suspended tab uses ordinary tab activation. Chrome owns unloading and restoration.
There are no replacement pages, captured documents, timers for automatic suspension, content
scripts, background polling, persistent settings, network services, or custom restore state.

## Permissions

| Permission | Purpose |
| --- | --- |
| `tabs` | Read titles and URLs for the popup |
| `tabGroups` | Read native group names and colors |
| `contextMenus` | Add the on-demand page action |

The extension requests no host permissions. Browser-level metadata and navigation APIs provide
the other required operations.

Sources: [Tabs API](https://developer.chrome.com/docs/extensions/reference/api/tabs),
[Tab Groups API](https://developer.chrome.com/docs/extensions/reference/api/tabGroups),
[Context Menus API](https://developer.chrome.com/docs/extensions/reference/api/contextMenus).
