# Infra Command Center (ICC)

**An AI-first, Git-backed command center for small-business infrastructure.** Bring your own servers, network and Kubernetes; ICC sits on top as one place to see, plan and change everything, with an AI operator ([Hermes Agent](https://github.com/NousResearch/hermes-agent)) that has full access and does the work.

> **Status: 0.1 alpha.** Usable, but expect breaking changes to configuration and APIs until 1.0. Please [open an issue](https://github.com/boka89/InfraCommandCenter/issues) for anything that breaks.

![ICC overview](docs/img/overview.png)

## What it does

- **Overview**: a warning level (0–3) for every site and building, with capacity, Kubernetes state, recent changes and the top Planner tasks.
- **Design**: sites (region › site › building › floor), inventory (hosts, VMs, devices), topology, services, and every config file with its Git history.
- **Monitor**: live health from probes and metrics (Proxmox, Kubernetes, ArgoCD, Longhorn, Windows), embedded Grafana dashboards and alarms. Every alarm has a **Check & fix** button that hands it to the AI.
- **Planner**: a task board stored as Markdown in Git, with **Execute with Hermes** on every task.
- **Changelog**: what changed and when, plus an admin activity log of who changed, ran or signed in to what.
- **AI chat**: Hermes Agent with folders/projects and per-folder instructions. It changes configuration through Git commits under your name.

## Design principles

- **Git is the database.** All configuration (inventory, sites, planner, changelog, per-user settings) is plain YAML/Markdown in *your* repository. Every edit is a commit, so history, review and rollback come for free. No SQL database.
- **Light.** One small container (nginx + a single-file Python API, about 60 MB) plus optional VictoriaMetrics and the blackbox exporter.
- **Bring your own.** Your Git server, monitoring (any Prometheus-compatible API), identity (local, LDAP/AD or OIDC), vault and AI agent. If you don't have something, ICC can deploy it.
- **AI-first.** The UI is for seeing and deciding; the AI operator does the work through the same Git repository, with full access by default.
- **One ICC per business.** There is no multi-tenancy.

## Quick start

### Docker (single host)

```bash
git clone https://github.com/boka89/InfraCommandCenter && cd InfraCommandCenter/deploy/compose
cp .env.example .env          # set ICC_ADMIN_PASSWORD
docker compose up -d          # ICC + VictoriaMetrics + blackbox exporter
open http://localhost:8080/   # sign in as admin
```

### Kubernetes (Helm)

```bash
helm install icc oci://ghcr.io/boka89/charts/infra-command-center --version 0.1.0-alpha \
  -n icc --create-namespace \
  --set ingress.enabled=true --set ingress.host=icc.example.com
kubectl -n icc get secret icc-admin -o jsonpath='{.data.admin-password}' | base64 -d; echo
```

Both start with an **example configuration** (ACME Ltd, 2 sites) in a local Git repository on the data volume. Next steps:

1. Point ICC at your own repository (`ICC_CONFIG_REPO` / `config.repo`). Copy `example/config/` into it as a starting point.
2. Connect your AI agent (`ICC_HERMES_URL`, see [docs/ai-hermes.md](docs/ai-hermes.md)), then ask it to discover your network and fill in the inventory.
3. Add metrics sources (node-exporter, pve-exporter, kube-state-metrics, windows_exporter). See [docs/monitoring.md](docs/monitoring.md).

## Documentation

- [Architecture](docs/architecture.md): components, data flow, where state lives
- [Configuration](docs/configuration.md): environment variables and the config repository files
- [Install on Kubernetes](docs/install-kubernetes.md) · [Install with Docker](docs/install-docker.md)
- [Sign-in: local, LDAP / AD, OIDC](docs/auth.md)
- [Monitoring: bundled or bring your own](docs/monitoring.md)
- [AI operator: Hermes Agent](docs/ai-hermes.md)
- [Secrets and Vaultwarden](docs/secrets.md)
- [Roadmap](ROADMAP.md) · [Changelog](CHANGELOG.md) · [Security](SECURITY.md) · [Contributing](CONTRIBUTING.md)

## License

[Apache License 2.0](LICENSE). Bundled third-party assets are listed in [NOTICE](NOTICE): Barlow fonts (SIL OFL 1.1) and service icons from homarr-labs/dashboard-icons (Apache-2.0).

ICC was extracted from a production home-lab portal. Hermes Agent is a separate project by Nous Research (MIT).
