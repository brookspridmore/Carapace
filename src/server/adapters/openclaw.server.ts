import type { OpenClawAdapter } from "./types";

// Stub for the real OpenClaw adapter. On the VPS this hits the OpenClaw HTTP
// API at OPENCLAW_BASE_URL (default http://127.0.0.1:18789). Until those
// endpoints are wired the proxy uses the mock adapter so the UI keeps working.
export function createOpenClawAdapter(_baseUrl: string): OpenClawAdapter {
  throw new Error("OpenClaw adapter not yet implemented — using mock adapter.");
}
