# Installing Carapace

Carapace is the operator dashboard for **OpenClaw**. It runs **alongside** OpenClaw — it does not replace it and never modifies OpenClaw core.

- **OpenClaw** stays on `http://127.0.0.1:18789` (untouched).
- **Carapace** binds to `http://127.0.0.1:3080` and is exposed via Tailscale Serve.

## Requirements

- Linux VPS (no GPU required)
- [bun](https://bun.sh) ≥ 1.1
- `sqlite3` (for FTS5 memory backend)
- `tailscale` (recommended for remote access)
- A non-root user to own `/opt/carapace`

## Quick install

```bash
sudo useradd -r -s /bin/false carapace || true
sudo mkdir -p /opt/carapace /var/lib/carapace /var/log/carapace
sudo chown -R carapace:carapace /opt/carapace /var/lib/carapace /var/log/carapace

# From the unpacked release directory:
sudo OPENCLAW_BASE_URL=http://127.0.0.1:18789 ./deploy/install.sh
```

The installer:

1. Copies the app into `/opt/carapace`
2. Installs production dependencies with `bun install --production`
3. Writes `.env` from `.env.example` (only if missing)
4. Installs and starts the `carapace.service` systemd unit
5. Prints the Tailscale Serve command

## Verify

```bash
systemctl status carapace
curl -fsS http://127.0.0.1:3080/ | head -n 20
```

## Configuration

Edit `/opt/carapace/.env`. Key variables:

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3080` | Localhost port Carapace binds to |
| `HOST` | `127.0.0.1` | Must stay loopback — Tailscale handles exposure |
| `OPENCLAW_BASE_URL` | `http://127.0.0.1:18789` | OpenClaw HTTP API. `OPENCLAW_GATEWAY_URL` is accepted as alias |
| `DATABASE_URL` | `sqlite:///var/lib/carapace/carapace.db` | Local SQLite + FTS5 |
| `SESSION_SECRET` | — | `openssl rand -hex 32` |

After changing `.env`: `sudo systemctl restart carapace`.

## Next

- [DEPLOYMENT_TAILSCALE.md](./DEPLOYMENT_TAILSCALE.md) — exposing Carapace to your tailnet
- [SECURITY.md](./SECURITY.md) — approval workflow, audit logs, hardening
