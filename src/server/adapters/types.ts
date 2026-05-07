// ─────────────────────────────────────────────────────────────────────────────
// OpenClawAdapter — the full god-mode contract.
//
// Both the mock adapter (Lovable preview) and the real gateway adapter (VPS)
// must implement this interface. Swapping adapters requires zero UI changes.
//
// Methods are grouped by domain:
//   Core health + agents + tasks (legacy compat)
//   Sessions & chat (WS RPC: sessions.*, chat.*)
//   Agent management (WS RPC: agents.*)
//   Config & gateway (WS RPC: config.*, health, status)
//   Approvals (WS RPC: exec.approval.*, plugin.approval.*)
//   Automation/cron (WS RPC: cron.*)
//   Node fleet (WS RPC: node.*)
//   Usage / models / providers (WS RPC: models.*, usage.*, channels.*, tts.*)
//   Tools (WS RPC: tools.*)
//   Memory & files (server-side filesystem via agents.files.*)
//   Snapshots (Carapace-owned)
// ─────────────────────────────────────────────────────────────────────────────

import type {
  Agent,
  Task,
  TaskStatus,
  Snapshot,
  ConversationThread,
  ApprovalRequest,
  ProviderConfig,
  LogEntry,
} from "@/lib/mock-data";
import type {
  MemorySource,
  MemorySearchHit,
  MemoryWriteCandidate,
  WriteLayer,
} from "@/lib/memory-store";
import type {
  GwSession,
  GwMessage,
  GwChatHistory,
  GwSessionDescription,
  GwSessionPreview,
  GwAgent,
  GwAgentIdentity,
  GwAgentFile,
  GwAgentFileEntry,
  GwConfig,
  GwConfigSchema,
  GwConfigPatchResult,
  GwConfigApplyResult,
  GwExecApproval,
  GwPluginApproval,
  GwApprovalPolicy,
  GwCronJob,
  GwCronRun,
  GwCronStatus,
  GwNode,
  GwNodePendingItem,
  GwModel,
  GwUsageCost,
  GwUsageStatus,
  GwChannelStatus,
  GwTtsProvider,
  GwTtsStatus,
  GwHealth,
  GwStatus,
  GwSystemPresence,
  GwToolDescriptor,
  GwToolInvokeResult,
  GwUpdateStatus,
} from "@/server/gateway/protocol-types";

// ── Legacy compat types ───────────────────────────────────────────────────────

export interface AgentAliasInput {
  rawOpenClawId: string;
  friendlyName: string;
  role?: string;
  parentRawOpenClawId?: string;
  workspacePath?: string;
  memoryPath?: string;
  notes?: string;
  tags?: string[];
}

export interface ConfigAgentRecord {
  rawOpenClawId: string;
  friendlyName?: string;
  role?: string;
  parentRawOpenClawId?: string;
  workspacePath?: string;
  memoryPath?: string;
  model?: string;
  provider?: string;
}

export interface ConfigBackupRef {
  path: string;
  createdAt: string;
  size: number;
}

export interface ConfigValidation {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

export interface ConfigWriteResult {
  ok: boolean;
  bytesWritten: number;
  backup: ConfigBackupRef;
  audit: { id: string; ts: string; summary: string };
}

// ── Re-export gateway types ───────────────────────────────────────────────────

export type {
  GwSession, GwMessage, GwChatHistory, GwSessionDescription, GwSessionPreview,
  GwAgent, GwAgentIdentity, GwAgentFile, GwAgentFileEntry,
  GwConfig, GwConfigSchema, GwConfigPatchResult, GwConfigApplyResult,
  GwExecApproval, GwPluginApproval, GwApprovalPolicy,
  GwCronJob, GwCronRun, GwCronStatus,
  GwNode, GwNodePendingItem,
  GwModel, GwUsageCost, GwUsageStatus, GwChannelStatus, GwTtsProvider, GwTtsStatus,
  GwHealth, GwStatus, GwSystemPresence,
  GwToolDescriptor, GwToolInvokeResult,
  GwUpdateStatus,
};

// ─────────────────────────────────────────────────────────────────────────────
// The adapter contract
// ─────────────────────────────────────────────────────────────────────────────

export interface OpenClawAdapter {

  // ── Core health ─────────────────────────────────────────────────────────────

  health(): Promise<{ ok: boolean; baseUrl: string; latencyMs: number }>;
  getGatewayHealth(): Promise<GwHealth>;
  getGatewayStatus(): Promise<GwStatus>;
  getSystemPresence(): Promise<GwSystemPresence>;

  // ── Legacy compat (kept for backward compat with existing UI) ─────────────────

  listAgents(): Promise<Agent[]>;
  getAgent(id: string): Promise<Agent | null>;
  listTasks(): Promise<Task[]>;
  updateTaskStatus(id: string, status: TaskStatus): Promise<Task | null>;
  listSnapshots(): Promise<Snapshot[]>;
  listConversations(): Promise<ConversationThread[]>;
  listApprovals(): Promise<ApprovalRequest[]>;
  resolveApproval(id: string, decision: "approve" | "deny"): Promise<ApprovalRequest | null>;
  listProviders(): Promise<ProviderConfig[]>;
  recentLogs(limit?: number): Promise<LogEntry[]>;

  // ── Sessions & chat ───────────────────────────────────────────────────────────

  listGwSessions(): Promise<GwSession[]>;
  getGwSession(key: string): Promise<GwSession | null>;
  previewSession(key: string): Promise<GwSessionPreview | null>;
  describeSession(key: string): Promise<GwSessionDescription | null>;
  createSession(params: {
    agentId: string;
    channel?: string;
    title?: string;
    metadata?: Record<string, unknown>;
  }): Promise<GwSession>;
  sendToSession(key: string, message: string): Promise<void>;
  steerSession(key: string, message: string): Promise<void>;
  abortSession(key: string): Promise<void>;
  patchSession(key: string, patch: Record<string, unknown>): Promise<GwSession | null>;
  resetSession(key: string): Promise<void>;
  deleteSession(key: string): Promise<void>;
  compactSession(key: string): Promise<void>;

  getChatHistory(key: string, opts?: { limit?: number; cursor?: string }): Promise<GwChatHistory>;
  sendChat(key: string, message: string): Promise<void>;
  abortChat(key: string): Promise<void>;
  injectChat(key: string, message: string, role?: string): Promise<void>;

  // ── Agent management ──────────────────────────────────────────────────────────

  listGwAgents(): Promise<GwAgent[]>;
  getGwAgent(id: string): Promise<GwAgent | null>;
  getAgentIdentity(id: string): Promise<GwAgentIdentity | null>;
  createGwAgent(params: {
    id?: string;
    name?: string;
    role?: string;
    model?: string;
    provider?: string;
    parentId?: string;
    workspacePath?: string;
    metadata?: Record<string, unknown>;
  }): Promise<GwAgent>;
  updateGwAgent(id: string, params: Partial<{
    name: string;
    role: string;
    model: string;
    provider: string;
    parentId: string;
    metadata: Record<string, unknown>;
  }>): Promise<GwAgent | null>;
  deleteGwAgent(id: string): Promise<void>;

  listAgentFiles(agentId: string): Promise<GwAgentFileEntry[]>;
  getAgentFile(agentId: string, path: string): Promise<GwAgentFile | null>;
  setAgentFile(agentId: string, path: string, content: string): Promise<void>;

  // ── Config & gateway control ──────────────────────────────────────────────────

  getConfig(): Promise<GwConfig>;
  getConfigSchema(): Promise<GwConfigSchema>;
  lookupConfigSchema(path: string): Promise<GwConfigSchema | null>;
  patchConfig(patch: Record<string, unknown>): Promise<GwConfigPatchResult>;
  applyConfig(): Promise<GwConfigApplyResult>;
  backupConfig(): Promise<ConfigBackupRef>;
  validateConfig(payload: string): Promise<ConfigValidation>;
  writeConfig(payload: string, opts: { operatorNote?: string }): Promise<ConfigWriteResult>;

  getUpdateStatus(): Promise<GwUpdateStatus>;
  runUpdate(): Promise<void>;

  // ── Approvals ─────────────────────────────────────────────────────────────────

  listExecApprovals(): Promise<GwExecApproval[]>;
  getExecApproval(id: string): Promise<GwExecApproval | null>;
  resolveExecApproval(id: string, decision: "approve" | "deny"): Promise<GwExecApproval | null>;
  getApprovalPolicy(): Promise<GwApprovalPolicy>;
  setApprovalPolicy(policy: GwApprovalPolicy): Promise<void>;
  listPluginApprovals(): Promise<GwPluginApproval[]>;
  resolvePluginApproval(id: string, decision: "approve" | "deny"): Promise<GwPluginApproval | null>;

  // ── Cron / Automation ─────────────────────────────────────────────────────────

  getCronStatus(): Promise<GwCronStatus>;
  listCronJobs(): Promise<GwCronJob[]>;
  addCronJob(params: {
    name?: string;
    schedule: string;
    agentId: string;
    message: string;
    enabled?: boolean;
  }): Promise<GwCronJob>;
  updateCronJob(id: string, params: Partial<{
    name: string;
    schedule: string;
    message: string;
    enabled: boolean;
  }>): Promise<GwCronJob | null>;
  removeCronJob(id: string): Promise<void>;
  runCronJob(id: string): Promise<void>;
  getCronRuns(id: string, limit?: number): Promise<GwCronRun[]>;
  wake(params: { agentId: string; message: string; atMs: number }): Promise<void>;

  // ── Node fleet ────────────────────────────────────────────────────────────────

  listNodes(): Promise<GwNode[]>;
  describeNode(id: string): Promise<GwNode | null>;
  renameNode(id: string, name: string): Promise<void>;
  invokeNode(id: string, method: string, params?: unknown): Promise<unknown>;
  drainNodeQueue(id: string): Promise<void>;
  pullNodePending(id: string): Promise<GwNodePendingItem[]>;
  ackNodePending(id: string, itemId: string): Promise<void>;
  enqueueNodePending(id: string, item: { method: string; params?: unknown }): Promise<void>;

  // ── Models / Usage / Providers ────────────────────────────────────────────────

  listGwModels(): Promise<GwModel[]>;
  getUsageStatus(): Promise<GwUsageStatus>;
  getUsageCost(opts?: { period?: string; agentId?: string }): Promise<GwUsageCost>;
  getChannelsStatus(): Promise<GwChannelStatus[]>;
  getTtsStatus(): Promise<GwTtsStatus>;
  listTtsProviders(): Promise<GwTtsProvider[]>;
  setTtsProvider(id: string): Promise<void>;
  getTalkConfig(): Promise<Record<string, unknown>>;
  setTalkMode(mode: string): Promise<void>;

  // ── Tools ─────────────────────────────────────────────────────────────────────

  getToolsCatalog(): Promise<GwToolDescriptor[]>;
  getEffectiveTools(agentId?: string): Promise<GwToolDescriptor[]>;
  invokeTool(tool: string, params: Record<string, unknown>): Promise<GwToolInvokeResult>;

  // ── Agent registry / config bridge (legacy compat) ────────────────────────────

  listAgentsFromConfig(): Promise<{ source: "mock" | "openclaw"; agents: ConfigAgentRecord[] }>;
  updateAgentAlias(input: AgentAliasInput): Promise<{ ok: true }>;
  backupOpenClawConfig(): Promise<ConfigBackupRef>;
  validateOpenClawConfig(payload: string): Promise<ConfigValidation>;
  writeOpenClawConfig(payload: string, opts: { rawIds: string[]; operatorNote?: string }): Promise<ConfigWriteResult>;

  // ── Memory & files ────────────────────────────────────────────────────────────

  listMemorySources(): Promise<MemorySource[]>;
  searchMemory(query: string, opts?: { topK?: number }): Promise<MemorySearchHit[]>;
  createMemoryWriteCandidate(input: {
    proposedMemory: string;
    sourceTaskId?: string;
    sourceAgentId?: string;
    targetLayer: WriteLayer;
    reason: string;
    confidence: number;
  }): Promise<MemoryWriteCandidate>;
  approveMemoryWrite(id: string, decision: "approve" | "reject", overrideText?: string): Promise<MemoryWriteCandidate | null>;

  // ── Snapshots (Carapace-owned) ────────────────────────────────────────────────

  createSnapshot(input: Omit<Snapshot, "createdAt" | "updatedAt">): Promise<Snapshot>;
  updateSnapshot(id: string, patch: Partial<Snapshot>): Promise<Snapshot | null>;
}
