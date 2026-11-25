# Architecture

```
                 browser
                    │ HTTPS (ingress / reverse proxy)
        ┌───────────▼─────────────────────────────── ICC container ─┐
        │ nginx :8080                                               │
        │  ├─ static SPA (vanilla JS, no build step)                │
        │  ├─ auth_request → API (every page needs a session)       │
        │  ├─ /api/vm/*  → metrics backend (GET query API only)     │
        │  ├─ /api/docs/ → MkDocs search index (optional)           │
        │  └─ /papi/*    → ICC API (Python, 127.0.0.1:8090)          │
        │ nginx :8081 (internal) /sd/probes.json → API              │
        │                                                           │
        │ ICC API: sessions · Git · inventory/probes · planner ·    │
        │          changelog · settings · chat folders · AI runs    │
        └──────┬───────────────┬──────────────────┬────────────────┘
               │ git fetch/push │ /v1/runs (SSE)   │ LDAP(S) / OIDC
        config repository   Hermes Agent      directory / IdP
        (GitHub, GitLab,    (AI operator,
         Gitea, local)       full access)
               ▲
   VictoriaMetrics / Prometheus ── scrapes ── blackbox exporter (targets from :8081),
                                              node/pve/windows exporters, kube-state-metrics
```

## Where state lives

| What | Where | Why |
|---|---|---|
| Inventory, sites, planner, changelog, instance settings | Config Git repository | Versioned, reviewable, editable by people and the AI |
| Per-user settings (theme, time zone), AI chat folders and instructions | Config Git repository (`settings/`) | Same, and they travel with the config |
| Chat transcripts, AI job history, sign-in audit log | Data volume (`/data`) | Can hold command output or personal data, so kept out of Git |
| Metrics | VictoriaMetrics / your Prometheus | Time series do not belong in Git |
| Secrets (passwords, keys, tokens) | Kubernetes Secrets / your vault | Never in Git, never in ICC's config |

There is no database. The API reads the YAML/Markdown files from its clone of the repository (refreshed every 20 s and before every write) and caches parsed results per commit.

## Writes

Every UI write (Planner task, personal setting, chat folder) is: `git fetch` + hard reset → edit one file → commit as `<Name> via ICC` → push → verify that the remote has the commit, retrying once on a race. Configuration such as the inventory, sites and instance settings is **read-only in the UI**: people change it in Git, or ask the AI in chat. The AI edits the files, commits with a `Requested-by: <name> (<login>) via ICC` trailer and pushes. The *Admin activity* view attributes every commit to the accountable person.

## AI operator

ICC is a client of the [Hermes Agent API server](https://github.com/NousResearch/hermes-agent). Chat messages, *Execute with Hermes* on Planner tasks and *Check & fix* on alarms each start a run (`POST /v1/runs`). The prompt includes the requester, the repository location and conventions, and the organisation's house rules (`assistant.instructions` in `icc.yaml`). ICC relays the run's event stream to the browser and, with `ICC_HERMES_AUTO_APPROVE=true` (the default), answers approval prompts automatically. Unattended runs (tasks, alarms) are queued one at a time.

## Security model (alpha)

- Every page, inventory read and metrics query requires a session (signed cookie, HMAC-SHA256, default 12 h).
- Writes require the custom `X-ICC: 1` header, which a cross-site form cannot set. Cookies are `HttpOnly; SameSite=Lax; Secure`.
- Sign-in is rate-limited to 5 failures per IP per 5 minutes.
- The metrics proxy allows only GET query endpoints. Probe targets are served on a separate internal port.
- Strict CSP: no inline script, no third-party origins (fonts and icons are vendored).
- The container runs as non-root (uid 10001) with all capabilities dropped.
- **Anyone who can sign in can drive the AI, and the AI has full access.** Limit sign-in to administrators (LDAP group / OIDC groups). Role-based access is on the [roadmap](../ROADMAP.md).
