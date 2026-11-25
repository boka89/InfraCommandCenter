# Configuration

ICC has two kinds of configuration:

1. **Environment variables (`ICC_*`)** set how this instance runs: where the config repository is, sign-in, the AI agent and metrics. In Kubernetes these come from Helm values and Secrets; with Docker, from `.env`.
2. **The configuration repository** holds what ICC shows: the inventory, sites, planner, changelog and instance settings.

## Environment variables

### Core

| Variable | Default | Meaning |
|---|---|---|
| `ICC_PUBLIC_URL` | – | External URL, e.g. `https://icc.example.com` (OIDC redirect, links in notifications) |
| `ICC_DATA_DIR` | `/data` | Data volume: repository clone, chat transcripts, job history, audit log |
| `ICC_SESSION_SECRET` | generated, stored in `/data` | HMAC key for session cookies |
| `ICC_SESSION_TTL` | `43200` | Session lifetime in seconds |
| `ICC_COOKIE_SECURE` | `true` | Set `false` only for plain-HTTP testing |
| `ICC_PORT` / `ICC_SD_PORT` / `ICC_API_PORT` | `8080` / `8081` / `8090` | Web, internal probe-target and API ports |

### Configuration repository

| Variable | Default | Meaning |
|---|---|---|
| `ICC_CONFIG_REPO` | – (local repo) | `git@host:org/repo.git` or `https://host/org/repo.git`. Empty: a local repository seeded from `example/config` |
| `ICC_CONFIG_BRANCH` | `main` | Branch to read from and push to |
| `ICC_CONFIG_PATH` | – | Sub-directory holding the ICC files, for when they live inside a bigger GitOps repository |
| `ICC_GIT_SSH_KEY` | – | Private deploy key (write access). `\n` sequences are accepted |
| `ICC_GIT_KNOWN_HOSTS` | – | known_hosts lines. Without them the host key is trusted on first use |
| `ICC_GIT_TOKEN` / `ICC_GIT_USER` | – / `x-access-token` | HTTPS token instead of SSH |
| `ICC_GIT_WEB` | derived | Web URL for commit/file links (derived automatically for GitHub, GitLab and Gitea URLs) |
| `ICC_GIT_EMAIL` | `icc@localhost` | Author e-mail of UI commits (`<Name> via ICC`) |
| `ICC_AGENT_GIT_EMAIL` | – | E-mail the AI commits with, used to attribute its own commits |

### Sign-in

See [auth.md](auth.md): `ICC_AUTH_PROVIDERS`, `ICC_ADMIN_*`, `ICC_USERS_FILE`, `ICC_LDAP_*`, `ICC_OIDC_*`.

### AI, metrics, docs

| Variable | Meaning |
|---|---|
| `ICC_HERMES_URL`, `ICC_HERMES_API_KEY` | Hermes Agent API server and its `API_SERVER_KEY` |
| `ICC_HERMES_AUTO_APPROVE` | `true` (default): approval prompts of ICC-started runs are answered automatically |
| `ICC_NOTIFY_URL`, `ICC_NOTIFY_SECRET` | Optional Hermes webhook route (HMAC) for "task started / finished" notices to chat platforms |
| `ICC_METRICS_URL` | Prometheus-compatible query API (VictoriaMetrics, Prometheus, Mimir, Thanos) |
| `ICC_METRICS_AUTH_HEADER` | Optional `Authorization` header value for the metrics backend |
| `ICC_GRAFANA_URL` | Grafana origin allowed in the CSP `frame-src`, so public dashboards can be embedded |
| `ICC_DOCS_URL` | MkDocs site whose `search/search_index.json` is searched on the Docs page |

## The configuration repository

```
icc.yaml          instance name, AI house rules, links, Kubernetes/capacity hints, extra config files
structure.yaml    regions › sites › buildings › floors
inventory.yaml    node types, categories, nodes, services, Grafana, quick links
planner.md        tasks by area (## headings), Markdown task list with tags
changelog.md      one line per change, newest first
settings/users/<login>.yaml    written by ICC (theme, time zone)
settings/hermes/<login>.yaml   written by ICC (chat folders + instructions)
```

The files in [`example/config/`](../example/config) document every field in comments. Short reference:

**inventory.yaml node**: `id`, `name`, `site`, `type`, `logo`, `ip`, `url`, `os`, `role`, `parent`, `notes`, `probe` (`icmp` | `tcp:<port>` | `http` | `none`), `pve` (`node/NAME`, `qemu/ID`, `lxc/ID`), `k8s` (node name), `win` (windows_exporter hostname), `expect: stopped`, `building`, `floor: <bld>/<floor>`, `docs`, `inferred: true`.

**inventory.yaml service**: `id`, `name`, `site`, `category`, `desc`, `url`, `logo`, `runs_on`, `argocd` (application name), `probe` (default `http` when `url` is set), `tls: self-signed`.

**planner.md task**: ``- [ ] `P1` `next` `due:2026-12-31` `owner:Jane` **Title** — details``. All tags are optional. Status is one of `backlog` (default), `next`, `doing`, `waiting`, or ticked for done. Tasks without an owner belong to the AI operator.

**changelog.md line**: ``- **Who** — `2026-11-25 10:00:00Z` — summary — [Link](url)``

Icons for `logo:` are files in `app/web/icons/`, taken from [homarr-labs/dashboard-icons](https://github.com/homarr-labs/dashboard-icons). Built-in type icons are `type-*.svg`.
