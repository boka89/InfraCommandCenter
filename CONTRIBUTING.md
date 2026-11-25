# Contributing

Thanks for helping. ICC aims to stay small and dependency-light.

- **Frontend**: vanilla JavaScript in `app/web/`, no build step and no frameworks. Check with `node --check app/web/*.js`. Design rules are in `docs/design.md` (warning levels 0–3 are the only status colours; no emoji, gradients or third-party CDNs).
- **API**: `app/api/icc_api.py`, standard library + PyYAML (+ ldap3). Run `python3 tests/smoke_test.py` before opening a pull request.
- **Chart**: `helm lint charts/infra-command-center` and `helm template`.
- Local run without Docker: see `docs/development.md`.
- Commits: small and focused, imperative subject line. By contributing you agree that your contribution is licensed under Apache-2.0.
