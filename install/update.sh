#!/bin/bash
# Keeps ~/ConnectNote in step with the latest release on GitHub (Releases, not the main branch:
# pushing to main ships nothing until a release is published). launchd runs this at login and
# every 6 hours (see install.sh); install.sh also runs it once with --from <unzipped folder>.
# The extension notices the new files itself and reloads (see src/background.js). It can also run
# this straight away (popup → Check for updates) through native-host.sh, registered below.
#
# For testing, CONNECT_NOTE_TAG (e.g. v0.12.1) and CONNECT_NOTE_ZIP (file:// works) skip GitHub.
set -euo pipefail

REPO="james-csy/acme-extension"
EXT_DIR="$HOME/ConnectNote"
SUPPORT_DIR="$HOME/Library/Application Support/ConnectNote"
LOG="$SUPPORT_DIR/update.log"

# Log to a file kept to its last 500 lines
mkdir -p "$SUPPORT_DIR"
if [ -f "$LOG" ]; then tail -n 500 "$LOG" > "$LOG.tmp" && mv -f "$LOG.tmp" "$LOG"; fi
exec >> "$LOG" 2>&1
log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*"; }

version_of() { sed -nE 's/^[[:space:]]*"version":[[:space:]]*"([^"]+)".*/\1/p' | head -n 1; }
# Is version $1 newer than $2? ("0.12.0" vs "0.11.3")
newer() {
  [ "$1" != "$2" ] && [ "$(printf '%s\n%s\n' "$1" "$2" | sort -t . -k 1,1n -k 2,2n -k 3,3n | tail -n 1)" = "$1" ]
}

# Never mirror over a developer's own checkout
if [ -d "$EXT_DIR/.git" ]; then log "$EXT_DIR is a git checkout; not touching it"; exit 1; fi

# Lets the extension run this script when asked (native-host.sh): registered with every
# Chrome-based browser on this Mac, for the extension loaded from $EXT_DIR only. An extension
# loaded from a folder gets its id from the folder's path: the first 32 hex digits of its SHA-256,
# written with the letters a-p. Done on every run, so installs from before this get it too.
HOST="com.connectnote.updater"
BROWSER_DIRS=(
  "Google/Chrome" "Google/Chrome Beta" "Google/Chrome Canary" "Chromium" "BraveSoftware/Brave-Browser"
  "Microsoft Edge" "Vivaldi" "Arc/User Data" "Dia/User Data"
)
register_host() {
  [ -f "$EXT_DIR/install/native-host.sh" ] || return 0
  cp "$EXT_DIR/install/native-host.sh" "$SUPPORT_DIR/native-host.sh.new"
  chmod +x "$SUPPORT_DIR/native-host.sh.new"
  mv -f "$SUPPORT_DIR/native-host.sh.new" "$SUPPORT_DIR/native-host.sh"
  local id dir
  id=$(printf '%s' "$EXT_DIR" | shasum -a 256 | head -c 32 | tr '0-9a-f' 'a-p')
  for dir in "${BROWSER_DIRS[@]}"; do
    dir="$HOME/Library/Application Support/$dir"
    [ -d "$dir" ] || continue
    mkdir -p "$dir/NativeMessagingHosts"
    cat > "$dir/NativeMessagingHosts/$HOST.json" <<JSON
{
  "name": "$HOST",
  "description": "LinkedIn Connect Note: checks for updates when asked",
  "path": "$SUPPORT_DIR/native-host.sh",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://$id/"]
}
JSON
  done
}
register_host

installed=""
[ -f "$EXT_DIR/manifest.json" ] && installed=$(version_of < "$EXT_DIR/manifest.json")

src=""
[ "${1:-}" = "--from" ] && src="$2"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

if [ -z "$src" ]; then
  # github.com/<repo>/releases/latest redirects to .../releases/tag/<tag>
  tag="${CONNECT_NOTE_TAG:-}"
  if [ -z "$tag" ]; then
    url=$(curl -fsSL -o /dev/null -w '%{url_effective}' "https://github.com/$REPO/releases/latest") || true
    case "$url" in */releases/tag/*) tag="${url##*/}" ;; esac
  fi
  if [ -z "$tag" ]; then log "Couldn't find the latest release (offline, or none published yet)"; exit 0; fi
  latest="${tag#v}"
  if ! newer "$latest" "${installed:-0}"; then log "Up to date ($installed)"; exit 0; fi
  curl -fsSL "${CONNECT_NOTE_ZIP:-https://github.com/$REPO/archive/refs/tags/$tag.zip}" -o "$tmp/extension.zip"
  unzip -q "$tmp/extension.zip" -d "$tmp"
  src=$(dirname "$(find "$tmp" -maxdepth 2 -name manifest.json | head -n 1)")
fi

if [ ! -f "$src/manifest.json" ] || [ ! -d "$src/src" ]; then log "The download doesn't look like the extension"; exit 1; fi
new=$(version_of < "$src/manifest.json")
# A release whose manifest wasn't bumped to match its tag would be downloaded again on every run
if [ -n "${latest:-}" ] && [ "$new" != "$latest" ]; then
  log "Release $tag has version $new in its manifest.json; skipping until they match"
  exit 1
fi

# Everything but the manifest first, then the manifest in one step: the extension reloads when its
# manifest's version changes, so by then every other file is in place.
# auto-update.json is written by install.sh and tells the extension updates are automatic.
mkdir -p "$EXT_DIR"
rsync -a --delete --exclude /manifest.json --exclude /auto-update.json --exclude /.manifest.new "$src/" "$EXT_DIR/"
cp "$src/manifest.json" "$EXT_DIR/.manifest.new"
mv -f "$EXT_DIR/.manifest.new" "$EXT_DIR/manifest.json"

# This script and the uninstaller update themselves too (replaced, not rewritten, so a run in
# progress is unaffected)
for script in update.sh uninstall.sh; do
  if [ -f "$src/install/$script" ]; then
    cp "$src/install/$script" "$SUPPORT_DIR/$script.new"
    mv -f "$SUPPORT_DIR/$script.new" "$SUPPORT_DIR/$script"
  fi
done

register_host
log "Installed ${new} (was ${installed:-nothing})"
