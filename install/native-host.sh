#!/bin/bash
# Lets the extension run update.sh now (popup → Check for updates, and the hourly check) instead of
# waiting for launchd. Chrome-based browsers start this when the extension calls
# chrome.runtime.sendNativeMessage('com.connectnote.updater'); update.sh registers it with each
# browser (see register_host there). It answers one message and exits.
#
# Chrome's native messaging: each message is a 4-byte length (in this machine's byte order, little
# endian on Macs), then that many bytes of JSON. stdout carries only replies.
set -uo pipefail
export LC_ALL=C

SUPPORT_DIR="$HOME/Library/Application Support/ConnectNote"
EXT_DIR="$HOME/ConnectNote"

# One byte at a time, so nothing past the message is read
read_message() {
  local len
  len=$(dd bs=1 count=4 2>/dev/null | od -An -tu4 | tr -d ' \n')
  [ -n "$len" ] && dd bs=1 count="$len" 2>/dev/null > /dev/null
}

reply() {
  local n=${#1}
  printf "$(printf '\\%03o\\%03o\\%03o\\%03o' $((n & 255)) $(((n >> 8) & 255)) $(((n >> 16) & 255)) $(((n >> 24) & 255)))"
  printf '%s' "$1"
}

version_of() { sed -nE 's/^[[:space:]]*"version":[[:space:]]*"([^"]+)".*/\1/p' "$1" 2>/dev/null | head -n 1; }
json_text() { printf '%s' "$1" | tr -d '\000-\037' | sed 's/\\/\\\\/g; s/"/\\"/g'; }

read_message
before=$(version_of "$EXT_DIR/manifest.json")
/bin/bash "$SUPPORT_DIR/update.sh" < /dev/null > /dev/null 2>&1
status=$?
after=$(version_of "$EXT_DIR/manifest.json")
line=$(tail -n 1 "$SUPPORT_DIR/update.log" 2>/dev/null | cut -c 21-)
ok=$([ "$status" = 0 ] && echo true || echo false)
reply "{\"ok\":$ok,\"before\":\"$(json_text "$before")\",\"after\":\"$(json_text "$after")\",\"log\":\"$(json_text "$line")\"}"
