# Privacy policy

SuspendIt does not send browsing data to a server, sell data, use analytics, or read website
contents. It reads open-tab titles and URLs, window membership, group names/colors, and tab
state to show its popup and carry out actions you choose.

When you suspend a page, SuspendIt saves its original address and title in the fragment of a
local extension URL. This keeps the page recoverable after a browser restart without a database
or storage permission. Chrome may retain that URL in its own tab/session/history records.
Treat suspended tabs like ordinary tabs when sharing addresses or browser profiles. SuspendIt
does not create a separate browsing-history log or transmit this metadata.

The extension first uses Chrome's discard API, navigates to the local placeholder, and unloads
the inactive placeholder. Resuming contacts the original site in the normal way. The placeholder
sets a no-referrer policy. Site icons in the popup come through Chrome's built-in favicon
endpoint; the extension does not use third-party favicon providers, remote fonts, or remote scripts.

The `tabs`, `tabGroups`, `contextMenus`, and `favicon` permissions support these features.
There are no host permissions, content scripts, or additional permissions for placeholders.

Questions can be raised in the [project's issue tracker](https://github.com/viseshrp/suspendit/issues).
