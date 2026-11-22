#!/bin/sh
set -eu
DNS_RESOLVER=$(awk '/^nameserver[[:space:]]/ { print $2; exit }' /etc/resolv.conf)
: "${API_UPSTREAM:?Set API_UPSTREAM to the API service host and port}"
export DNS_RESOLVER API_UPSTREAM
envsubst '$DNS_RESOLVER $API_UPSTREAM' < /etc/nginx/routes.conf > /tmp/routes.conf
exec nginx -g 'daemon off;'
