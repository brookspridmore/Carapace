import type {
  OpenClawAdapter,
  AgentAliasInput,
  ConfigBackupRef,
  ConfigValidation,
  ConfigWriteResult,
} from "./types";

// "Honest empty" adapter. Used in readonly mode whenever Carapace cannot
// reach OpenClaw or the upstream returns nothing. It NEVER returns mock
// data — every list is empty, every lookup is null.
export const emptyAdapter: OpenClawAdapter = {
  async health() {
    return { ok: false, baseUrl: "", latencyMs: 0 };
  },
  async listAgents() { return []; },
  async getAgent() { return null; },
  async listTasks() { return []; },
  async updateTaskStatus() { return null; },
  async listSnapshots() { return []; },
  async listConversations() { return []; },
  async listApprovals() { return []; },
  async resolveApproval() { return null; },
  async listProviders() { return []; },
  async recentLogs() { return []; },

  async listAgentsFromConfig() {
    return { source: "openclaw", agents: [] };
  },
  async updateAgentAlias(_input: AgentAliasInput) {
    // Alias edits live in Carapace local storage on the client; this no-op
    // matches the readonly contract on the server.
    return { ok: true } as const;
  },
  async backupOpenClawConfig(): Promise<ConfigBackupRef> {
    throw new Error("backupOpenClawConfig is disabled in readonly mode");
  },
  async validateOpenClawConfig(_payload: string): Promise<ConfigValidation> {
    return { ok: false, errors: ["readonly mode — config writes are disabled"], warnings: [] };
  },
  async writeOpenClawConfig(): Promise<ConfigWriteResult> {
    throw new Error("writeOpenClawConfig is disabled in readonly mode");
  },

  async listMemorySources() { return []; },
  async searchMemory() { return []; },
  async createSnapshot() {
    throw new Error("createSnapshot is disabled in readonly mode");
  },
  async updateSnapshot() {
    throw new Error("updateSnapshot is disabled in readonly mode");
  },
  async createMemoryWriteCandidate() {
    throw new Error("createMemoryWriteCandidate is disabled in readonly mode");
  },
  async approveMemoryWrite() {
    throw new Error("approveMemoryWrite is disabled in readonly mode");
  },
};