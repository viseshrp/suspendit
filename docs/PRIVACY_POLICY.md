# Privacy policy

SuspendIt does not collect, transmit, sell, or persist personal data.

The extension reads open-tab titles and URLs, window membership, group names/colors, and tab
state to show its popup and carry out actions you choose. This information stays in Chrome.
SuspendIt does not read website contents, use analytics, contact a server, or maintain a copy
of your browsing history. Site icons come through Chrome's built-in favicon endpoint; the
extension does not contact third-party favicon providers or load remote fonts or scripts.

Suspension is handled by Chrome's native tab-discarding API. Chrome controls the page's
unloading and subsequent reload. A reload contacts the original site in the normal way.

The `tabs`, `tabGroups`, `contextMenus`, and `favicon` permissions support these features. There are no
host permissions or content scripts.

Questions can be raised in the [project's issue tracker](https://github.com/viseshrp/suspendit/issues).
