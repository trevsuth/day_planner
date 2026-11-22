#!/usr/bin/env bash
set -euo pipefail

manifest=$1
fail() { printf '%s\n' "$*" >&2; exit 1; }

images=$(yq -N -r '.. | select(tag == "!!map" and has("image")) | .image' "$manifest")
[[ -n "$images" ]] || fail "The rendered manifest contains no container images."
while IFS= read -r image; do
  [[ "$image" != *example.com* && "$image" != *YOUR_RELEASE_TAG* ]] ||
    fail "Configure a published image in place of $image."
  if [[ "$image" != postgres:17-alpine &&
        ! "$image" =~ ^[^/]+/.+(@sha256:[0-9a-f]{64}|:v[0-9]+\.[0-9]+\.[0-9]+)$ ]]; then
    fail "Use a registry image pinned by digest or release tag: $image"
  fi
done <<< "$images"

hosts=$(yq -N -r 'select(.kind == "Ingress") | .spec.rules[].host' "$manifest")
[[ -n "$hosts" ]] || fail "Configure an Ingress hostname."
while IFS= read -r host; do
  [[ -n "$host" && "$host" != null && "$host" != example.com && "$host" != *.example.com ]] ||
    fail "Configure a real Ingress hostname in place of $host."
done <<< "$hosts"

tls_hosts=$(yq -N -r 'select(.kind == "Ingress") | .spec.tls[]?.hosts[]' "$manifest")
if [[ -n "$tls_hosts" ]]; then
  while IFS= read -r host; do
    grep -Fqx -- "$host" <<< "$hosts" || fail "TLS host has no matching Ingress rule: $host"
  done <<< "$tls_hosts"
fi

web_upstream=$(yq -N -r 'select(.kind == "ConfigMap" and .metadata.name == "daily-planner-web") | .data.API_UPSTREAM' "$manifest")
[[ -n "$web_upstream" && "$web_upstream" != null ]] || fail "The web ConfigMap requires API_UPSTREAM."

services=$(yq -N -r 'select(.kind == "Service") | .metadata.name' "$manifest")
backends=$(yq -N -r 'select(.kind == "Ingress") | .spec.rules[].http.paths[].backend.service.name' "$manifest")
[[ -n "$backends" ]] || fail "The Ingress requires Service backends."
while IFS= read -r backend; do
  grep -Fqx -- "$backend" <<< "$services" || fail "Ingress Service is missing: $backend"
done <<< "$backends"

api_image=$(yq -N -r 'select(.kind == "Deployment" and .metadata.name == "daily-planner-api") | .spec.template.spec.containers[0].image' "$manifest")
migration_image=$(yq -N -r 'select(.kind == "Job" and .metadata.name == "daily-planner-migrate") | .spec.template.spec.containers[0].image' "$manifest")
[[ -n "$api_image" && "$api_image" == "$migration_image" ]] ||
  fail "The API Deployment and migration Job must use the same image."
