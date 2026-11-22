#!/usr/bin/env bash
set -euo pipefail

action=$1
context=${2:?Pass an explicit Kubernetes context}
namespace=daily-planner

fail() {
  printf '%s\n' "$*" >&2
  exit 1
}

if [[ -z "$context" || "$(kubectl config get-contexts "$context" -o name)" != "$context" ]]; then
  fail "Unknown Kubernetes context. Run kubectl config get-contexts and pass the intended context name."
fi

cluster=(kubectl --context "$context" --request-timeout=20s)
namespaced=(kubectl --context "$context" -n "$namespace")

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
  preflight|apply)
    overlay=${3:?Pass the configured Kustomize overlay}
    rendered=$(mktemp)
    trap 'rm -f -- "$rendered"' EXIT
    kubectl kustomize "$overlay" > "$rendered"
    bash deploy/k3s/check-rendered.sh "$rendered"

    server=$(kubectl --context "$context" config view --minify -o jsonpath='{.clusters[0].cluster.server}')
    printf 'Target context %s (%s), namespace %s\n' "$context" "$server" "$namespace"
    keys=$("${namespaced[@]}" get secret daily-planner-db \
      -o 'go-template={{range $key, $value := .data}}{{if $value}}{{println $key}}{{end}}{{end}}')
    for key in DATABASE_URL POSTGRES_DB POSTGRES_USER POSTGRES_PASSWORD; do
      grep -Fqx -- "$key" <<< "$keys" || fail "daily-planner-db needs a nonempty $key."
    done
    tls_secrets=$(yq -N -r 'select(.kind == "Ingress") | .spec.tls[]?.secretName' "$rendered")
    if [[ -n "$tls_secrets" ]]; then
      while IFS= read -r secret; do
        tls_keys=$("${namespaced[@]}" get secret "$secret" \
          -o 'go-template={{range $key, $value := .data}}{{if $value}}{{println $key}}{{end}}{{end}}')
        for key in tls.crt tls.key; do
          grep -Fqx -- "$key" <<< "$tls_keys" || fail "$secret needs a nonempty $key."
        done
      done <<< "$tls_secrets"
    fi
    "${cluster[@]}" -n "$namespace" apply --dry-run=server -f "$rendered"
    if [[ "$action" == preflight ]]; then exit 0; fi

    "${cluster[@]}" -n "$namespace" apply -f "$rendered" -l day-planner.io/deploy-stage=database
    "${namespaced[@]}" rollout status statefulset/postgres --timeout=5m
    job_template=$(yq 'select(.kind == "Job" and .metadata.name == "daily-planner-migrate") |
      .metadata.generateName = "daily-planner-migrate-" | del(.metadata.name)' "$rendered")
    job=$("${namespaced[@]}" create -f - -o name <<< "$job_template")
    if ! "${namespaced[@]}" wait --for=condition=complete --timeout=200s "$job"; then
      "${namespaced[@]}" describe "$job" >&2 || true
      "${namespaced[@]}" logs "$job" >&2 || true
      fail "Migration Job $job did not complete. Application resources have not been applied."
    fi
    "${namespaced[@]}" logs "$job"

    # The Job is created above with a unique name on every attempt.
    "${cluster[@]}" -n "$namespace" apply -f "$rendered" -l 'day-planner.io/deploy-stage notin (database,migration)'
    "${namespaced[@]}" rollout status deployment/daily-planner-api --timeout=5m
    "${namespaced[@]}" rollout status deployment/daily-planner --timeout=5m
    ;;
  *)
    fail "Unknown k3s setup action: $action"
    ;;
esac
