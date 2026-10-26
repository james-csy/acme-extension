#!/bin/bash
# Ships a new version to everyone who installed with install/install.sh: sets the version in
# manifest.json, commits, tags, pushes, and publishes the GitHub release their updaters follow.
#   scripts/release.sh 0.12.1 "What changed"      (notes optional; GitHub writes them otherwise)
# Needs the GitHub CLI (gh), logged in. Run from a clean main branch.
set -euo pipefail

version="${1:?Usage: scripts/release.sh <version, e.g. 0.12.1> [notes]}"
notes="${2:-}"
cd "$(dirname "$0")/.."

if [[ ! "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then echo "Version must look like 0.12.1"; exit 1; fi
if [ "$(git branch --show-current)" != "main" ]; then echo "Release from the main branch."; exit 1; fi
if [ -n "$(git status --porcelain)" ]; then echo "Commit or stash your changes first."; exit 1; fi

current=$(sed -nE 's/^[[:space:]]*"version":[[:space:]]*"([^"]+)".*/\1/p' manifest.json | head -n 1)
highest=$(printf '%s\n%s\n' "$current" "$version" | sort -t . -k 1,1n -k 2,2n -k 3,3n | tail -n 1)
if [ "$version" != "$current" ] && [ "$highest" != "$version" ]; then
  echo "$version is older than $current; installed copies only move to newer versions."
  exit 1
fi

if [ "$version" != "$current" ]; then
  sed -i '' -E "s/(\"version\":[[:space:]]*\")[^\"]+/\1$version/" manifest.json
  git commit -qm "Release v$version" manifest.json
fi
git tag "v$version"
git push -q origin main "v$version"
if [ -n "$notes" ]; then
  gh release create "v$version" --title "v$version" --notes "$notes"
else
  gh release create "v$version" --title "v$version" --generate-notes
fi
echo "Released v$version. Installed copies pick it up within about 6 hours."
