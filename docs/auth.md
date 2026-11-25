# Sign-in

Enable one or more providers with `ICC_AUTH_PROVIDERS` (Helm: `auth.providers`), for example `local,ldap,oidc`. The login page shows a username/password form when `local` or `ldap` is enabled, and an SSO button for `oidc`. A username/password is checked against local users first, then LDAP.

> Everyone who can sign in can start AI runs with full infrastructure access. Restrict sign-in to administrators with the LDAP group or the OIDC allowed groups.

## Local users

- **Bootstrap admin**: `ICC_ADMIN_USER` + `ICC_ADMIN_PASSWORD` (or `ICC_ADMIN_PASSWORD_HASH`). The Helm chart generates the password into the Secret `<release>-admin` unless you set `auth.local.existingSecret`.
- **More users**: mount a YAML file at `ICC_USERS_FILE` (default `/etc/icc/users.yaml`; Helm: `auth.local.usersSecret`, key `users.yaml`). Keep it in a Secret, never in Git.

```yaml
users:
  - {login: jane, name: Jane Doe, password_hash: "pbkdf2_sha256$310000$...$..."}
  - {login: bob, name: Bob, password_hash: "...", disabled: true}
```

Create a hash with `docker run --rm -i ghcr.io/boka89/infracommandcenter python3 /app/api/icc_api.py hash-password` (type the password and press Enter), or run `python3 app/api/icc_api.py hash-password` from a checkout.

## LDAP / Active Directory

| Variable (Helm `auth.ldap.*`) | Meaning |
|---|---|
| `ICC_LDAP_URLS` (`urls`) | Space-separated, tried in order: `ldaps://dc1.example.com ldaps://dc2.example.com` |
| `ICC_LDAP_MODE` (`mode`) | `ad`: bind as `user@ICC_LDAP_DOMAIN`, then check *nested* membership of the group (AD matching rule). `search`: bind with a service account, search the user, then bind as the user |
| `ICC_LDAP_DOMAIN` (`domain`) | AD UPN suffix (`ad` mode) |
| `ICC_LDAP_BASE_DN` (`baseDN`) | Search base |
| `ICC_LDAP_GROUP_DN` (`groupDN`) | Only members may sign in |
| `ICC_LDAP_BIND_DN` / `ICC_LDAP_BIND_PASSWORD` | Service account (`search` mode; Helm: `bindDN` + `existingSecret` key `bind-password`) |
| `ICC_LDAP_USER_FILTER` (`userFilter`) | `search` mode, default `(uid={user})`. For AD in search mode use `(sAMAccountName={user})` |
| `ICC_LDAP_NAME_ATTR` (`nameAttr`) | Display name attribute, default `displayName` |
| `ICC_LDAP_CA_FILE` (`caConfigMap`, key `ca.pem`) | CA certificates for LDAPS. Certificates are always verified |
| `ICC_LDAP_TLS_NAMES` (`tlsNames`) | Expected certificate names when you connect by IP |
| `ICC_LDAP_STARTTLS` (`startTLS`) | Use StartTLS on `ldap://` |

A wrong password is not retried on the next server, so a failed sign-in does not count twice towards an AD lockout.

## OpenID Connect (Keycloak, Authentik, Entra ID, Google, ...)

Register a confidential client with the redirect URI `https://<icc>/papi/oidc/callback`, then set:

| Variable (Helm `auth.oidc.*`) | Meaning |
|---|---|
| `ICC_OIDC_ISSUER` (`issuer`) | Issuer URL (`/.well-known/openid-configuration` is appended) |
| `ICC_OIDC_CLIENT_ID` / `ICC_OIDC_CLIENT_SECRET` | Client credentials (Helm: `existingSecret`, key `client-secret`) |
| `ICC_OIDC_SCOPES` | Default `openid profile email`. Add `groups` if your IdP needs it |
| `ICC_OIDC_USER_CLAIM` | Login name claim, default `preferred_username` (falls back to `email`, then `sub`) |
| `ICC_OIDC_GROUPS_CLAIM` / `ICC_OIDC_ALLOWED_GROUPS` | Comma-separated allowed groups. Empty: any user of the client may sign in |
| `ICC_OIDC_LABEL` | Text of the SSO button |
| `ICC_PUBLIC_URL` | Must be set so the redirect URI is exact |

The flow is authorization code + PKCE (S256), with state and nonce. ICC receives the ID token directly from the token endpoint over TLS and checks issuer, audience, expiry and nonce (OIDC Core 3.1.3.7). It merges claims from the userinfo endpoint. In 0.1 alpha the flow is tested against a mock provider in CI (`tests/mock_oidc.py`). Please report results with real IdPs.
