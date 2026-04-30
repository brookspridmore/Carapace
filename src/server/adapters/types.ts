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

// Friendly-name overlay coming from Carapace alias storage and/or a parsed
// OpenClaw config file. The raw OpenClaw id is the join key.
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

// Adapter contract — both the mock adapter (used in Lovable preview) and the
// real OpenClaw adapter (used on the VPS) must implement this interface.
// Swapping adapters requires no UI changes.
export interface OpenClawAdapter {
  health(): Promise<{ ok: boolean; baseUrl: string; latencyMs: number }>;
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

  // ---- Agent registry / OpenClaw config bridge -----------------------------
  // Read agent records straight from OpenClaw config (e.g. agents.toml).
  // If no config path is configured, the adapter falls back to mock data.
  listAgentsFromConfig(): Promise<{ source: "mock" | "openclaw"; agents: ConfigAgentRecord[] }>;
  // Persist friendly-name + alias edits in Carapace's local store (no
  // OpenClaw write happens here — that's writeOpenClawConfig).
  updateAgentAlias(input: AgentAliasInput): Promise<{ ok: true }>;
  // Snapshot the current OpenClaw config to a timestamped file before any
  // destructive write. Always called automatically by writeOpenClawConfig
  // but exposed for explicit "Backup now" flows.
  backupOpenClawConfig(): Promise<ConfigBackupRef>;
  // Validate the proposed config payload (TOML parse, schema, required fields).
  validateOpenClawConfig(payload: string): Promise<ConfigValidation>;
  // Write the proposed config to disk after backup + validation. Returns the
  // backup ref + an audit entry. Caller (UI) is responsible for confirming.
  writeOpenClawConfig(payload: string, opts: {
    rawIds: string[];          // which agents are being touched (for audit)
    operatorNote?: string;
  }): Promise<ConfigWriteResult>;
}
