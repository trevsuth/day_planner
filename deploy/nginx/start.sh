#!/bin/sh
set -eu
DNS_RESOLVER=$(awk '/^nameserver[[:space:]]/ { print $2; exit }' /etc/resolv.conf)
export DNS_RESOLVER
envsubst '$DNS_RESOLVER' < /etc/nginx/routes.conf > /tmp/routes.conf
exec nginx -g 'daemon off;'
