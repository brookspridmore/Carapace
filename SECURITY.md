# Carapace Security Model

Carapace is an **operator control system** for autonomous agents. Its security posture assumes:

1. The operator is trusted; everything else is not.
2. Agents will eventually try to do something risky.
3. OpenClaw's local API has no auth — Carapace is the trust boundary.

## Network

- Binds to `127.0.0.1:3080` only. Never `0.0.0.0`.
- Exposed via Tailscale Serve (see [DEPLOYMENT_TAILSCALE.md](./DEPLOYMENT_TAILSCALE.md)).
- VPS firewall should drop all inbound traffic on `:3080` and `:18789`.
- All OpenClaw calls are server-side; the browser never talks to OpenClaw directly.

## Approval gate

The following agent actions are **blocked** until you approve them in the Approvals queue:

- Shell commands (`exec` tool)
- File edits inside the OpenClaw codebase
- Provider/config changes
- Memory writes (promotions and prunes from the dreaming engine)

Each pending approval shows the agent, action type, summary, details, and (where relevant) a diff. Decisions are written to the audit log.

## Audit log

Every state change is recorded with:

- Timestamp, agent ID, action type
- Operator decision (approve / deny) when applicable
- Before/after diff for file and config changes

Stored in the local SQLite DB (`/var/lib/carapace/carapace.db`) and rotated to `/var/log/carapace/audit.log`.

## Secrets

- Provider API keys live in `/opt/carapace/.env` (mode `0600`, owner `carapace`).
- Never logged, never returned to the browser, never proxied verbatim — Carapace forwards them to OpenClaw inside server-side calls only.
- `SESSION_SECRET` must be set to a random value (`openssl rand -hex 32`).

## Hardening checklist

- [ ] `HOST=127.0.0.1` in `.env`
- [ ] `ss -tlnp | grep 3080` shows loopback only
- [ ] Tailscale ACLs restrict access to operators
- [ ] `.env` is mode `0600`, owner `carapace`
- [ ] `SESSION_SECRET` rotated from default
- [ ] Approval queue is checked at least daily
- [ ] OpenClaw remains on `127.0.0.1:18789` and was not modified by the installer

## What Carapace will NOT do

- Replace OpenClaw
- Modify OpenClaw core
- Bind to port 18789
- Auto-approve risky actions
- Send agent transcripts off-host without an explicit operator action
