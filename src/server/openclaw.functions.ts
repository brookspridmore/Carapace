import { createServerFn } from "@tanstack/react-start";
import {
  getAdapter,
  getOpenClawBaseUrl,
  getOpenClawMode,
  getLastFetch,
} from "./openclaw.server";
import type { TaskStatus, Snapshot } from "@/lib/mock-data";
import type { AgentAliasInput } from "./adapters/types";
import type { WriteLayer } from "@/lib/memory-store";

export const ocHealth = createServerFn({ method: "GET" }).handler(async () => {
  const adapter = getAdapter();
  const base = getOpenClawBaseUrl();
  const h = await adapter.health();
  return { ...h, configuredBaseUrl: base };
});

// Lightweight status endpoint for the AppShell indicator + Settings debug
// panel. Never throws — even if OpenClaw is unreachable.
export const ocStatus = createServerFn({ method: "GET" }).handler(async () => {
  const mode = getOpenClawMode();
  const baseUrl = getOpenClawBaseUrl();
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
        // Probe agents to distinguish connected-but-empty from connected.
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
    apiKeyConfigured,
    connection,
    lastError,
    lastFetch: getLastFetch(),
  };
});

export const ocListAgents = createServerFn({ method: "GET" }).handler(async () => {
  return getAdapter().listAgents();
});

export const ocListTasks = createServerFn({ method: "GET" }).handler(async () => {
  return getAdapter().listTasks();
});

export const ocUpdateTaskStatus = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string; status: TaskStatus }) => data)
  .handler(async ({ data }) => {
    return getAdapter().updateTaskStatus(data.id, data.status);
  });

export const ocListSnapshots = createServerFn({ method: "GET" }).handler(async () => {
  return getAdapter().listSnapshots();
});

export const ocListConversations = createServerFn({ method: "GET" }).handler(async () => {
  return getAdapter().listConversations();
});

export const ocListApprovals = createServerFn({ method: "GET" }).handler(async () => {
  return getAdapter().listApprovals();
});

export const ocResolveApproval = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string; decision: "approve" | "deny" }) => data)
  .handler(async ({ data }) => {
    return getAdapter().resolveApproval(data.id, data.decision);
  });

export const ocListProviders = createServerFn({ method: "GET" }).handler(async () => {
  return getAdapter().listProviders();
});

export const ocRecentLogs = createServerFn({ method: "GET" }).handler(async () => {
  return getAdapter().recentLogs(80);
});

// ---- Agent registry / OpenClaw config bridge --------------------------------

export const ocListAgentsFromConfig = createServerFn({ method: "GET" }).handler(async () => {
  return getAdapter().listAgentsFromConfig();
});

export const ocUpdateAgentAlias = createServerFn({ method: "POST" })
  .inputValidator((data: AgentAliasInput) => data)
  .handler(async ({ data }) => {
    return getAdapter().updateAgentAlias(data);
  });

export const ocBackupOpenClawConfig = createServerFn({ method: "POST" }).handler(async () => {
  return getAdapter().backupOpenClawConfig();
});

export const ocValidateOpenClawConfig = createServerFn({ method: "POST" })
  .inputValidator((data: { payload: string }) => data)
  .handler(async ({ data }) => {
    return getAdapter().validateOpenClawConfig(data.payload);
  });

export const ocWriteOpenClawConfig = createServerFn({ method: "POST" })
  .inputValidator((data: { payload: string; rawIds: string[]; operatorNote?: string }) => data)
  .handler(async ({ data }) => {
    return getAdapter().writeOpenClawConfig(data.payload, { rawIds: data.rawIds, operatorNote: data.operatorNote });
  });

// ---- Memory + snapshot bridge ---------------------------------------------

export const ocListMemorySources = createServerFn({ method: "GET" }).handler(async () => {
  return getAdapter().listMemorySources();
});

export const ocSearchMemory = createServerFn({ method: "POST" })
  .inputValidator((data: { query: string; topK?: number }) => data)
  .handler(async ({ data }) => {
    return getAdapter().searchMemory(data.query, { topK: data.topK });
  });

export const ocCreateSnapshot = createServerFn({ method: "POST" })
  .inputValidator((data: Omit<Snapshot, "createdAt" | "updatedAt">) => data)
  .handler(async ({ data }) => {
    return getAdapter().createSnapshot(data);
  });

export const ocUpdateSnapshot = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string; patch: Partial<Snapshot> }) => data)
  .handler(async ({ data }) => {
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
    return getAdapter().createMemoryWriteCandidate(data);
  });

export const ocApproveMemoryWrite = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string; decision: "approve" | "reject"; overrideText?: string }) => data)
  .handler(async ({ data }) => {
    return getAdapter().approveMemoryWrite(data.id, data.decision, data.overrideText);
  });
