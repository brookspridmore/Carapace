// Client-safe wrapper around OpenClaw server functions.
//
// Architecture rule: client code (src/lib, src/components, src/routes,
// src/hooks) must NEVER import from src/server/* directly. This module is
// the ONE permitted bridge — it re-exports the RPC stubs produced by
// createServerFn so the rest of the app talks to a stable client surface.
//
// The TanStack server-fn Vite plugin replaces handler bodies with fetch
// stubs in the client bundle, so re-exporting them here is safe.

export {
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
} from "@/rpc/openclaw.functions";

export { ocFilesystemDiagnostics } from "@/rpc/openclaw-diagnostics.functions";

// Re-export client-safe diagnostic types so callers don't reach into /server.
export type {
  FsDiagnosticsReport,
  FsItem,
  FsItemKind,
} from "@/lib/openclaw-diagnostics-types";

import { ocStatus } from "@/rpc/openclaw.functions";

// Convenience helper used by useOpenClawStatus.
export async function getOpenClawStatus() {
  return ocStatus();
}
