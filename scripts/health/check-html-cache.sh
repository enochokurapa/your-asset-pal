#!/usr/bin/env bash
set -Eeuo pipefail
base="${1:-https://assetflow360.com}"
for page in / /assets /assets/ /dashboard /locations /settings /login /features; do
  headers=$(curl --fail --silent --show-error --compressed --max-time 20 --head "$base$page")
  printf '%s %s\n' "$page" "$(printf '%s\n' "$headers" | grep -i '^cache-control:' | tr -d '\r')"
  if ! printf '%s\n' "$headers" | grep -iq 'cache-control:.*no-store'; then
    printf 'FAILED: %s HTML missing no-store\n' "$page" >&2;exit 1
  fi
  if printf '%s\n' "$headers" | grep -iq 'cache-control:.*immutable'; then
    printf 'FAILED: %s HTML marked immutable\n' "$page" >&2;exit 1
  fi
done
# Discover the current fingerprinted asset dynamically; never pin to an old release.
js_path=$(curl --fail --silent --show-error --compressed --max-time 20 "$base/" | grep -oE '/assets/index-[A-Za-z0-9_-]+\.js' | head -1 || true)
if [ -n "$js_path" ]; then
  headers=$(curl --fail --silent --show-error --head --max-time 20 "$base$js_path")
  if ! printf '%s\n' "$headers" | grep -qi 'cache-control:.*immutable'; then
    printf 'FAILED: versioned JS was not cached immutably\n' >&2; exit 1
  fi
fi
printf 'HTML cache regression checks passed.\n'
