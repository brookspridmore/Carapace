# Carapace deploy/

Reference scaffolding for installing Carapace on a VPS alongside OpenClaw.

| File | Purpose |
|---|---|
| `install.sh` | Copy app, install deps, write `.env`, install + start systemd unit |
| `carapace.service` | systemd unit binding to `127.0.0.1:8080` |

See the project root for:

- [`INSTALL.md`](../INSTALL.md) — install + verify
- [`DEPLOYMENT_TAILSCALE.md`](../DEPLOYMENT_TAILSCALE.md) — exposure via Tailscale Serve
- [`SECURITY.md`](../SECURITY.md) — approval gate, audit log, hardening
- [`.env.example`](../.env.example) — environment template

These files are reference scaffolding; the Lovable preview environment cannot literally bind to port 8080 or run as systemd. Run them on your VPS.
