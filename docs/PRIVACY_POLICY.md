# Privacy policy

SuspendIt does not send browsing data to a server, sell data, use analytics, or read website
contents. It reads open-tab titles and URLs, window membership, group names/colors, and tab
state to show its popup and carry out actions you choose.

When you suspend a page, SuspendIt saves its original address and title in the fragment of a
local extension URL. This keeps the page recoverable after a browser restart without a database
or extension storage. Chrome may retain that URL in its own tab/session/history records.
Treat suspended tabs like ordinary tabs when sharing addresses or browser profiles. SuspendIt
does not create a separate browsing-history log or transmit this metadata.

When you protect a site, SuspendIt saves only its hostname, such as `docs.example.com`, in
Chrome's local extension storage (`chrome.storage.local`) on this device. It does not save page
addresses, titles, tab IDs, or history for this feature, and it does not sync or send protected
sites anywhere. Removing a site from **Protected sites** in the popup deletes it; removing the
extension deletes the whole list.

The extension first uses Chrome's discard API, navigates to the local placeholder, and unloads
the inactive placeholder. Resuming contacts the original site in the normal way. The placeholder
sets a no-referrer policy. Site icons in the popup come through Chrome's built-in favicon
endpoint; the extension does not use third-party favicon providers, remote fonts, or remote scripts.

The `tabs`, `tabGroups`, `contextMenus`, `favicon`, and `storage` permissions support these features.
`storage` holds only the protected-site list.
There are no host permissions, content scripts, or additional permissions for placeholders.

Questions can be raised in the [project's issue tracker](https://github.com/viseshrp/suspendit/issues).
