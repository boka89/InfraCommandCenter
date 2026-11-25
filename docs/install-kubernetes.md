# Install on Kubernetes

Requirements: Kubernetes 1.27+, a default StorageClass (or set `persistence.storageClass`), and an ingress controller for external access.

```bash
helm install icc oci://ghcr.io/boka89/charts/infra-command-center --version 0.2.0-alpha \
  -n icc --create-namespace -f my-values.yaml
```

From a checkout, use `helm install icc ./charts/infra-command-center ...`.

## Example values

```yaml
publicUrl: https://icc.example.com
ingress:
  enabled: true
  className: traefik            # or nginx
  host: icc.example.com
  tlsSecretName: icc-tls
  certManagerIssuer: letsencrypt   # optional: creates the Certificate

config:
  repo: git@github.com:acme/infra-config.git
  branch: main
  existingSecret: icc-git        # key git-ssh-key (deploy key with write access), optional known-hosts

auth:
  providers: [local, oidc]
  oidc:
    issuer: https://sso.example.com/realms/acme
    clientId: icc
    existingSecret: icc-oidc     # key client-secret
    allowedGroups: [it-admins]

ai:
  url: http://hermes.acme.lan:8642
  existingSecret: icc-hermes     # key api-key

monitoring:
  url: ""                        # empty = bundled VictoriaMetrics + blackbox exporter
```

Create the Secrets first, for example:

```bash
kubectl -n icc create secret generic icc-git --from-file=git-ssh-key=./deploy_key \
  --from-literal=known-hosts="$(ssh-keyscan github.com 2>/dev/null)"
kubectl -n icc create secret generic icc-hermes --from-literal=api-key=<API_SERVER_KEY of Hermes>
```

## Notes

- ICC runs as a single replica with a `ReadWriteOnce` volume (strategy `Recreate`). The volume holds the repository clone, chat transcripts and job history. It is kept on uninstall (`helm.sh/resource-policy: keep`).
- The blackbox exporter needs `NET_RAW` and runs as root for ICMP. Set `monitoring.blackbox.enabled=false` if your policy forbids that and you probe elsewhere.
- To resolve internal names from probes (for example AD DNS), set `monitoring.blackbox.dnsServers`.
- The `-sd` Service (port 8081) serves probe targets in-cluster. Do not expose it.
