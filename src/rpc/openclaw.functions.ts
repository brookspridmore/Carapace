import { createServerFn } from "@tanstack/react-start";
import type { TaskStatus, Snapshot } from "@/lib/mock-data";
import type { WriteLayer } from "@/lib/memory-store";

// Client-safe shape mirror of src/server/adapters/types.ts → AgentAliasInput.
// Duplicated here so this file has zero references into src/server/*.
type AgentAliasInput = {
  rawOpenClawId: string;
  friendlyName: string;
  role?: string;
  parentRawOpenClawId?: string;
  workspacePath?: string;
  memoryPath?: string;
  notes?: string;
  tags?: string[];
};

// IMPORTANT: This file is imported by client code (routes, components, hooks)
// to obtain the RPC stubs. The TanStack server-fn transformer strips handler
// bodies from the client bundle, BUT static top-level imports of `.server.ts`
// modules still leak into the client and trip Vite's import-protection guard
// (because they pull in node:fs, etc.).
//
// Rule: NEVER statically import from `./*.server` or `./adapters/*.server` here.
// Always dynamic-import inside the handler.

async function loadCore() {
  const mod = await import("@/server/openclaw.server");
  const fs = await import("@/server/adapters/filesystem.server");
  return { ...mod, getOpenClawRootPath: fs.getOpenClawRootPath };
}

export const ocHealth = createServerFn({ method: "GET" }).handler(async () => {
  const { getAdapter, getOpenClawBaseUrl } = await loadCore();
  const h = await getAdapter().health();
  return { ...h, configuredBaseUrl: getOpenClawBaseUrl() };
});

// Lightweight status endpoint for the AppShell indicator + Settings debug
// panel. Never throws — even if OpenClaw is unreachable.
export const ocStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { getAdapter, getOpenClawBaseUrl, getOpenClawMode, getLastFetch, getOpenClawRootPath } = await loadCore();
  const mode = getOpenClawMode();
  const root = getOpenClawRootPath();
  const baseUrl = root ? `file://${root}` : getOpenClawBaseUrl();
  const apiKeyConfigured = Boolean(process.env.OPENCLAW_API_KEY);
  let connection: "mock" | "connected" | "unreachable" | "no-data" = "mock";
  let lastError: string | null = null;

  if (mode === "mock") {
    connection = "mock";
  } else {
    try {
      const h = await getAdapter().health();
      if (!h.ok) {
        connection = "unreachable";
      } else {
        const agents = await getAdapter().listAgents();
        connection = agents.length > 0 ? "connected" : "no-data";
      }
    } catch (err) {
      connection = "unreachable";
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  return {
    mode,
    baseUrl,
    rootPath: root,
    apiKeyConfigured,
    connection,
    lastError,
    lastFetch: getLastFetch(),
  };
});

export const ocListAgents = createServerFn({ method: "GET" }).handler(async () => {
  const { getAdapter } = await loadCore();
  return getAdapter().listAgents();
});

export const ocListTasks = createServerFn({ method: "GET" }).handler(async () => {
  const { getAdapter } = await loadCore();
  return getAdapter().listTasks();
});

export const ocUpdateTaskStatus = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string; status: TaskStatus }) => data)
  .handler(async ({ data }) => {
    const { getAdapter } = await loadCore();
    return getAdapter().updateTaskStatus(data.id, data.status);
  });

export const ocListSnapshots = createServerFn({ method: "GET" }).handler(async () => {
  const { getAdapter } = await loadCore();
  return getAdapter().listSnapshots();
});

export const ocListConversations = createServerFn({ method: "GET" }).handler(async () => {
  const { getAdapter } = await loadCore();
  return getAdapter().listConversations();
});

export const ocListApprovals = createServerFn({ method: "GET" }).handler(async () => {
  const { getAdapter } = await loadCore();
  return getAdapter().listApprovals();
});

export const ocResolveApproval = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string; decision: "approve" | "deny" }) => data)
  .handler(async ({ data }) => {
    const { getAdapter } = await loadCore();
    return getAdapter().resolveApproval(data.id, data.decision);
  });

export const ocListProviders = createServerFn({ method: "GET" }).handler(async () => {
  const { getAdapter } = await loadCore();
  return getAdapter().listProviders();
});

export const ocRecentLogs = createServerFn({ method: "GET" }).handler(async () => {
  const { getAdapter } = await loadCore();
  return getAdapter().recentLogs(80);
});

// ---- Agent registry / OpenClaw config bridge --------------------------------

export const ocListAgentsFromConfig = createServerFn({ method: "GET" }).handler(async () => {
  const { getAdapter } = await loadCore();
  return getAdapter().listAgentsFromConfig();
});

export const ocUpdateAgentAlias = createServerFn({ method: "POST" })
  .inputValidator((data: AgentAliasInput) => data)
  .handler(async ({ data }) => {
    const { getAdapter } = await loadCore();
    return getAdapter().updateAgentAlias(data);
  });

export const ocBackupOpenClawConfig = createServerFn({ method: "POST" }).handler(async () => {
  const { getAdapter } = await loadCore();
  return getAdapter().backupOpenClawConfig();
});

export const ocValidateOpenClawConfig = createServerFn({ method: "POST" })
  .inputValidator((data: { payload: string }) => data)
  .handler(async ({ data }) => {
    const { getAdapter } = await loadCore();
    return getAdapter().validateOpenClawConfig(data.payload);
  });

export const ocWriteOpenClawConfig = createServerFn({ method: "POST" })
  .inputValidator((data: { payload: string; rawIds: string[]; operatorNote?: string }) => data)
  .handler(async ({ data }) => {
    const { getAdapter } = await loadCore();
    return getAdapter().writeOpenClawConfig(data.payload, { rawIds: data.rawIds, operatorNote: data.operatorNote });
  });

// ---- Memory + snapshot bridge ---------------------------------------------

export const ocListMemorySources = createServerFn({ method: "GET" }).handler(async () => {
  const { getAdapter } = await loadCore();
  return getAdapter().listMemorySources();
});

export const ocSearchMemory = createServerFn({ method: "POST" })
  .inputValidator((data: { query: string; topK?: number }) => data)
  .handler(async ({ data }) => {
    const { getAdapter } = await loadCore();
    return getAdapter().searchMemory(data.query, { topK: data.topK });
  });

export const ocCreateSnapshot = createServerFn({ method: "POST" })
  .inputValidator((data: Omit<Snapshot, "createdAt" | "updatedAt">) => data)
  .handler(async ({ data }) => {
    const { getAdapter } = await loadCore();
    return getAdapter().createSnapshot(data);
  });

export const ocUpdateSnapshot = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string; patch: Partial<Snapshot> }) => data)
  .handler(async ({ data }) => {
    const { getAdapter } = await loadCore();
    return getAdapter().updateSnapshot(data.id, data.patch);
  });

export const ocCreateMemoryWriteCandidate = createServerFn({ method: "POST" })
  .inputValidator((data: {
    proposedMemory: string;
    sourceTaskId?: string;
    sourceAgentId?: string;
    targetLayer: WriteLayer;
    reason: string;
    confidence: number;
  }) => data)
  .handler(async ({ data }) => {
    const { getAdapter } = await loadCore();
    return getAdapter().createMemoryWriteCandidate(data);
  });

export const ocApproveMemoryWrite = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string; decision: "approve" | "reject"; overrideText?: string }) => data)
  .handler(async ({ data }) => {
    const { getAdapter } = await loadCore();
    return getAdapter().approveMemoryWrite(data.id, data.decision, data.overrideText);
  });
