// ─────────────────────────────────────────────────────────────────────────────
// OpenClaw server functions — god-mode control plane.
//
// IMPORTANT: This file is imported by client code.
// NEVER statically import from ./*.server or ./adapters/*.server here.
// Always dynamic-import inside the handler body.
// ─────────────────────────────────────────────────────────────────────────────

import { createServerFn } from "@tanstack/react-start";
import type { TaskStatus, Snapshot } from "@/lib/mock-data";
import type { WriteLayer } from "@/lib/memory-store";

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

async function loadCore() {
  const mod = await import("@/server/openclaw.server");
  const fs = await import("@/server/adapters/filesystem.server");
  return { ...mod, getOpenClawRootPath: fs.getOpenClawRootPath };
}

// ── Health & status ───────────────────────────────────────────────────────────

export const ocHealth = createServerFn({ method: "GET" }).handler(async () => {
  const { getAdapter, getOpenClawBaseUrl } = await loadCore();
  const h = await getAdapter().health();
  return { ...h, configuredBaseUrl: getOpenClawBaseUrl() };
});

export const ocStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { getAdapter, getOpenClawBaseUrl, getOpenClawMode, getLastFetch, getOpenClawRootPath } = await loadCore();
  const mode = getOpenClawMode();
  const root = getOpenClawRootPath();
  const baseUrl = root ? `file://${root}` : getOpenClawBaseUrl();
  const gatewayTokenConfigured = Boolean(process.env.OPENCLAW_GATEWAY_TOKEN);
  let connection: "mock" | "connected" | "unreachable" | "no-data" = "mock";
  let lastError: string | null = null;
  if (mode === "mock") {
    connection = "mock";
  } else {
    try {
      const h = await getAdapter().health();
      connection = h.ok ? "connected" : "unreachable";
    } catch (err) {
      connection = "unreachable";
      lastError = err instanceof Error ? err.message : String(err);
    }
  }
  return { mode, baseUrl, rootPath: root, gatewayTokenConfigured, connection, lastError, lastFetch: getLastFetch() };
});

export const ocGatewayHealth = createServerFn({ method: "GET" }).handler(async () => {
  const { getAdapter } = await loadCore();
  return getAdapter().getGatewayHealth();
});

export const ocGatewayStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { getAdapter } = await loadCore();
  return getAdapter().getGatewayStatus();
});

export const ocSystemPresence = createServerFn({ method: "GET" }).handler(async () => {
  const { getAdapter } = await loadCore();
  return getAdapter().getSystemPresence();
});

// ── Legacy compat ─────────────────────────────────────────────────────────────

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

// ── Sessions & chat ───────────────────────────────────────────────────────────

export const ocListGwSessions = createServerFn({ method: "GET" }).handler(async () => {
  const { getAdapter } = await loadCore();
  return getAdapter().listGwSessions();
});

export const ocGetGwSession = createServerFn({ method: "GET" })
  .inputValidator((data: { key: string }) => data)
  .handler(async ({ data }) => {
    const { getAdapter } = await loadCore();
    return getAdapter().getGwSession(data.key);
  });

export const ocPreviewSession = createServerFn({ method: "GET" })
  .inputValidator((data: { key: string }) => data)
  .handler(async ({ data }) => {
    const { getAdapter } = await loadCore();
    return getAdapter().previewSession(data.key);
  });

export const ocDescribeSession = createServerFn({ method: "GET" })
  .inputValidator((data: { key: string }) => data)
  .handler(async ({ data }) => {
    const { getAdapter } = await loadCore();
    return getAdapter().describeSession(data.key);
  });

export const ocCreateSession = createServerFn({ method: "POST" })
  .inputValidator((data: { agentId: string; channel?: string; title?: string; metadata?: Record<string, unknown> }) => data)
  .handler(async ({ data }) => {
    const { getAdapter } = await loadCore();
    return getAdapter().createSession(data);
  });

export const ocSendToSession = createServerFn({ method: "POST" })
  .inputValidator((data: { key: string; message: string }) => data)
  .handler(async ({ data }) => {
    const { getAdapter } = await loadCore();
    return getAdapter().sendToSession(data.key, data.message);
  });

export const ocSteerSession = createServerFn({ method: "POST" })
  .inputValidator((data: { key: string; message: string }) => data)
  .handler(async ({ data }) => {
    const { getAdapter } = await loadCore();
    return getAdapter().steerSession(data.key, data.message);
  });

export const ocAbortSession = createServerFn({ method: "POST" })
  .inputValidator((data: { key: string }) => data)
  .handler(async ({ data }) => {
    const { getAdapter } = await loadCore();
    return getAdapter().abortSession(data.key);
  });

export const ocPatchSession = createServerFn({ method: "POST" })
  .inputValidator((data: { key: string; patch: Record<string, unknown> }) => data)
  .handler(async ({ data }) => {
    const { getAdapter } = await loadCore();
    return getAdapter().patchSession(data.key, data.patch);
  });

export const ocResetSession = createServerFn({ method: "POST" })
  .inputValidator((data: { key: string }) => data)
  .handler(async ({ data }) => {
    const { getAdapter } = await loadCore();
    return getAdapter().resetSession(data.key);
  });

export const ocDeleteSession = createServerFn({ method: "POST" })
  .inputValidator((data: { key: string }) => data)
  .handler(async ({ data }) => {
    const { getAdapter } = await loadCore();
    return getAdapter().deleteSession(data.key);
  });

export const ocCompactSession = createServerFn({ method: "POST" })
  .inputValidator((data: { key: string }) => data)
  .handler(async ({ data }) => {
    const { getAdapter } = await loadCore();
    return getAdapter().compactSession(data.key);
  });

export const ocGetChatHistory = createServerFn({ method: "GET" })
  .inputValidator((data: { key: string; limit?: number; cursor?: string }) => data)
  .handler(async ({ data }) => {
    const { getAdapter } = await loadCore();
    return getAdapter().getChatHistory(data.key, { limit: data.limit, cursor: data.cursor });
  });

export const ocSendChat = createServerFn({ method: "POST" })
  .inputValidator((data: { key: string; message: string }) => data)
  .handler(async ({ data }) => {
    const { getAdapter } = await loadCore();
    return getAdapter().sendChat(data.key, data.message);
  });

export const ocAbortChat = createServerFn({ method: "POST" })
  .inputValidator((data: { key: string }) => data)
  .handler(async ({ data }) => {
    const { getAdapter } = await loadCore();
    return getAdapter().abortChat(data.key);
  });

export const ocInjectChat = createServerFn({ method: "POST" })
  .inputValidator((data: { key: string; message: string; role?: string }) => data)
  .handler(async ({ data }) => {
    const { getAdapter } = await loadCore();
    return getAdapter().injectChat(data.key, data.message, data.role);
  });

// ── Agent management ──────────────────────────────────────────────────────────

export const ocListGwAgents = createServerFn({ method: "GET" }).handler(async () => {
  const { getAdapter } = await loadCore();
  return getAdapter().listGwAgents();
});

export const ocGetGwAgent = createServerFn({ method: "GET" })
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const { getAdapter } = await loadCore();
    return getAdapter().getGwAgent(data.id);
  });

export const ocGetAgentIdentity = createServerFn({ method: "GET" })
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const { getAdapter } = await loadCore();
    return getAdapter().getAgentIdentity(data.id);
  });

export const ocCreateGwAgent = createServerFn({ method: "POST" })
  .inputValidator((data: {
    id?: string; name?: string; role?: string; model?: string; provider?: string;
    parentId?: string; workspacePath?: string; metadata?: Record<string, unknown>;
  }) => data)
  .handler(async ({ data }) => {
    const { getAdapter } = await loadCore();
    return getAdapter().createGwAgent(data);
  });

export const ocUpdateGwAgent = createServerFn({ method: "POST" })
  .inputValidator((data: {
    id: string; name?: string; role?: string; model?: string; provider?: string;
    parentId?: string; metadata?: Record<string, unknown>;
  }) => data)
  .handler(async ({ data }) => {
    const { id, ...params } = data;
    const { getAdapter } = await loadCore();
    return getAdapter().updateGwAgent(id, params);
  });

export const ocDeleteGwAgent = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const { getAdapter } = await loadCore();
    return getAdapter().deleteGwAgent(data.id);
  });

export const ocListAgentFiles = createServerFn({ method: "GET" })
  .inputValidator((data: { agentId: string }) => data)
  .handler(async ({ data }) => {
    const { getAdapter } = await loadCore();
    return getAdapter().listAgentFiles(data.agentId);
  });

export const ocGetAgentFile = createServerFn({ method: "GET" })
  .inputValidator((data: { agentId: string; path: string }) => data)
  .handler(async ({ data }) => {
    const { getAdapter } = await loadCore();
    return getAdapter().getAgentFile(data.agentId, data.path);
  });

export const ocSetAgentFile = createServerFn({ method: "POST" })
  .inputValidator((data: { agentId: string; path: string; content: string }) => data)
  .handler(async ({ data }) => {
    const { getAdapter } = await loadCore();
    return getAdapter().setAgentFile(data.agentId, data.path, data.content);
  });

// ── Config & gateway control ──────────────────────────────────────────────────

export const ocGetConfig = createServerFn({ method: "GET" }).handler(async () => {
  const { getAdapter } = await loadCore();
  return getAdapter().getConfig();
});

export const ocGetConfigSchema = createServerFn({ method: "GET" }).handler(async () => {
  const { getAdapter } = await loadCore();
  return getAdapter().getConfigSchema();
});

export const ocLookupConfigSchema = createServerFn({ method: "GET" })
  .inputValidator((data: { path: string }) => data)
  .handler(async ({ data }) => {
    const { getAdapter } = await loadCore();
    return getAdapter().lookupConfigSchema(data.path);
  });

export const ocPatchConfig = createServerFn({ method: "POST" })
  .inputValidator((data: { patch: Record<string, unknown> }) => data)
  .handler(async ({ data }) => {
    const { getAdapter } = await loadCore();
    return getAdapter().patchConfig(data.patch);
  });

export const ocApplyConfig = createServerFn({ method: "POST" }).handler(async () => {
  const { getAdapter } = await loadCore();
  return getAdapter().applyConfig();
});

export const ocBackupConfig = createServerFn({ method: "POST" }).handler(async () => {
  const { getAdapter } = await loadCore();
  return getAdapter().backupConfig();
});

export const ocValidateConfig = createServerFn({ method: "POST" })
  .inputValidator((data: { payload: string }) => data)
  .handler(async ({ data }) => {
    const { getAdapter } = await loadCore();
    return getAdapter().validateConfig(data.payload);
  });

export const ocWriteConfig = createServerFn({ method: "POST" })
  .inputValidator((data: { payload: string; operatorNote?: string }) => data)
  .handler(async ({ data }) => {
    const { getAdapter } = await loadCore();
    return getAdapter().writeConfig(data.payload, { operatorNote: data.operatorNote });
  });

export const ocGetUpdateStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { getAdapter } = await loadCore();
  return getAdapter().getUpdateStatus();
});

export const ocRunUpdate = createServerFn({ method: "POST" }).handler(async () => {
  const { getAdapter } = await loadCore();
  return getAdapter().runUpdate();
});

// ── Approvals ─────────────────────────────────────────────────────────────────

export const ocListExecApprovals = createServerFn({ method: "GET" }).handler(async () => {
  const { getAdapter } = await loadCore();
  return getAdapter().listExecApprovals();
});

export const ocGetExecApproval = createServerFn({ method: "GET" })
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const { getAdapter } = await loadCore();
    return getAdapter().getExecApproval(data.id);
  });

export const ocResolveExecApproval = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string; decision: "approve" | "deny" }) => data)
  .handler(async ({ data }) => {
    const { getAdapter } = await loadCore();
    return getAdapter().resolveExecApproval(data.id, data.decision);
  });

export const ocGetApprovalPolicy = createServerFn({ method: "GET" }).handler(async () => {
  const { getAdapter } = await loadCore();
  return getAdapter().getApprovalPolicy();
});

export const ocSetApprovalPolicy = createServerFn({ method: "POST" })
  .inputValidator((data: { autoApprove?: string[]; autoDeny?: string[]; requireApproval?: string[] }) => data)
  .handler(async ({ data }) => {
    const { getAdapter } = await loadCore();
    return getAdapter().setApprovalPolicy(data);
  });

export const ocListPluginApprovals = createServerFn({ method: "GET" }).handler(async () => {
  const { getAdapter } = await loadCore();
  return getAdapter().listPluginApprovals();
});

export const ocResolvePluginApproval = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string; decision: "approve" | "deny" }) => data)
  .handler(async ({ data }) => {
    const { getAdapter } = await loadCore();
    return getAdapter().resolvePluginApproval(data.id, data.decision);
  });

// ── Cron / Automation ─────────────────────────────────────────────────────────

export const ocGetCronStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { getAdapter } = await loadCore();
  return getAdapter().getCronStatus();
});

export const ocListCronJobs = createServerFn({ method: "GET" }).handler(async () => {
  const { getAdapter } = await loadCore();
  return getAdapter().listCronJobs();
});

export const ocAddCronJob = createServerFn({ method: "POST" })
  .inputValidator((data: { name?: string; schedule: string; agentId: string; message: string; enabled?: boolean }) => data)
  .handler(async ({ data }) => {
    const { getAdapter } = await loadCore();
    return getAdapter().addCronJob(data);
  });

export const ocUpdateCronJob = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string; name?: string; schedule?: string; message?: string; enabled?: boolean }) => data)
  .handler(async ({ data }) => {
    const { id, ...params } = data;
    const { getAdapter } = await loadCore();
    return getAdapter().updateCronJob(id, params);
  });

export const ocRemoveCronJob = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const { getAdapter } = await loadCore();
    return getAdapter().removeCronJob(data.id);
  });

export const ocRunCronJob = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const { getAdapter } = await loadCore();
    return getAdapter().runCronJob(data.id);
  });

export const ocGetCronRuns = createServerFn({ method: "GET" })
  .inputValidator((data: { id: string; limit?: number }) => data)
  .handler(async ({ data }) => {
    const { getAdapter } = await loadCore();
    return getAdapter().getCronRuns(data.id, data.limit);
  });

export const ocWake = createServerFn({ method: "POST" })
  .inputValidator((data: { agentId: string; message: string; atMs: number }) => data)
  .handler(async ({ data }) => {
    const { getAdapter } = await loadCore();
    return getAdapter().wake(data);
  });

// ── Node fleet ────────────────────────────────────────────────────────────────

export const ocListNodes = createServerFn({ method: "GET" }).handler(async () => {
  const { getAdapter } = await loadCore();
  return getAdapter().listNodes();
});

export const ocDescribeNode = createServerFn({ method: "GET" })
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const { getAdapter } = await loadCore();
    return getAdapter().describeNode(data.id);
  });

export const ocRenameNode = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string; name: string }) => data)
  .handler(async ({ data }) => {
    const { getAdapter } = await loadCore();
    return getAdapter().renameNode(data.id, data.name);
  });

export const ocInvokeNode = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string; method: string; params?: unknown }) => data)
  .handler(async ({ data }) => {
    const { getAdapter } = await loadCore();
    return getAdapter().invokeNode(data.id, data.method, data.params);
  });

// ── Models / Usage / Providers ────────────────────────────────────────────────

export const ocListGwModels = createServerFn({ method: "GET" }).handler(async () => {
  const { getAdapter } = await loadCore();
  return getAdapter().listGwModels();
});

export const ocGetUsageStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { getAdapter } = await loadCore();
  return getAdapter().getUsageStatus();
});

export const ocGetUsageCost = createServerFn({ method: "GET" })
  .inputValidator((data: { period?: string; agentId?: string }) => data)
  .handler(async ({ data }) => {
    const { getAdapter } = await loadCore();
    return getAdapter().getUsageCost(data);
  });

export const ocGetChannelsStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { getAdapter } = await loadCore();
  return getAdapter().getChannelsStatus();
});

export const ocGetTtsStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { getAdapter } = await loadCore();
  return getAdapter().getTtsStatus();
});

export const ocListTtsProviders = createServerFn({ method: "GET" }).handler(async () => {
  const { getAdapter } = await loadCore();
  return getAdapter().listTtsProviders();
});

export const ocSetTtsProvider = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const { getAdapter } = await loadCore();
    return getAdapter().setTtsProvider(data.id);
  });

export const ocSetTalkMode = createServerFn({ method: "POST" })
  .inputValidator((data: { mode: string }) => data)
  .handler(async ({ data }) => {
    const { getAdapter } = await loadCore();
    return getAdapter().setTalkMode(data.mode);
  });

// ── Tools ─────────────────────────────────────────────────────────────────────

export const ocGetToolsCatalog = createServerFn({ method: "GET" }).handler(async () => {
  const { getAdapter } = await loadCore();
  return getAdapter().getToolsCatalog();
});

export const ocGetEffectiveTools = createServerFn({ method: "GET" })
  .inputValidator((data: { agentId?: string }) => data)
  .handler(async ({ data }) => {
    const { getAdapter } = await loadCore();
    return getAdapter().getEffectiveTools(data.agentId);
  });

export const ocInvokeTool = createServerFn({ method: "POST" })
  .inputValidator((data: { tool: string; params: Record<string, unknown> }) => data)
  .handler(async ({ data }) => {
    const { getAdapter } = await loadCore();
    return getAdapter().invokeTool(data.tool, data.params);
  });

// ── Agent registry / config bridge ────────────────────────────────────────────

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

// ── Memory + snapshots ────────────────────────────────────────────────────────

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
