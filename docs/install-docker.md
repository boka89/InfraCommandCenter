# Install with Docker

```bash
git clone https://github.com/boka89/InfraCommandCenter
cd InfraCommandCenter/deploy/compose
cp .env.example .env      # at least ICC_ADMIN_PASSWORD
docker compose up -d
```

Open `http://<host>:8080/` and sign in as `admin`. The stack is ICC, VictoriaMetrics and the blackbox exporter. Add `--profile vaultwarden` to also run Vaultwarden.

## Production checklist

- Put a TLS reverse proxy (Caddy, Traefik, nginx) in front, set `ICC_PUBLIC_URL=https://...`, and remove `ICC_COOKIE_SECURE=false`.
- Point `ICC_CONFIG_REPO` at your repository and give ICC a deploy key (`ICC_GIT_SSH_KEY` + `ICC_GIT_KNOWN_HOSTS`).
- Back up the `icc-data` volume (chats, job history, audit log). Configuration is already in Git.
- Only the web port (8080) should be published. 8081 (probe targets) stays on the compose network.

## Single container (no bundled monitoring)

```bash
docker run -d --name icc -p 8080:8080 -v icc-data:/data \
  -e ICC_ADMIN_USER=admin -e ICC_ADMIN_PASSWORD=change-me -e ICC_COOKIE_SECURE=false \
  -e ICC_METRICS_URL=http://prometheus.lan:9090 \
  ghcr.io/boka89/infracommandcenter:0.1.0-alpha
```
