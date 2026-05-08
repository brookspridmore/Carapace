#!/usr/bin/env bash
# Carapace install script — VPS, Tailscale-fronted, runs alongside OpenClaw.
# Carapace binds to 127.0.0.1:8080. OpenClaw remains on 127.0.0.1:18789 (untouched).
set -euo pipefail

CARAPACE_DIR="${CARAPACE_DIR:-/opt/carapace}"
CARAPACE_PORT="${CARAPACE_PORT:-8080}"
OPENCLAW_GATEWAY_URL="${OPENCLAW_GATEWAY_URL:-ws://127.0.0.1:18789}"
OPENCLAW_GATEWAY_TOKEN="${OPENCLAW_GATEWAY_TOKEN:-}"

echo "==> Installing Carapace into $CARAPACE_DIR (port $CARAPACE_PORT)"
echo "==> OpenClaw gateway expected at $OPENCLAW_GATEWAY_URL (Carapace will NOT modify OpenClaw)"

# Node 22+ is required for native WebSocket support.
command -v node >/dev/null || { echo "node is required (https://nodejs.org — version 22 or later)"; exit 1; }
NODE_MAJOR=$(node --version | sed 's/v//' | cut -d. -f1)
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "error: Node.js 22+ required, found $(node --version)"; exit 1
fi
command -v npm >/dev/null || { echo "npm is required"; exit 1; }
command -v sqlite3 >/dev/null || echo "warn: sqlite3 not found — install for FTS5 memory backend"

mkdir -p "$CARAPACE_DIR"
# Use cp -a so dotfiles (.env.example etc.) are included in the copy.
cp -a . "$CARAPACE_DIR"/
cd "$CARAPACE_DIR"

echo "==> Installing dependencies (including dev deps needed for build)"
npm install

echo "==> Building Carapace"
npm run build

echo "==> Pruning dev dependencies"
npm prune --omit=dev

if [ ! -f .env ]; then
  cp .env.example .env
  sed -i "s|PORT=.*|PORT=${CARAPACE_PORT}|" .env
  sed -i "s|OPENCLAW_GATEWAY_URL=.*|OPENCLAW_GATEWAY_URL=${OPENCLAW_GATEWAY_URL}|" .env
  if [ -n "$OPENCLAW_GATEWAY_TOKEN" ]; then
    sed -i "s|OPENCLAW_GATEWAY_TOKEN=.*|OPENCLAW_GATEWAY_TOKEN=${OPENCLAW_GATEWAY_TOKEN}|" .env
  fi
fi

echo "==> Creating carapace system user (if missing)"
id -u carapace &>/dev/null || sudo useradd -r -s /bin/false carapace

echo "==> Installing systemd unit"
sudo cp deploy/carapace.service /etc/systemd/system/carapace.service
sudo chown -R carapace:carapace "$CARAPACE_DIR"
sudo systemctl daemon-reload
sudo systemctl enable --now carapace

cat <<MSG

Carapace is running on http://127.0.0.1:${CARAPACE_PORT}

Check status:
    systemctl status carapace
    journalctl -u carapace -f

Expose it on your tailnet (keeps OpenClaw dashboard untouched at root):
    tailscale serve --bg --https=${CARAPACE_PORT} http://127.0.0.1:${CARAPACE_PORT}

Carapace will then be reachable at:
    https://<your-tailscale-hostname>.ts.net:${CARAPACE_PORT}

OpenClaw gateway remains untouched at ${OPENCLAW_GATEWAY_URL}.
MSG
