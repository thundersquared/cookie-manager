# Cookie Manager

A Chrome/Arc extension for exporting, importing, and syncing cookies across browsers on the same LAN.

## Features

- **Export** — save current site cookies to a JSON file
- **Import** — load cookies from a JSON file into the current browser
- **Clear** — remove all cookies for the current site
- **Peer sync** — push cookies directly to another browser on the same network (no cloud, no file)

## Browser support

Chrome and Arc (any Chromium-based browser that supports Manifest V3 extensions and Native Messaging).

---

## Installation

### Extension

1. Clone or download this repository
2. Open `chrome://extensions` (or `arc://extensions`)
3. Enable **Developer mode**
4. Click **Load unpacked** and select this directory
5. Note the extension ID shown on the card

### Sync daemon (optional — required for peer sync)

The peer sync feature requires a small native binary that handles mDNS discovery and LAN HTTP communication.

**Download the binary**

Grab the latest `sqrd-cookie-sync-nmhost-darwin-<arch>` from [GitHub Releases](../../releases) and place it at:

```
~/Library/Application Support/sqrd-cookie-sync/sqrd-cookie-sync-nmhost
```

Then make it executable:

```sh
chmod +x ~/Library/Application\ Support/sqrd-cookie-sync/sqrd-cookie-sync-nmhost
```

**Register the Native Messaging manifest**

```sh
cd daemon
./install.sh <your-extension-id>
```

This writes the NM manifest for both Chrome and Arc. No elevated privileges required.

> **Finding your extension ID:** Go to `chrome://extensions` (or `arc://extensions`), enable Developer mode, and look for the 32-character ID under the extension name (e.g. `abcdefghijklmnopqrstuvwxyzabcdef`).
>
> **Note:** Chrome assigns a different ID each time you load an unpacked extension on a new machine. If you need a stable ID across machines, add a `"key"` field to `manifest.json` — see the [Chrome docs on stable extension IDs](https://developer.chrome.com/docs/extensions/reference/manifest/key).

---

## How peer sync works

1. Open the extension popup — Chrome spawns the sync daemon automatically
2. The daemon advertises itself on the LAN via mDNS (`_cookiesync._tcp`) and starts a local HTTP server on a random port
3. Other open popups on the same network appear in the **Nearby Peers** list
4. Click **→** next to a peer to push the current site's cookies to their browser
5. The receiving popup silently imports the cookies within ~2 seconds
6. When the popup closes, the daemon exits — no persistent background process

Previously seen peers are saved locally and shown immediately on next open (greyed out if currently unreachable).

---

## Cookie file format

```json
{
  "exportedAt": "2025-01-01T00:00:00.000Z",
  "cookies": [
    {
      "name": "session",
      "value": "abc123",
      "domain": "example.com",
      "path": "/",
      "secure": true,
      "httpOnly": true,
      "expirationDate": 1893456000
    }
  ]
}
```

---

## Building the daemon from source

Requires Go 1.22+.

```sh
cd daemon
go mod tidy
go build -o sqrd-cookie-sync-nmhost ./cmd/nmhost
```

Cross-compile for macOS:

```sh
GOOS=darwin GOARCH=arm64 CGO_ENABLED=0 go build -o sqrd-cookie-sync-nmhost-darwin-arm64 ./cmd/nmhost
GOOS=darwin GOARCH=amd64 CGO_ENABLED=0 go build -o sqrd-cookie-sync-nmhost-darwin-amd64 ./cmd/nmhost
```

CI builds both architectures automatically on `v*` tags via [GitHub Actions](.github/workflows/daemon-build.yml).

---

## Project structure

```
cookie-manager/
├── manifest.json                 # MV3 extension manifest
├── popup.html                    # Extension popup UI
├── popup.js                      # Export / import / clear / peer sync logic
└── daemon/
    ├── cmd/nmhost/main.go        # Entry point — wires all components
    ├── id.go                     # Stable UUID identity
    ├── queue.go                  # In-memory incoming cookie queue
    ├── peers.go                  # Peer persistence (peers.json)
    ├── server.go                 # LAN HTTP server (POST /sync, GET /ping)
    ├── native.go                 # Native Messaging stdio protocol
    ├── mdns.go                   # mDNS advertise + discover (zeroconf)
    ├── install.sh                # Writes NM manifest for Chrome and Arc
    └── go.mod
```

---

## Runtime paths (macOS)

| Item | Path |
|------|------|
| Binary | `~/Library/Application Support/sqrd-cookie-sync/sqrd-cookie-sync-nmhost` |
| Peer identity | `~/Library/Application Support/sqrd-cookie-sync/id` |
| Known peers | `~/Library/Application Support/sqrd-cookie-sync/peers.json` |
| Chrome NM manifest | `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.thundersquared.cookiesync.json` |
| Arc NM manifest | `~/Library/Application Support/Arc/NativeMessagingHosts/com.thundersquared.cookiesync.json` |

---

## Privacy

All communication is local-network only. No data leaves your LAN. The LAN HTTP endpoint is open (no authentication) — the trust boundary is your local network.
