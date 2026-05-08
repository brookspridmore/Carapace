import { mockAdapter } from "./adapters/mock.server";
import { emptyAdapter } from "./adapters/empty.server";
import { gatewayAdapter } from "./adapters/gateway.server";
import { createOpenClawAdapter } from "./adapters/openclaw.server";
import { createFilesystemAdapter, getOpenClawRootPath } from "./adapters/filesystem.server";
import type { OpenClawAdapter } from "./adapters/types";

// Carapace proxy layer. The browser NEVER calls OpenClaw directly — every UI
// request flows through createServerFn handlers that call this adapter.
//
// Env vars:
//   OPENCLAW_MODE          — "mock" | "gateway" | "readonly" | "live"
//                            Default: "mock" in dev, "gateway" on VPS.
//   OPENCLAW_BASE_URL      — OpenClaw gateway base URL (http or ws scheme).
//                            Default: http://127.0.0.1:18789
//   OPENCLAW_GATEWAY_URL   — Alias for OPENCLAW_BASE_URL.
//   OPENCLAW_GATEWAY_TOKEN       — Bearer token for gateway auth.
//   OPENCLAW_ROOT_PATH     — Filesystem root (readonly supplemental reads).
//
// Mode selection priority:
//   1. "mock"    → in-memory demo data (preview/dev)
//   2. "gateway" → full WS RPC control plane (primary VPS mode) ← NEW
//   3. "readonly"→ filesystem read-only
//   4. "live"    → alias for "gateway"

export type OpenClawMode = "mock" | "gateway" | "readonly" | "live";

const DEFAULT_BASE_URL = "http://127.0.0.1:18789";

export function getOpenClawMode(): OpenClawMode {
  const raw = (process.env.OPENCLAW_MODE ?? "").toLowerCase().trim();
  if (raw === "gateway" || raw === "live") return "gateway";
  if (raw === "readonly") return "readonly";
  return "mock";
}

export function getOpenClawBaseUrl(): string {
  const url = process.env.OPENCLAW_BASE_URL ?? process.env.OPENCLAW_GATEWAY_URL;
  return url && url.length > 0 ? url : DEFAULT_BASE_URL;
}

export function getOpenClawGatewayToken(): string | null {
  const k = process.env.OPENCLAW_GATEWAY_TOKEN;
  return k && k.length > 0 ? k : null;
}

export function getAdapter(): OpenClawAdapter {
  const mode = getOpenClawMode();

  switch (mode) {
    case "mock":
      return mockAdapter;

    case "gateway":
      // Primary live adapter: persistent WS connection to OpenClaw gateway.
      return gatewayAdapter;

    case "readonly": {
      // Read-only filesystem adapter (supplemental / legacy).
      const root = getOpenClawRootPath();
      if (root) return createFilesystemAdapter(root);
      if (process.env.OPENCLAW_BASE_URL || process.env.OPENCLAW_GATEWAY_URL) {
        return createOpenClawAdapter(getOpenClawBaseUrl(), getOpenClawGatewayToken());
      }
      return emptyAdapter;
    }

    default:
      return emptyAdapter;
  }
}

// Re-export for telemetry consumers.
export { getLastFetch } from "./openclaw-telemetry.server";
export { emptyAdapter };
