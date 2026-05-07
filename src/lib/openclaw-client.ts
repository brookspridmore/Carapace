// ─────────────────────────────────────────────────────────────────────────────
// Client-safe wrapper around all OpenClaw server functions.
//
// Architecture rule: client code (src/lib, src/components, src/routes,
// src/hooks) must NEVER import from src/server/* directly. This module is
// the ONE permitted bridge — it re-exports the RPC stubs from createServerFn
// so the rest of the app talks to a stable client surface.
// ─────────────────────────────────────────────────────────────────────────────

// ── Health & status ───────────────────────────────────────────────────────────
export {
  ocStatus,
  ocHealth,
  ocGatewayHealth,
  ocGatewayStatus,
  ocSystemPresence,
} from "@/rpc/openclaw.functions";

// ── Legacy compat ──────────────────────────────────────────────────────────────
export {
  ocListAgents,
  ocListTasks,
  ocUpdateTaskStatus,
  ocListSnapshots,
  ocListConversations,
  ocListApprovals,
  ocResolveApproval,
  ocListProviders,
  ocRecentLogs,
} from "@/rpc/openclaw.functions";

// ── Sessions & chat ────────────────────────────────────────────────────────────
export {
  ocListGwSessions,
  ocGetGwSession,
  ocPreviewSession,
  ocDescribeSession,
  ocCreateSession,
  ocSendToSession,
  ocSteerSession,
  ocAbortSession,
  ocPatchSession,
  ocResetSession,
  ocDeleteSession,
  ocCompactSession,
  ocGetChatHistory,
  ocSendChat,
  ocAbortChat,
  ocInjectChat,
} from "@/rpc/openclaw.functions";

// ── Agent management ───────────────────────────────────────────────────────────
export {
  ocListGwAgents,
  ocGetGwAgent,
  ocGetAgentIdentity,
  ocCreateGwAgent,
  ocUpdateGwAgent,
  ocDeleteGwAgent,
  ocListAgentFiles,
  ocGetAgentFile,
  ocSetAgentFile,
} from "@/rpc/openclaw.functions";

// ── Config & gateway control ───────────────────────────────────────────────────
export {
  ocGetConfig,
  ocGetConfigSchema,
  ocLookupConfigSchema,
  ocPatchConfig,
  ocApplyConfig,
  ocBackupConfig,
  ocValidateConfig,
  ocWriteConfig,
  ocGetUpdateStatus,
  ocRunUpdate,
} from "@/rpc/openclaw.functions";

// ── Approvals ──────────────────────────────────────────────────────────────────
export {
  ocListExecApprovals,
  ocGetExecApproval,
  ocResolveExecApproval,
  ocGetApprovalPolicy,
  ocSetApprovalPolicy,
  ocListPluginApprovals,
  ocResolvePluginApproval,
} from "@/rpc/openclaw.functions";

// ── Cron / Automation ──────────────────────────────────────────────────────────
export {
  ocGetCronStatus,
  ocListCronJobs,
  ocAddCronJob,
  ocUpdateCronJob,
  ocRemoveCronJob,
  ocRunCronJob,
  ocGetCronRuns,
  ocWake,
} from "@/rpc/openclaw.functions";

// ── Node fleet ─────────────────────────────────────────────────────────────────
export {
  ocListNodes,
  ocDescribeNode,
  ocRenameNode,
  ocInvokeNode,
} from "@/rpc/openclaw.functions";

// ── Models / Usage / Providers ─────────────────────────────────────────────────
export {
  ocListGwModels,
  ocGetUsageStatus,
  ocGetUsageCost,
  ocGetChannelsStatus,
  ocGetTtsStatus,
  ocListTtsProviders,
  ocSetTtsProvider,
  ocSetTalkMode,
} from "@/rpc/openclaw.functions";

// ── Tools ──────────────────────────────────────────────────────────────────────
export {
  ocGetToolsCatalog,
  ocGetEffectiveTools,
  ocInvokeTool,
} from "@/rpc/openclaw.functions";

// ── Agent registry / config bridge (legacy) ────────────────────────────────────
export {
  ocListAgentsFromConfig,
  ocUpdateAgentAlias,
  ocBackupOpenClawConfig,
  ocValidateOpenClawConfig,
  ocWriteOpenClawConfig,
} from "@/rpc/openclaw.functions";

// ── Memory + snapshots ─────────────────────────────────────────────────────────
export {
  ocListMemorySources,
  ocSearchMemory,
  ocCreateSnapshot,
  ocUpdateSnapshot,
  ocCreateMemoryWriteCandidate,
  ocApproveMemoryWrite,
} from "@/rpc/openclaw.functions";

// ── Diagnostics ────────────────────────────────────────────────────────────────
export { ocFilesystemDiagnostics } from "@/rpc/openclaw-diagnostics.functions";

export type {
  FsDiagnosticsReport,
  FsItem,
  FsItemKind,
} from "@/lib/openclaw-diagnostics-types";

// ── Status convenience hook ────────────────────────────────────────────────────
import { ocStatus } from "@/rpc/openclaw.functions";
export async function getOpenClawStatus() { return ocStatus(); }

// ── Live data re-exports ───────────────────────────────────────────────────────
// Components that want live data should use these instead of server functions.
export { useGatewayStore } from "@/lib/gateway-store";
export { useGatewayStream } from "@/lib/gateway-stream";
export type { GatewayState, LogLine } from "@/lib/gateway-store";
