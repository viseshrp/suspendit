# Reused foundations

SuspendIt follows [TabMD](https://github.com/viseshrp/tabmd/tree/179dfdaeb8220701bd998f8c518f7a1e1c168cfb)
and [nufftabs](https://github.com/viseshrp/nufftabs/tree/8187d19f2276cadcad6025472b786360eb1f182c), both MIT licensed by Visesh Prasad.

| Source | Reuse |
| --- | --- |
| Both repositories | `entrypoints/`, `public/icon/`, `scripts/`, `tests/unit/`, `tests/integration/`, `tests/e2e/`, and `docs/` layout |
| TabMD | pnpm scripts and lockfile, WXT manifest/build conventions, TypeScript config, Biome config, ignore rules, coverage configuration |
| TabMD | Playwright SVG-to-PNG icon generation, release tag parser, CI and tag/draft/published-release workflows |
| nufftabs | Plain DOM event delegation, system theme tokens, error-message and bounded-concurrency functions |
| Both repositories | Playwright test layout and isolated Chromium profiles; targeted DevTools connections accommodate native discard |

Build and test dependencies stay in development. The shipped popup uses native DOM APIs and CSS.
The suspension feature calls `chrome.tabs.discard()` directly. The reference repositories' storage,
Drive, editor, restore, options, and translation features are outside this extension's scope.

Tests run against the production extension, including real discarded tab state and automatic restoration.
