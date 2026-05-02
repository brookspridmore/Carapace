import { mockAdapter } from "./adapters/mock.server";
import { emptyAdapter } from "./adapters/empty.server";
import { createOpenClawAdapter } from "./adapters/openclaw.server";
import type { OpenClawAdapter } from "./adapters/types";

// Carapace proxy layer. The browser NEVER calls OpenClaw directly — every UI
// request flows through createServerFn handlers that call this adapter.
//
// Env vars (read inside handlers, never at module scope):
//   OPENCLAW_MODE        — "mock" | "readonly" | "live". Default "mock".
//   OPENCLAW_BASE_URL    — e.g. http://127.0.0.1:18789. Default applied when mode != mock.
//   OPENCLAW_API_KEY     — optional bearer token.
//   OPENCLAW_GATEWAY_URL — alias for OPENCLAW_BASE_URL (legacy).

export type OpenClawMode = "mock" | "readonly" | "live";

const DEFAULT_BASE_URL = "http://127.0.0.1:18789";

export function getOpenClawMode(): OpenClawMode {
  const raw = (process.env.OPENCLAW_MODE ?? "").toLowerCase().trim();
  if (raw === "readonly" || raw === "live") return raw;
  return "mock";
}

export function getOpenClawBaseUrl(): string {
  const url = process.env.OPENCLAW_BASE_URL ?? process.env.OPENCLAW_GATEWAY_URL;
  return url && url.length > 0 ? url : DEFAULT_BASE_URL;
}

export function getOpenClawApiKey(): string | null {
  const k = process.env.OPENCLAW_API_KEY;
  return k && k.length > 0 ? k : null;
}

export function getAdapter(): OpenClawAdapter {
  const mode = getOpenClawMode();
  if (mode === "mock") return mockAdapter;
  // readonly + live both use the real HTTP adapter today. live is reserved
  // for a future controlled-write mode and currently behaves as readonly.
  return createOpenClawAdapter(getOpenClawBaseUrl(), getOpenClawApiKey());
}

// Re-export for telemetry consumers.
export { getLastFetch } from "./openclaw-telemetry.server";
// Used by ocStatus to be explicit about the empty-adapter contract.
export { emptyAdapter };
