#!/bin/sh
# SPDX-License-Identifier: Apache-2.0
# ICC container entrypoint: render nginx.conf, start the API and nginx, exit if either dies.
set -eu

mkdir -p /tmp/nginx "${ICC_DATA_DIR:-/data}"
python3 /app/docker/render_nginx.py
nginx -t -q -e /dev/stderr -c /tmp/nginx/nginx.conf

python3 -u /app/api/icc_api.py &
API=$!
nginx -e /dev/stderr -c /tmp/nginx/nginx.conf -g 'daemon off;' &
WEB=$!

term() { kill -TERM "$API" "$WEB" 2>/dev/null || true; wait; exit 0; }
trap term TERM INT

while kill -0 "$API" 2>/dev/null && kill -0 "$WEB" 2>/dev/null; do sleep 2; done
echo "icc: a process exited (api=$API web=$WEB), stopping container" >&2
kill -TERM "$API" "$WEB" 2>/dev/null || true
exit 1
