#!/bin/bash
# Installs LinkedIn Connect Note on a Mac and keeps it up to date by itself:
#   curl -fsSL https://raw.githubusercontent.com/james-csy/acme-extension/main/install/install.sh | bash
#
# - The latest release goes in ~/ConnectNote (load it once in chrome://extensions)
# - A launchd job runs update.sh at login and every 6 hours; it downloads newer releases from
#   GitHub into that folder. No admin password, no git. Listed in System Settings > General >
#   Login Items. Remove everything with uninstall.sh.
#
# For testing, CONNECT_NOTE_ZIP can point at another zip (file:// works).
set -euo pipefail

REPO="james-csy/acme-extension"
EXT_DIR="$HOME/ConnectNote"
SUPPORT_DIR="$HOME/Library/Application Support/ConnectNote"
LABEL="com.connectnote.updater"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

if [ "$(uname)" != "Darwin" ]; then echo "This installer is for macOS."; exit 1; fi
if [ -d "$EXT_DIR/.git" ]; then echo "$EXT_DIR is a git checkout; move it first."; exit 1; fi

echo "Downloading LinkedIn Connect Note…"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
zip_url="${CONNECT_NOTE_ZIP:-}"
if [ -z "$zip_url" ]; then
  # github.com/<repo>/releases/latest redirects to .../releases/tag/<tag>
  url=$(curl -fsSL -o /dev/null -w '%{url_effective}' "https://github.com/$REPO/releases/latest")
  case "$url" in */releases/tag/*) zip_url="https://github.com/$REPO/archive/refs/tags/${url##*/}.zip" ;; esac
fi
if [ -z "$zip_url" ]; then echo "Couldn't find a release to install."; exit 1; fi
curl -fsSL "$zip_url" -o "$tmp/extension.zip"
unzip -q "$tmp/extension.zip" -d "$tmp"
src=$(dirname "$(find "$tmp" -maxdepth 2 -name manifest.json | head -n 1)")
if [ ! -f "$src/install/update.sh" ]; then echo "The download doesn't look like the extension."; exit 1; fi

mkdir -p "$SUPPORT_DIR" "$HOME/Library/LaunchAgents"
cp "$src/install/update.sh" "$src/install/uninstall.sh" "$SUPPORT_DIR/"
/bin/bash "$SUPPORT_DIR/update.sh" --from "$src"
echo '{ "autoUpdate": true }' > "$EXT_DIR/auto-update.json"

cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array><string>/bin/bash</string><string>$SUPPORT_DIR/update.sh</string></array>
  <key>RunAtLoad</key><true/>
  <key>StartInterval</key><integer>21600</integer>
  <key>ProcessType</key><string>Background</string>
</dict>
</plist>
PLIST
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"

cat <<DONE

Installed in $EXT_DIR, and it will keep itself up to date.
(macOS may show a "Background Items Added" notice: that's the updater.)

One last step, in Chrome:
  1. Go to chrome://extensions and turn on "Developer mode" (top right)
  2. Click "Load unpacked" and choose the ConnectNote folder in your home folder
     (in the file picker, press Cmd+Shift+H to jump to your home folder)
  3. Refresh any open LinkedIn tabs
DONE
open "$EXT_DIR" 2>/dev/null || true
