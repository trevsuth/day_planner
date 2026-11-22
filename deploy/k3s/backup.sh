#!/usr/bin/env bash
set -euo pipefail
umask 077

context=$1
destination=$2
if [[ -z "$context" || "$(kubectl config get-contexts "$context" -o name)" != "$context" ]]; then
  printf '%s\n' 'Unknown Kubernetes context. Run kubectl config get-contexts and pass the intended context name.' >&2
  exit 1
fi

if [[ -e "$destination" || -L "$destination" ]]; then
  printf 'Backup destination already exists: %s\n' "$destination" >&2
  exit 1
fi

partial=$(mktemp "${destination}.XXXXXX")
trap 'rm -f -- "$partial"' EXIT
kubectl --context "$context" -n daily-planner exec postgres-0 -- sh -ec '
  export PGPASSWORD="$POSTGRES_PASSWORD"
  pg_dump --host=127.0.0.1 --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" --format=custom
' > "$partial"
if [[ "$(head -c 5 "$partial")" != PGDMP ]]; then
  printf '%s\n' 'The server did not return a Postgres archive.' >&2
  exit 1
fi

ln -- "$partial" "$destination"
printf 'Saved backup to %s\n' "$destination"
