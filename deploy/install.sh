#!/usr/bin/env bash
# Carapace install script — VPS, Tailscale-fronted, runs alongside OpenClaw.
# Carapace binds to 127.0.0.1:3080. OpenClaw remains on 127.0.0.1:18789 (untouched).
set -euo pipefail

CARAPACE_DIR="${CARAPACE_DIR:-/opt/carapace}"
CARAPACE_PORT="${CARAPACE_PORT:-3080}"
OPENCLAW_BASE_URL="${OPENCLAW_BASE_URL:-http://127.0.0.1:18789}"

echo "==> Installing Carapace into $CARAPACE_DIR (port $CARAPACE_PORT)"
echo "==> OpenClaw expected at $OPENCLAW_BASE_URL (Carapace will NOT modify OpenClaw)"

command -v bun >/dev/null || { echo "bun is required (https://bun.sh)"; exit 1; }
command -v sqlite3 >/dev/null || echo "warn: sqlite3 not found — install for FTS5 memory backend"

mkdir -p "$CARAPACE_DIR"
cp -r ./* "$CARAPACE_DIR"/
cd "$CARAPACE_DIR"

bun install --production

if [ ! -f .env ]; then
  cp .env.example .env
  sed -i "s|OPENCLAW_BASE_URL=.*|OPENCLAW_BASE_URL=${OPENCLAW_BASE_URL}|" .env
  sed -i "s|PORT=.*|PORT=${CARAPACE_PORT}|" .env
fi

echo "==> Installing systemd unit"
sudo cp deploy/carapace.service /etc/systemd/system/carapace.service
sudo systemctl daemon-reload
sudo systemctl enable --now carapace

cat <<MSG

Carapace is running on http://127.0.0.1:${CARAPACE_PORT}

Expose it on your tailnet with:

    tailscale serve --bg http://127.0.0.1:${CARAPACE_PORT}

OpenClaw remains untouched on ${OPENCLAW_BASE_URL}.
MSG
