#!/bin/bash
# Removes the auto-updater and the ~/ConnectNote folder installed by install.sh:
#   curl -fsSL https://raw.githubusercontent.com/james-csy/acme-extension/main/install/uninstall.sh | bash
# Templates are kept in Chrome, not in the folder; removing the extension in Chrome deletes them.
set -euo pipefail

LABEL="com.connectnote.updater"
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
rm -f "$HOME/Library/LaunchAgents/$LABEL.plist"
# The update helper registered with each browser (see update.sh)
find "$HOME/Library/Application Support" -maxdepth 4 -path "*/NativeMessagingHosts/$LABEL.json" -delete 2>/dev/null || true
rm -rf "$HOME/Library/Application Support/ConnectNote"
if [ -d "$HOME/ConnectNote" ] && [ ! -d "$HOME/ConnectNote/.git" ]; then rm -rf "$HOME/ConnectNote"; fi

echo "Removed the updater and ~/ConnectNote."
echo "In chrome://extensions, click Remove on LinkedIn Connect Note to finish."
