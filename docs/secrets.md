# Secrets

ICC's rule: **secrets never go into the configuration repository, and never into Helm values.**

| Secret | Where |
|---|---|
| Admin password, extra local users, OIDC client secret, LDAP bind password, Git deploy key/token, Hermes API key | Kubernetes Secrets referenced by `existingSecret` values (or `.env` with Docker) |
| Credentials the AI needs for your systems (hypervisors, firewalls, switches, cloud) | Your vault, read by the AI operator at run time |

## Use your own vault

Keep using what you have: Vaultwarden/Bitwarden, HashiCorp Vault, 1Password, Infisical, or your cloud's secret manager. Tell the AI how to reach it in the house rules (`icc.yaml` › `assistant.instructions`), for example *"Credentials are in Vaultwarden, collection Infra. Use the bw CLI."*. Give the AI its own vault account, with access only to the collections it needs.

To sync vault items into Kubernetes Secrets, use External Secrets Operator or a small sync job. The secrets ICC itself needs are few and rarely change.

## Deploy Vaultwarden with ICC

If the organisation has no vault yet, set `vaultwarden.enabled=true` in the Helm chart (or `docker compose --profile vaultwarden up -d`):

```yaml
vaultwarden:
  enabled: true
  domain: https://vault.example.com
  adminTokenSecret: vaultwarden-admin   # key admin-token (argon2 PHC string)
  ingress: {host: vault.example.com, tlsSecretName: vault-tls}
```

Signups are disabled. Invite users from the admin page (`/admin`). Then create an organisation, a collection for infrastructure credentials, and an account for the AI operator.
