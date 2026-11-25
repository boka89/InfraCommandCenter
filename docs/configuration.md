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
| `ICC_INVENTORY_FILE`, `ICC_STRUCTURE_FILE`, `ICC_PLANNER_FILE`, `ICC_CHANGELOG_FILE`, `ICC_INSTANCE_FILE` | – | Repo-relative path of one file, when your repository keeps it somewhere else (e.g. an existing `docs/operations/todo.md`) |
| `ICC_SETTINGS_DIR`, `ICC_ICONS_DIR` | `<path>/settings`, `<path>/icons` | Repo-relative directories for per-user settings and extra icons |

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
| `ICC_GRAFANA_URL` | Grafana URL (bundled: `<public url>/grafana`); its origin is allowed in the CSP `frame-src`, so public dashboards can be embedded |
| `ICC_DOCS_DIR` | Repo-relative folder of the integrated docs (default `<config path>/docs`) |
| `ICC_DOCS_URL` | Legacy: external MkDocs site whose `search/search_index.json` is searched when the repo has no docs folder |

## The configuration repository

```
icc.yaml          instance name, AI house rules, links, Kubernetes/capacity hints, extra config files
structure.yaml    regions › sites › buildings › floors
inventory.yaml    node types, categories, nodes, services, Grafana, quick links
planner.md        tasks by area (## headings), Markdown task list with tags
changelog.md      one line per change, newest first
settings/users/<login>.yaml    written by ICC (theme, time zone)
settings/hermes/<login>.yaml   written by ICC (chat folders + instructions)
docs/             integrated documentation: Markdown pages, optional nav.yml, assets/ (icons, images, docs.css)
```

**docs/**: every `*.md` is a page (front matter `title:` optional), searchable and editable on the Docs page; saving
commits to Git as the signed-in user. `nav.yml` orders the page tree (MkDocs `nav:` syntax); without it the tree
follows the folders. Supported: tables, admonitions (`!!! note`), collapsible blocks (`??? note`), tabs (`=== "Tab"`),
task lists, footnotes, definition lists, attribute lists, Markdown inside HTML, ```` ```mermaid ```` diagrams and icon
shortcodes like `:material-server:` (SVG in `docs/assets/icons/material-server.svg`). `docs/assets/docs.css` is loaded
for page-specific styles. Relative `.md` links open inside ICC; links from the changelog and planner to pages in
`docs/` do too. Coming from MkDocs: copy `docs/`, convert `nav:` to `nav.yml` and copy the icon SVGs you use from
`material/templates/.icons/` — that is all.

The files in [`example/config/`](../example/config) document every field in comments. Short reference:

**inventory.yaml node**: `id`, `name`, `site`, `type`, `logo`, `ip`, `url`, `os`, `role`, `parent`, `notes`, `probe` (`icmp` | `tcp:<port>` | `http` | `none`), `pve` (`node/NAME`, `qemu/ID`, `lxc/ID`), `k8s` (node name), `win` (windows_exporter hostname), `expect: stopped`, `building`, `floor: <bld>/<floor>`, `docs`, `inferred: true`, `priority`.

**inventory.yaml service**: `id`, `name`, `site`, `category`, `desc`, `url`, `logo`, `runs_on`, `argocd` (application name), `probe` (default `http` when `url` is set), `tls: self-signed`, `priority`.

**Incident priority** (`priority: P1 | P2 | P3 | none` on a node or service): alarms are classified like network-operations incidents. P1 critical = outage, act now · P2 high = act today · P3 low = plan a fix · `none` = informational, no badge. Without a setting: down = P2, degraded = P3, every node of a Proxmox or Kubernetes cluster down = P1, one cluster node down = P2 (redundancy lost), TLS expiring within 7 days = P2. A `priority` applies when the item is down; degraded is one step lower. Mark the things your business cannot work without as `P1`.

**planner.md task**: ``- [ ] `P1` `next` `due:2026-12-31` `owner:Jane` **Title** — details``. All tags are optional. Status is one of `backlog` (default), `next`, `doing`, `waiting`, or ticked for done. Tasks without an owner belong to the AI operator.

**changelog.md line**: ``- **Who** — `2026-11-25 10:00:00Z` — summary — [Link](url)``

Icons for `logo:` are files in `app/web/icons/` or in the repository's `icons/` directory (served when the image has no icon of that name), taken from [homarr-labs/dashboard-icons](https://github.com/homarr-labs/dashboard-icons). Built-in type icons are `type-*.svg`.
