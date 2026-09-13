# SuspendIt

Suspend tabs, tab groups, or windows using Chrome's native tab discarding.

## Development

Requires Node.js 22+ and pnpm 10.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

```sh
pnpm build       # .output/chrome-mv3
pnpm quality     # TypeScript and Biome
pnpm test        # Unit/integration tests with coverage
pnpm test:e2e    # Production extension in isolated Chromium
pnpm package    # Verified installation ZIP in .output
```

Load `.output/chrome-mv3` through **Load unpacked** in Chrome's Extensions page with Developer mode enabled.

See [reused foundations](docs/reuse.md) for the code and tooling copied from TabMD and nufftabs.
chrome tab suspender to save memory
