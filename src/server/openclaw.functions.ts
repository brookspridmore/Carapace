import { createServerFn } from "@tanstack/react-start";
import { getAdapter, getOpenClawBaseUrl } from "./openclaw.server";
import type { TaskStatus } from "@/lib/mock-data";
import type { AgentAliasInput } from "./adapters/types";

export const ocHealth = createServerFn({ method: "GET" }).handler(async () => {
  const adapter = getAdapter();
  const base = getOpenClawBaseUrl();
  const h = await adapter.health();
  return { ...h, configuredBaseUrl: base };
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
