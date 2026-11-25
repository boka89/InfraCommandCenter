---
title: Home
---

# ACME Ltd — infrastructure docs

These pages live in Git next to the inventory (`docs/` in the config repository). ICC renders them,
searches them, and lets you edit a page in place — every save is a commit.

!!! tip "Docs as code"
    Write plain Markdown. Admonitions, tabs, tables, task lists, `mermaid` diagrams and icon shortcodes
    such as :material-server: (SVGs in `docs/assets/icons/`) are supported.

| Site | Edge | Subnets |
|---|---|---|
| HQ | pfSense | `10.10.0.0/16` |
| Branch | FortiGate | `10.20.0.0/16` |

See [the network](network.md) and the [runbooks](runbooks/index.md).
