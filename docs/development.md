# Development

Run the API alone (local config repository seeded from `example/config`):

```bash
pip install pyyaml ldap3
ICC_DATA_DIR=/tmp/icc ICC_SEED_DIR=$PWD/example/config ICC_ADMIN_USER=admin ICC_ADMIN_PASSWORD=dev \
  ICC_COOKIE_SECURE=false python3 app/api/icc_api.py      # listens on 127.0.0.1:8090
```

The UI needs nginx in front of it (sessions are checked with `auth_request`). Render the config and run nginx:

```bash
ICC_PORT=8080 ICC_API_PORT=8090 python3 docker/render_nginx.py     # writes /tmp/nginx/nginx.conf
sed -i "s#root /app/web;#root $PWD/app/web;#" /tmp/nginx/nginx.conf
nginx -e /dev/stderr -c /tmp/nginx/nginx.conf -g 'daemon off;'
```

Or build the image: `docker build -t icc:dev . && docker run -p 8080:8080 -e ICC_ADMIN_PASSWORD=dev -e ICC_ADMIN_USER=admin -e ICC_COOKIE_SECURE=false icc:dev`.

Tests: `python3 tests/smoke_test.py` (API + OIDC flow against `tests/mock_oidc.py`).
