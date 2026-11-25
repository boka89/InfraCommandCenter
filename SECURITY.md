# Security policy

ICC gives an AI agent full access to infrastructure, so security reports matter a lot.

- **Report vulnerabilities privately** via GitHub's *Report a vulnerability* (Security tab of this repository). Please do not open public issues for them.
- Expect an answer within a few days. Fixes are released as soon as possible and credited unless you prefer otherwise.
- Supported versions: the latest release only (alpha).

Hardening guidance is in [docs/architecture.md](docs/architecture.md#security-model-alpha). In short: restrict sign-in to administrators, keep secrets in Secrets/your vault (never in the config repository), terminate TLS in front of ICC, and do not expose port 8081.
