#!/usr/bin/env bash
set -euo pipefail

base_url=${1%/}
case "$base_url" in
  https://*|http://*) ;;
  *) printf '%s\n' 'Pass the deployment URL, beginning with http:// or https://.' >&2; exit 1 ;;
esac

check() {
  local path=$1 pattern=$2 response
  if ! response=$(curl --fail --silent --show-error --max-time 10 \
    --retry 4 --retry-all-errors --retry-delay 1 --retry-max-time 20 "$base_url$path"); then
    printf 'Request failed at %s\n' "$base_url$path" >&2
    exit 1
  fi
  if ! grep -Eq "$pattern" <<< "$response"; then
    printf 'Unexpected response at %s\n' "$base_url$path" >&2
    exit 1
  fi
  printf 'OK %s\n' "$path"
}

check / '<title>Daily Planner</title>'
check /graph/ '<title>Local Graph Wiki</title>'
check /viewer/ '<title>Markdown &amp; Mermaid Viewer</title>'
check /api/health '"database"[[:space:]]*:[[:space:]]*"ok"'
