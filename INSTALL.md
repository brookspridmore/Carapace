# Installing Carapace

Carapace is the operator dashboard for **OpenClaw**. It runs **alongside** OpenClaw — it does not replace it and never modifies OpenClaw core.

- **OpenClaw** stays on `ws://127.0.0.1:18789` (untouched). Carapace connects to it locally over WebSocket.
- **Carapace** binds to `http://127.0.0.1:8080` and is exposed via Tailscale Serve on a separate port.

Both dashboards coexist on the same Tailscale hostname at different ports:
- `https://<hostname>.ts.net` → OpenClaw (existing, unchanged)
- `https://<hostname>.ts.net:8080` → Carapace (new)

## Requirements

- Linux VPS (no GPU required)
- **Node.js ≥ 22** (required for native WebSocket — `node --version` to check)
- `npm` (comes with Node.js)
- `sqlite3` (for FTS5 memory backend)
- `tailscale` (recommended for remote access)
- A non-root user to own `/opt/carapace`

### Install Node 22 if needed

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install 22 && nvm use 22
```

## Quick install

```bash
# From the cloned repo directory:
OPENCLAW_GATEWAY_URL=ws://127.0.0.1:18789 \
OPENCLAW_GATEWAY_TOKEN=<your-openclaw-gateway-token> \
./deploy/install.sh
```

The installer:

1. Copies the app into `/opt/carapace`
2. Installs dependencies with `npm install --omit=dev`
3. Builds the production bundle with `npm run build`
4. Writes `.env` from `.env.example` (only if missing)
5. Creates the `carapace` system user (if missing)
6. Installs and starts the `carapace.service` systemd unit
7. Prints the Tailscale Serve command

## Verify

```bash
systemctl status carapace
curl -fsS http://127.0.0.1:8080/ | head -n 20
```

## Expose via Tailscale

Run this once to add Carapace to your tailnet alongside OpenClaw:

```bash
tailscale serve --bg --https=8080 http://127.0.0.1:8080
```

Check both serve rules are active:

```bash
tailscale serve status
```

## Configuration

Edit `/opt/carapace/.env`. Key variables:

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `8080` | Localhost port Carapace binds to |
| `HOST` | `127.0.0.1` | Must stay loopback — Tailscale handles exposure |
| `OPENCLAW_MODE` | `gateway` | Set to `gateway` to connect via WebSocket |
| `OPENCLAW_GATEWAY_URL` | `ws://127.0.0.1:18789` | OpenClaw WebSocket gateway address |
| `OPENCLAW_GATEWAY_TOKEN` | — | Gateway auth token (from your OpenClaw config) |
| `OPENCLAW_ROOT_PATH` | `~/.openclaw` | Optional: filesystem path for readonly fallback |
| `DATABASE_URL` | `sqlite:///var/lib/carapace/carapace.db` | Local SQLite + FTS5 |
| `SESSION_SECRET` | — | Generate with: `openssl rand -hex 32` |

After changing `.env`: `sudo systemctl restart carapace`.

## Finding your gateway token

The token authenticates Carapace's WebSocket connection to OpenClaw. Check:

```bash
# OpenClaw stores config and secrets here:
cat ~/.openclaw/.env | grep TOKEN
# or
grep -i token ~/.openclaw/openclaw.json
```

## Manual start (without systemd)

```bash
cd /opt/carapace
node .output/server/index.mjs
```
