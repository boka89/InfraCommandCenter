# Changelog

All notable changes to ICC. The format follows [Keep a Changelog](https://keepachangelog.com/) and versions follow [SemVer](https://semver.org/) (pre-1.0: minor versions may break).

## [0.2.0-alpha] — 2026-11-25

### Changed
- Alarms are classified as incidents with network-operations priorities instead of warning levels 0–3: **P1** critical (outage, act now), **P2** high (act today), **P3** low (plan a fix), or no priority (informational, no badge). Defaults: down = P2, degraded = P3, a whole Proxmox/Kubernetes cluster down = P1, one cluster node down = P2 (redundancy lost), TLS < 7 days = P2. Override per inventory item with `priority: P1 | P2 | P3 | none`. The header shows "All OK" when nothing needs action.
- Branding: the **InfraCommandCenter** wordmark with the company name (`icc.yaml` instance name) under it, in the sidebar, on the sign-in page and in the browser title.
- Scope switcher and overview tiles list buildings only when a site has more than one, and floors only when a building has more than one.

### Added
- Integrated docs: Markdown pages in the config repo (`docs/`), page tree (`nav.yml`), full-text search, Mermaid diagrams, admonitions/tabs/task lists, icon shortcodes, per-instance `docs.css`; edit and create pages in the browser (each save is a commit, stale edits are refused).
- Helm: bundled Grafana (`monitoring.grafana`) under `/grafana` on the ICC host, datasource = metrics backend, dashboards from ConfigMaps and grafana.com, LDAP/AD config; VictoriaMetrics Kubernetes discovery (`kubernetes.enabled`: RBAC + kubelet/cAdvisor jobs), global `relabelConfig`, `externalLabels`, `scrapeInterval`, `extraArgs`.

### Fixed
- Kubernetes service links (`ICC_PORT=tcp://…` from a Service named `icc`) no longer break the nginx render.

## [0.1.0-alpha] — 2026-11-25

First public alpha, extracted from a production home-lab portal.

### Added
- Web UI: Overview with warning levels per site/building, Design (sites, inventory, topology, services, config history), Monitor (dashboards/probes, Kubernetes & GitOps, alarms), Planner (board, list, timeline), Changelog + admin activity, docs search, AI chat workspace.
- API (single Python file, no database): sessions; local users with PBKDF2 hashes; LDAP/AD (nested group check); OIDC (code + PKCE); Git-backed config with commit/push and race retry; inventory and probe targets (`http_sd`) generated from the repository; planner, settings and chat-folder edits as commits; admin activity attribution.
- Hermes Agent integration: chat sessions, Planner task execution, alarm Check & fix, live event streaming, auto-approval (configurable), optional webhook notices.
- Container image `ghcr.io/boka89/infracommandcenter` (amd64 + arm64, non-root).
- Helm chart with bundled VictoriaMetrics + blackbox exporter, optional Hermes Agent (experimental) and Vaultwarden.
- docker-compose stack, example configuration (ACME Ltd, 2 sites), documentation, CI with an API smoke test, a mock OIDC provider and a container run test.
