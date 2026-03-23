# Cookie Manager — Claude Code Guide

## Project overview

Chrome/Arc MV3 extension with a Go native messaging host for LAN peer-to-peer cookie sync.

## Key files

| File | Purpose |
|------|---------|
| `manifest.json` | MV3 manifest — permissions: `cookies`, `activeTab`, `nativeMessaging` |
| `popup.html` / `popup.js` | All extension UI and logic (no background worker) |
| `daemon/cmd/nmhost/main.go` | NM host entry point |
| `daemon/*.go` | id, queue, peers, server, native, mdns — one responsibility each |
| `daemon/install.sh` | Writes NM manifest for Chrome and Arc; takes extension ID as `$1` |
| `.github/workflows/daemon-build.yml` | Builds `darwin/amd64` + `darwin/arm64` on `v*` tags |

## Architecture constraints

- **No background.js, no alarms, no launchd.** The NM host is the only process — Chrome spawns it when the popup opens and kills it on popup close.
- **Daemon is popup-lifetime only.** mDNS and the LAN HTTP server exist only while the popup is open.
- **macOS only.** NM manifest paths are macOS-specific (`~/Library/Application Support/...`).
- **No elevated privileges.** All paths are under `~/Library/Application Support/sqrd-cookie-sync/`.

## NM domain and binary name

- Domain: `com.thundersquared.cookiesync`
- Binary: `sqrd-cookie-sync-nmhost`
- Support dir: `~/Library/Application Support/sqrd-cookie-sync/`

## Reusable popup.js functions

Always reuse these — do not duplicate their logic:

- `importCookies(cookies, filterDomain = null)` — sets cookies via `chrome.cookies.set`; handles success/fail counts
- `showStatus(msg, type)` — renders status bar; types: `"success"`, `"error"`, `"info"`

## NM message protocol

```
list_peers      → { peers: [{ id, hostname, profile, last_ip, last_port, known }] }
push_cookies    → { peer_id, domain, cookies } → { ok: true } | { ok: false, error }
check_pending   → { pending: [{ from_id, from_hostname, domain, cookies }] }
```

LAN HTTP:
```
POST /sync  { from: { id, hostname, profile }, domain, cookies }
GET  /ping  → { id }
```

## Go daemon: build & verify

```sh
cd daemon
go mod tidy
go build ./cmd/nmhost   # verify it compiles
```

## Working with library APIs

Use the **context7 MCP tool** (`resolve-library-id` + `query-docs`) before implementing against any library API — Chrome MV3, zeroconf, Go standard library edge cases, etc. Do not rely solely on training knowledge. Note: `grandcat/zeroconf` is not indexed in context7 — use its GitHub README directly.

## Browser NM manifest paths

- Chrome: `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/`
- Arc: `~/Library/Application Support/Arc/NativeMessagingHosts/`

`install.sh` writes to both. Adding another Chromium browser means adding another `write_manifest` call there.
