import type { OpenClawAdapter } from "./types";
import { emptyAdapter } from "./empty.server";
import { recordFetch } from "../openclaw-telemetry.server";

// Real readonly OpenClaw adapter.
//
// Contract (per project spec):
//   - Carapace proxies every OpenClaw call server-side.
//   - On any failure (network, non-2xx, parse error, missing route) we
//     return an EMPTY result, never mock data. Pages render an honest
//     empty state.
//   - All write methods throw — readonly is observe-only.
//
// The OpenClaw HTTP surface is still being defined upstream. We probe a
// small set of conventional paths (/v1/...) and accept either a bare array
// or `{ items: [] }` shape. Anything else → empty.

async function safeGet(baseUrl: string, path: string, apiKey: string | null): Promise<unknown[]> {
  const url = `${baseUrl.replace(/\/$/, "")}${path}`;
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
    });
    const text = await res.text();
    const finishedAt = new Date().toISOString();
    const latencyMs = Date.now() - t0;
    recordFetch({
      url,
      ok: res.ok,
      status: res.status,
      startedAt,
      finishedAt,
      latencyMs,
      error: res.ok ? null : `HTTP ${res.status}`,
      rawPreview: text.slice(0, 512),
    });
    if (!res.ok) return [];
    let json: unknown;
    try { json = JSON.parse(text); } catch { return []; }
    if (Array.isArray(json)) return json;
    if (json && typeof json === "object" && Array.isArray((json as { items?: unknown[] }).items)) {
      return (json as { items: unknown[] }).items;
    }
    return [];
  } catch (err) {
    recordFetch({
      url,
      ok: false,
      status: null,
      startedAt,
      finishedAt: new Date().toISOString(),
      latencyMs: Date.now() - t0,
      error: err instanceof Error ? err.message : String(err),
      rawPreview: null,
    });
    return [];
  }
}

const READ_DISABLED = (label: string) => () => {
  throw new Error(`${label} is disabled — readonly mode (writes blocked)`);
};

export function createOpenClawAdapter(baseUrl: string, apiKey: string | null = null): OpenClawAdapter {
  return {
    async health() {
      const url = `${baseUrl.replace(/\/$/, "")}/v1/health`;
      const t0 = Date.now();
      try {
        const res = await fetch(url, {
          headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
        });
        const text = await res.text();
        const latencyMs = Date.now() - t0;
        recordFetch({
          url, ok: res.ok, status: res.status,
          startedAt: new Date(Date.now() - latencyMs).toISOString(),
          finishedAt: new Date().toISOString(),
          latencyMs,
          error: res.ok ? null : `HTTP ${res.status}`,
          rawPreview: text.slice(0, 512),
        });
        return { ok: res.ok, baseUrl, latencyMs };
      } catch (err) {
        const latencyMs = Date.now() - t0;
        recordFetch({
          url, ok: false, status: null,
          startedAt: new Date(Date.now() - latencyMs).toISOString(),
          finishedAt: new Date().toISOString(),
          latencyMs,
          error: err instanceof Error ? err.message : String(err),
          rawPreview: null,
        });
        return { ok: false, baseUrl, latencyMs };
      }
    },

    async listAgents() {
      return safeGet(baseUrl, "/v1/agents", apiKey) as Promise<ReturnType<OpenClawAdapter["listAgents"]> extends Promise<infer R> ? R : never>;
    },
    async getAgent(id) {
      const list = (await safeGet(baseUrl, "/v1/agents", apiKey)) as Array<{ id?: string }>;
      return (list.find((a) => a?.id === id) as Awaited<ReturnType<OpenClawAdapter["getAgent"]>>) ?? null;
    },
    async listTasks() {
      return safeGet(baseUrl, "/v1/tasks", apiKey) as Promise<ReturnType<OpenClawAdapter["listTasks"]> extends Promise<infer R> ? R : never>;
    },
    updateTaskStatus: READ_DISABLED("updateTaskStatus"),
    async listSnapshots() {
      return safeGet(baseUrl, "/v1/snapshots", apiKey) as Promise<ReturnType<OpenClawAdapter["listSnapshots"]> extends Promise<infer R> ? R : never>;
    },
    async listConversations() {
      return safeGet(baseUrl, "/v1/conversations", apiKey) as Promise<ReturnType<OpenClawAdapter["listConversations"]> extends Promise<infer R> ? R : never>;
    },
    async listApprovals() {
      return safeGet(baseUrl, "/v1/approvals", apiKey) as Promise<ReturnType<OpenClawAdapter["listApprovals"]> extends Promise<infer R> ? R : never>;
    },
    resolveApproval: READ_DISABLED("resolveApproval"),
    async listProviders() {
      return safeGet(baseUrl, "/v1/providers", apiKey) as Promise<ReturnType<OpenClawAdapter["listProviders"]> extends Promise<infer R> ? R : never>;
    },
    async recentLogs(limit = 80) {
      const items = await safeGet(baseUrl, `/v1/logs?limit=${limit}`, apiKey);
      return items as Awaited<ReturnType<OpenClawAdapter["recentLogs"]>>;
    },

    // Config bridge — readable in readonly mode (no write side effects).
    async listAgentsFromConfig() {
      const items = await safeGet(baseUrl, "/v1/config/agents", apiKey);
      return { source: "openclaw" as const, agents: items as Awaited<ReturnType<OpenClawAdapter["listAgentsFromConfig"]>>["agents"] };
    },
    // Alias edits live in Carapace's local store — they don't touch OpenClaw.
    async updateAgentAlias() {
      return { ok: true } as const;
    },
    backupOpenClawConfig: READ_DISABLED("backupOpenClawConfig"),
    async validateOpenClawConfig() {
      return { ok: false, errors: ["readonly mode — config writes disabled"], warnings: [] };
    },
    writeOpenClawConfig: READ_DISABLED("writeOpenClawConfig"),

    // Memory + snapshot reads
    async listMemorySources() {
      return safeGet(baseUrl, "/v1/memory/sources", apiKey) as Promise<ReturnType<OpenClawAdapter["listMemorySources"]> extends Promise<infer R> ? R : never>;
    },
    async searchMemory(query, opts) {
      // No POST in readonly — fall back to empty.
      return emptyAdapter.searchMemory(query, opts);
    },
    createSnapshot: READ_DISABLED("createSnapshot"),
    updateSnapshot: READ_DISABLED("updateSnapshot"),
    createMemoryWriteCandidate: READ_DISABLED("createMemoryWriteCandidate"),
    approveMemoryWrite: READ_DISABLED("approveMemoryWrite"),
  };
}
