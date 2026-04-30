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
}
