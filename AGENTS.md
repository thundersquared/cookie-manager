# Cookie Manager — Agentic Development Guide

## Project

Chrome/Arc MV3 extension + Go Native Messaging host for LAN peer-to-peer cookie sync. See [README.md](README.md) for full project description.

## Tooling preferences

### Documentation lookup

Use the **context7 MCP tool** (`resolve-library-id` then `query-docs`) when looking up library or framework APIs — Chrome extension APIs, Go dependencies, etc. Do not rely solely on training data for API details; context7 gives more accurate and up-to-date docs.

- `grandcat/zeroconf` is **not indexed** in context7. Fetch its README via the GitHub API directly.

### Code style

- Follow the existing one-file-one-responsibility pattern in `daemon/` — do not merge concerns into large files.
- The extension has no background worker. All logic lives in `popup.js`.
- Do not add `background.js`, `alarms`, launchd, or Unix sockets — the architecture is intentionally popup-lifetime only.

## Key invariants

1. **NM host exits when popup closes** — Chrome sends EOF on stdin when the popup is closed; the daemon must exit cleanly on `io.EOF`.
2. **No elevated privileges** — all file I/O is under `~/Library/Application Support/sqrd-cookie-sync/`.
3. **Peer identity is UUID-only** — hostname and profile are display metadata only; lookups use `id` exclusively.
4. **`check_pending` takes no parameters** — the receiving popup has no tab context for filtering; return all pending batches.

## Extending browser support

To add another Chromium-based browser:
- Find its `NativeMessagingHosts` directory path
- Add a `write_manifest` call for that path in `daemon/install.sh`
- No other files need to change

## Verification checklist

Before claiming implementation complete:

1. `cd daemon && go build ./cmd/nmhost` — must compile cleanly
2. `daemon/install.sh <ext-id>` — verify manifest written to both Chrome and Arc paths
3. Load extension unpacked in Chrome; open popup — no disconnect error in DevTools console
4. With two profiles open on same machine/LAN, both on same site: peer appears in list, sync pushes cookies, receiving popup imports within 2s
5. Close popup — confirm daemon exits (no lingering process)
6. Push `v*` tag — Actions produces `sqrd-cookie-sync-nmhost-darwin-amd64` and `arm64` as release assets
