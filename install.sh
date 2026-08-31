#!/usr/bin/env bash
set -euo pipefail

UUID="plugged-in-mode@cjtlabs.github.io"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
EXTENSION_SOURCE="$SCRIPT_DIR/extension"
HELPER_SOURCE="$SCRIPT_DIR/system/plugged-in-mode-helper"
POLICY_SOURCE="$SCRIPT_DIR/system/com.cjtlabs.plugged-in-mode.policy"

EXTENSION_DIR="$HOME/.local/share/gnome-shell/extensions/$UUID"
HELPER_DEST="/usr/local/libexec/plugged-in-mode-helper"
POLICY_DEST="/usr/share/polkit-1/actions/com.cjtlabs.plugged-in-mode.policy"

if [[ "${EUID}" -eq 0 ]]; then
  echo "Run this installer as your normal user, not with sudo."
  exit 1
fi

for path in   "$EXTENSION_SOURCE/extension.js"   "$EXTENSION_SOURCE/metadata.json"   "$HELPER_SOURCE"   "$POLICY_SOURCE"; do
  if [[ ! -f "$path" ]]; then
    echo "Missing required file: $path"
    exit 1
  fi
done

mkdir -p "$EXTENSION_DIR"
rm -rf "$EXTENSION_DIR"/*
cp -a "$EXTENSION_SOURCE"/. "$EXTENSION_DIR"/

sudo install -Dm755 "$HELPER_SOURCE" "$HELPER_DEST"
sudo install -Dm644 "$POLICY_SOURCE" "$POLICY_DEST"

echo
echo "Installed Plugged-in Mode."
echo
echo "Extension:"
echo "  $EXTENSION_DIR"
echo
echo "Helper:"
echo "  $HELPER_DEST"
echo
echo "Polkit policy:"
echo "  $POLICY_DEST"
echo
echo "Log out and back in, then enable it with:"
echo "  gnome-extensions enable $UUID"
