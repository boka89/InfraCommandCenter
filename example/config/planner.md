# Planner

Tasks for the infrastructure, grouped by area (`## Area`). Edited from ICC or straight in Git.
Format: `- [ ] `P1|P2|P3` `next|doing|waiting` `due:YYYY-MM-DD` `owner:<name>` **Title** — details`
(tags are optional; tasks without an owner belong to the AI operator).

## HQ

- [ ] `P1` `next` **Replace the example inventory with the real one** — ask the AI in chat to discover the HQ network (gateway, switches, hypervisors, NAS) and update inventory.yaml.
- [ ] `P2` `due:2026-12-31` **Check NAS01 backup jobs** — confirm the nightly Proxmox and file-share backups ran and can be restored.
- [ ] `P3` **Document the VLAN layout** — servers, clients, guests, cameras.

## Branch

- [ ] `P2` `waiting` `owner:Office manager` **Order a UPS for the branch rack** — the FortiGate and NUC have no battery backup.

## Monitoring

- [ ] `P2` **Enable probes for internal hosts** — set `probe: icmp` (or `tcp:<port>` / `http`) on nodes once the blackbox exporter can reach them.
- [x] **Deploy ICC** — done 2026-11-25: installed from the Helm chart with the bundled VictoriaMetrics.
