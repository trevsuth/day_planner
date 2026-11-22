#!/usr/bin/env bash
set -euo pipefail

action=$1
context=$2
namespace=daily-planner

fail() {
  printf '%s\n' "$*" >&2
  exit 1
}

if [[ -z "$context" || "$(kubectl config get-contexts "$context" -o name)" != "$context" ]]; then
  fail "Unknown Kubernetes context. Run kubectl config get-contexts and pass the intended context name."
fi

cluster=(kubectl --context "$context" --request-timeout=20s)
namespaced=("${cluster[@]}" -n "$namespace")

case "$action" in
  init-db)
    existing_namespace=$("${cluster[@]}" get namespace "$namespace" --ignore-not-found -o name)
    if [[ -z "$existing_namespace" ]]; then
      "${cluster[@]}" create --save-config -f deploy/k3s/namespace.yaml
    fi
    existing_secret=$("${namespaced[@]}" get secret daily-planner-db --ignore-not-found -o name)
    if [[ -n "$existing_secret" ]]; then
      printf '%s\n' "Using existing database secret in $context/$namespace."
      exit 0
    fi
    existing_volume=$("${namespaced[@]}" get pvc postgres-data-postgres-0 --ignore-not-found -o name)
    if [[ -n "$existing_volume" ]]; then
      fail "A Postgres volume exists without its secret. Restore the original daily-planner-db secret before proceeding."
    fi
    password=$(openssl rand -hex 24)
    "${namespaced[@]}" create -f - <<SECRET
apiVersion: v1
kind: Secret
metadata:
  name: daily-planner-db
type: Opaque
stringData:
  POSTGRES_DB: daily_planner
  POSTGRES_USER: daily_planner
  POSTGRES_PASSWORD: $password
  DATABASE_URL: postgresql://daily_planner:$password@postgres:5432/daily_planner
SECRET
    ;;
  preflight)
    overlay=$3
    rendered=$(kubectl kustomize "$overlay")
    if grep -Eq 'registry\.example\.com|planner\.example\.com|YOUR_RELEASE_TAG|image: (daily-planner-web|daily-planner-api|markdown-viewer)(:|$)' <<< "$rendered"; then
      fail "Configure the ingress hostname and all three published images in your k3s overlay before applying it."
    fi
    existing_secret=$("${namespaced[@]}" get secret daily-planner-db --ignore-not-found -o name)
    if [[ -z "$existing_secret" ]]; then
      fail "Database secret is missing. Run just k3s-init-db CONTEXT first."
    fi
    "${cluster[@]}" apply --dry-run=server -k "$overlay"
    ;;
  *)
    fail "Unknown k3s setup action: $action"
    ;;
esac
