import { mockAdapter } from "./adapters/mock.server";
import type { OpenClawAdapter } from "./adapters/types";

// Carapace proxy layer. The browser NEVER calls OpenClaw directly — every UI
// request flows through createServerFn handlers that call this adapter.
//
// Env vars (read inside handlers, never at module scope):
//   OPENCLAW_BASE_URL    — preferred. e.g. http://127.0.0.1:18789
//   OPENCLAW_GATEWAY_URL — alias accepted for backwards compatibility.
export function getOpenClawBaseUrl(): string | null {
  const url = process.env.OPENCLAW_BASE_URL ?? process.env.OPENCLAW_GATEWAY_URL;
  return url && url.length > 0 ? url : null;
}

export function getAdapter(): OpenClawAdapter {
  // v1 always uses the mock adapter so the Lovable preview is fully
  // interactive. On the VPS, swap to createOpenClawAdapter(baseUrl) once
  // the OpenClaw HTTP surface is wired.
  return mockAdapter;
}
