#!/usr/bin/env bash
# Run from a machine with its own storage and an explicit Kubernetes context.
set -euo pipefail
umask 077

context=${1:?Pass the Kubernetes context}
directory=${2:?Pass an existing backup directory on this machine}
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
name="daily-planner-$(date -u +%Y%m%dT%H%M%SZ).dump"
staging=$(mktemp -d "$directory/.staging.XXXXXX")
trap 'rm -f -- "$staging/$name"; rmdir -- "$staging"' EXIT

bash "$script_dir/backup.sh" "$context" "$staging/$name"
pg_restore --list "$staging/$name" >/dev/null
ln -- "$staging/$name" "$directory/$name"
printf 'Stored %s\n' "$directory/$name"

# Prune only our completed archives, and only after publishing a new one.
find "$directory" -maxdepth 1 -type f \
  -name 'daily-planner-????????T??????Z.dump' -mtime +29 -delete
