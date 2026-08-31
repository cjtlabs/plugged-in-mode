#!/usr/bin/env bash
set -euo pipefail

UUID="plugged-in-mode@cjtlabs.github.io"

EXTENSION_DIR="$HOME/.local/share/gnome-shell/extensions/$UUID"
HELPER_DEST="/usr/local/libexec/plugged-in-mode-helper"
POLICY_DEST="/usr/share/polkit-1/actions/com.cjtlabs.plugged-in-mode.policy"
SERVICE_DEST="/etc/systemd/system/plugged-in-mode-restore.service"
STATE_DIR="/var/lib/plugged-in-mode"

if [[ "${EUID}" -eq 0 ]]; then
  echo "Run this uninstaller as your normal user, not with sudo."
  exit 1
fi

if command -v gnome-extensions >/dev/null 2>&1; then
  gnome-extensions disable "$UUID" >/dev/null 2>&1 || true
fi

sudo systemctl disable plugged-in-mode-restore.service >/dev/null 2>&1 || true

rm -rf "$EXTENSION_DIR"

sudo rm -f "$HELPER_DEST"
sudo rm -f "$POLICY_DEST"
sudo rm -f "$SERVICE_DEST"
sudo rm -rf "$STATE_DIR"

sudo systemctl daemon-reload

echo
echo "Uninstalled Plugged-in Mode."
echo "Log out and back in to fully refresh GNOME Shell."