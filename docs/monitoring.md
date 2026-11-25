# Monitoring

ICC does not store metrics. It reads them from a Prometheus-compatible query API through a read-only proxy (`/api/vm/api/v1/query*`, GET only).

## Bundled (no monitoring yet)

The Helm chart (`monitoring.victoriametrics.enabled`, default on) and the compose file deploy:

- **VictoriaMetrics** (single node, 90 days retention)
- **blackbox exporter**: HTTP, TCP and ICMP probes

Probe targets come from the inventory. Every node or service with `probe: http | icmp | tcp:<port>` becomes a target in `http://<icc>:8081/sd/probes.json` (Prometheus `http_sd` format, with labels `module`, `probe_id`, `probe_kind` and `site`). Services with a `url` are probed over HTTP by default. Add your own exporters with `monitoring.victoriametrics.extraScrapeConfigs` (Helm) or `deploy/compose/vm-scrape.yml`.

## Bring your own (Prometheus, VictoriaMetrics, Mimir, Thanos)

Set `ICC_METRICS_URL` (Helm: `monitoring.url`, which also disables the bundled VictoriaMetrics), for example `http://prometheus.monitoring:9090`. Then add the probe job to your Prometheus:

```yaml
- job_name: icc-blackbox
  metrics_path: /probe
  http_sd_configs: [{url: "http://icc-sd.icc.svc:8081/sd/probes.json"}]
  relabel_configs:
    - {source_labels: [__address__], target_label: __param_target}
    - {source_labels: [module], target_label: __param_module}
    - {source_labels: [__param_target], target_label: instance}
    - {target_label: __address__, replacement: "blackbox-exporter:9115"}
```

Your blackbox exporter needs modules named `http`, `tcp` and `icmp` (see `deploy/compose/blackbox.yml`).

## What ICC reads

| Feature | Metrics | Exporter |
|---|---|---|
| Probes, latency, TLS expiry | `probe_success`, `probe_duration_seconds`, `probe_ssl_earliest_cert_expiry`, `probe_http_status_code` | blackbox exporter |
| Proxmox nodes and guests, drift ("guest not in inventory") | `pve_up`, `pve_cpu_usage_ratio`, `pve_memory_*`, `pve_disk_*`, `pve_guest_info` | prometheus-pve-exporter |
| Kubernetes nodes | `kube_node_status_condition`, `node_cpu_seconds_total`, `node_memory_*`, `node_filesystem_*` (label `node`) | kube-state-metrics, node-exporter |
| Pods | `kube_pod_status_phase`, `kube_pod_container_status_restarts_total` | kube-state-metrics |
| GitOps | `argocd_app_info` | Argo CD metrics |
| Storage | `longhorn_volume_robustness`, `longhorn_volume_*` | Longhorn |
| Windows | `windows_cpu_time_seconds_total`, `windows_memory_*`, `windows_logical_disk_*` (label `hostname`) | windows_exporter ≥ 0.30 |

Link inventory nodes to series with `pve:`, `k8s:` and `win:`. Series with a `site` label are attributed to that site. Cluster-wide series without one go to `kubernetes.site` in `icc.yaml`.

## Grafana

Optional. Under `grafana:` in `inventory.yaml`, list public (login-free) dashboards per site to embed them on Monitor › Dashboards, other dashboards to link, and per-node deep links (`nodeLinks`). Set `ICC_GRAFANA_URL` so the CSP allows the iframe.
