# Roadmap

ICC is in **alpha**. Priorities can change based on feedback, so open an issue to vote or propose.

## 0.1 alpha (this release)
- Single image (nginx + Python API), Helm chart and docker-compose
- Git-backed configuration: inventory, sites, planner, changelog, per-user settings
- Sign-in: local users, LDAP / Active Directory, OpenID Connect
- Monitoring: bundled VictoriaMetrics + blackbox exporter, or any Prometheus-compatible backend
- AI operator: Hermes Agent (chat with folders, Planner task execution, alarm Check & fix), full access by default
- Optional Vaultwarden deployment

## 0.2
- First-run wizard: create the configuration repository from the example, connect Git, invite the AI
- Approve / deny AI approval prompts from the UI (instead of all-or-nothing auto-approve)
- Roles: viewer / operator / admin (who may start AI runs, who may edit the Planner)
- Inventory discovery as a built-in AI task (subnet scan → pull request against inventory.yaml)
- Pull-request mode for UI and AI changes, as an alternative to direct commits
- Helm chart repository on GitHub Pages, signed images (cosign), SBOM

## Later
- Alert routing (e-mail, chat platforms) from ICC alarms without the AI in the loop
- Backup status as a first-class view (Proxmox Backup Server, restic, Synology)
- Certificate and domain expiry overview
- Multi-cluster Kubernetes views
- Plugin API for vendor-specific panels (UniFi, FortiGate, MikroTik, Synology, QNAP)
