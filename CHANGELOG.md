# Changelog

All notable changes to ICC. The format follows [Keep a Changelog](https://keepachangelog.com/) and versions follow [SemVer](https://semver.org/) (pre-1.0: minor versions may break).

## [0.1.0-alpha] — 2026-11-25

First public alpha, extracted from a production home-lab portal.

### Added
- Web UI: Overview with warning levels per site/building, Design (sites, inventory, topology, services, config history), Monitor (dashboards/probes, Kubernetes & GitOps, alarms), Planner (board, list, timeline), Changelog + admin activity, docs search, AI chat workspace.
- API (single Python file, no database): sessions; local users with PBKDF2 hashes; LDAP/AD (nested group check); OIDC (code + PKCE); Git-backed config with commit/push and race retry; inventory and probe targets (`http_sd`) generated from the repository; planner, settings and chat-folder edits as commits; admin activity attribution.
- Hermes Agent integration: chat sessions, Planner task execution, alarm Check & fix, live event streaming, auto-approval (configurable), optional webhook notices.
- Container image `ghcr.io/boka89/infracommandcenter` (amd64 + arm64, non-root).
- Helm chart with bundled VictoriaMetrics + blackbox exporter, optional Hermes Agent (experimental) and Vaultwarden.
- docker-compose stack, example configuration (ACME Ltd, 2 sites), documentation, CI with an API smoke test, a mock OIDC provider and a container run test.
