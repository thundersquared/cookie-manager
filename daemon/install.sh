#!/bin/sh
set -e

EXT_ID="${1:?Usage: install.sh <extension-id>}"

SUPPORT_DIR="$HOME/Library/Application Support/sqrd-cookie-sync"
BINARY="$SUPPORT_DIR/sqrd-cookie-sync-nmhost"

MANIFEST=$(cat <<EOF
{
  "name": "com.thundersquared.cookiesync",
  "description": "Cookie Sync NM Host",
  "path": "$BINARY",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://$EXT_ID/"]
}
EOF
)

write_manifest() {
  dir="$1"
  mkdir -p "$dir"
  printf '%s\n' "$MANIFEST" > "$dir/com.thundersquared.cookiesync.json"
  echo "  ✓ $dir"
}

echo "Writing NM manifest for extension: $EXT_ID"

write_manifest "$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
write_manifest "$HOME/Library/Application Support/Arc/NativeMessagingHosts"

echo ""
echo "Place the binary at: $BINARY"
echo "(chmod +x it after copying)"
