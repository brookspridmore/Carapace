# Deploying Carapace behind Tailscale

Carapace is designed to **never** listen on a public interface. The default `HOST=127.0.0.1` binding is enforced; remote access happens through your tailnet via [Tailscale Serve](https://tailscale.com/kb/1242/tailscale-serve).

## One-liner

```bash
tailscale serve --bg http://127.0.0.1:3080
```

This makes Carapace reachable at `https://<machine-name>.<tailnet>.ts.net` for any device on your tailnet, with automatic TLS.

## Restrict to specific users / devices

Use Tailscale ACLs to limit who can reach the Carapace service. Example ACL fragment:

```hcl
{
  "acls": [
    { "action": "accept", "src": ["group:operators"], "dst": ["tag:carapace:443"] }
  ],
  "tagOwners": { "tag:carapace": ["group:operators"] }
}
```

Then tag the VPS:

```bash
tailscale up --advertise-tags=tag:carapace
```

## Stop serving

```bash
tailscale serve reset
```

## Why not expose port 3080 directly?

- Carapace gates risky agent actions behind operator approval. Public exposure invites brute-force on the approval queue.
- OpenClaw on `127.0.0.1:18789` is also localhost-only by design. Carapace inherits the same trust boundary.
- Tailscale gives you mTLS-grade auth without managing certificates or VPN servers.

## Firewall sanity check

On the VPS, confirm Carapace is loopback-only:

```bash
ss -tlnp | grep 3080
# Expect: 127.0.0.1:3080 (NOT 0.0.0.0:3080)
```

If you see `0.0.0.0`, fix `HOST=127.0.0.1` in `.env` and restart.
