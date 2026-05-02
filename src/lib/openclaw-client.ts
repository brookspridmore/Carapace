// Client-safe wrapper around OpenClaw server functions.
//
// Architecture rule: client code (src/lib, src/components, src/routes, src/hooks)
// must NEVER import from src/server/* directly. Everything goes through this
// module. This file is the ONE permitted bridge — it re-exports the RPC stubs
// produced by createServerFn so the rest of the app talks to a stable,
// client-shaped API surface.
//
// The TanStack server-fn Vite plugin replaces the handler bodies with fetch
// stubs in the client bundle, so importing them here is safe.

import {
  ocStatus,
  ocHealth,
  ocListAgents,
  ocListTasks,
  ocUpdateTaskStatus,
  ocListSnapshots,
  ocListConversations,
  ocListApprovals,
  ocResolveApproval,
  ocListProviders,
  ocRecentLogs,
  ocListAgentsFromConfig,
  ocUpdateAgentAlias,
  ocBackupOpenClawConfig,
  ocValidateOpenClawConfig,
  ocWriteOpenClawConfig,
  ocListMemorySources,
  ocSearchMemory,
  ocCreateSnapshot,
  ocUpdateSnapshot,
  ocCreateMemoryWriteCandidate,
  ocApproveMemoryWrite,
} from "@/server/openclaw.functions";
import { ocFilesystemDiagnostics } from "@/server/openclaw-diagnostics.functions";

// ---- Status ----------------------------------------------------------------

export async function getOpenClawStatus() {
  return ocStatus();
}

export async function getOpenClawHealth() {
  return ocHealth();
}

// ---- Generic re-exports ----------------------------------------------------
// Keep call-site code small: client files import the wrappers below instead
// of touching createServerFn outputs directly.

export const listAgents = () => ocListAgents();
export const listTasks = () => ocListTasks();
export const updateTaskStatus = (data: Parameters<typeof ocUpdateTaskStatus>[0]["data"]) =>
  ocUpdateTaskStatus({ data });
export const listSnapshots = () => ocListSnapshots();
export const listConversations = () => ocListConversations();
export const listApprovals = () => ocListApprovals();
export const resolveApproval = (data: Parameters<typeof ocResolveApproval>[0]["data"]) =>
  ocResolveApproval({ data });
export const listProviders = () => ocListProviders();
export const recentLogs = () => ocRecentLogs();

// ---- Agent registry / config bridge ----------------------------------------

export const listAgentsFromConfig = () => ocListAgentsFromConfig();
export const updateAgentAlias = (data: Parameters<typeof ocUpdateAgentAlias>[0]["data"]) =>
  ocUpdateAgentAlias({ data });
export const backupOpenClawConfig = () => ocBackupOpenClawConfig();
export const validateOpenClawConfig = (data: Parameters<typeof ocValidateOpenClawConfig>[0]["data"]) =>
  ocValidateOpenClawConfig({ data });
export const writeOpenClawConfig = (data: Parameters<typeof ocWriteOpenClawConfig>[0]["data"]) =>
  ocWriteOpenClawConfig({ data });

// ---- Memory + snapshot bridge ---------------------------------------------

export const listMemorySources = () => ocListMemorySources();
export const searchMemory = (data: Parameters<typeof ocSearchMemory>[0]["data"]) =>
  ocSearchMemory({ data });
export const createSnapshot = (data: Parameters<typeof ocCreateSnapshot>[0]["data"]) =>
  ocCreateSnapshot({ data });
export const updateSnapshot = (data: Parameters<typeof ocUpdateSnapshot>[0]["data"]) =>
  ocUpdateSnapshot({ data });
export const createMemoryWriteCandidate = (
  data: Parameters<typeof ocCreateMemoryWriteCandidate>[0]["data"],
) => ocCreateMemoryWriteCandidate({ data });
export const approveMemoryWrite = (data: Parameters<typeof ocApproveMemoryWrite>[0]["data"]) =>
  ocApproveMemoryWrite({ data });

// ---- Filesystem diagnostics ------------------------------------------------

export const getFilesystemDiagnostics = () => ocFilesystemDiagnostics();

// Re-export client-safe diagnostic types so callers don't reach into /server.
export type {
  FsDiagnosticsReport,
  FsItem,
  FsItemKind,
} from "@/lib/openclaw-diagnostics-types";
