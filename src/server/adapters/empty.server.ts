import type {
  OpenClawAdapter,
  AgentAliasInput,
  ConfigBackupRef,
  ConfigValidation,
  ConfigWriteResult,
  GwExecApproval,
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

  // ── New gateway methods — readonly stubs ──────────────────────────────────

  async getGatewayHealth() { return { ok: false, uptime: 0, version: "" }; },
  async getGatewayStatus() { return { agentCount: 0, activeSessions: 0, pendingApprovals: 0, cronJobs: 0 }; },
  async getSystemPresence() { return { connected: false, clientCount: 0, gatewayVersion: "" }; },

  async listGwSessions() { return []; },
  async getGwSession() { return null; },
  async previewSession() { return null; },
  async describeSession() { return null; },
  async createSession() { throw new Error("createSession is disabled in readonly mode"); },
  async sendToSession() {},
  async steerSession() {},
  async abortSession() {},
  async patchSession() { return null; },
  async resetSession() {},
  async deleteSession() {},
  async compactSession() {},
  async getChatHistory() { return { messages: [] }; },
  async sendChat() {},
  async abortChat() {},
  async injectChat() {},

  async listGwAgents() { return []; },
  async getGwAgent() { return null; },
  async getAgentIdentity() { return null; },
  async createGwAgent() { throw new Error("createGwAgent is disabled in readonly mode"); },
  async updateGwAgent() { return null; },
  async deleteGwAgent() {},
  async listAgentFiles() { return []; },
  async getAgentFile() { return null; },
  async setAgentFile() {},

  async getConfig() { return {}; },
  async getConfigSchema() { return {}; },
  async lookupConfigSchema() { return null; },
  async patchConfig() { return { ok: true, changed: [] }; },
  async applyConfig() { return { ok: true }; },
  async backupConfig(): Promise<ConfigBackupRef> { throw new Error("backupConfig is disabled in readonly mode"); },
  async validateConfig(_payload: string): Promise<ConfigValidation> {
    return { ok: false, errors: ["readonly mode — config writes are disabled"], warnings: [] };
  },
  async writeConfig(): Promise<ConfigWriteResult> { throw new Error("writeConfig is disabled in readonly mode"); },
  async getUpdateStatus() { return { available: false }; },
  async runUpdate() {},

  async listExecApprovals(): Promise<GwExecApproval[]> { return []; },
  async getExecApproval() { return null; },
  async resolveExecApproval() { return null; },
  async getApprovalPolicy() { return {}; },
  async setApprovalPolicy() {},
  async listPluginApprovals() { return []; },
  async resolvePluginApproval() { return null; },

  async getCronStatus() { return { running: 0, scheduled: 0, failed: 0 }; },
  async listCronJobs() { return []; },
  async addCronJob() { throw new Error("addCronJob is disabled in readonly mode"); },
  async updateCronJob() { return null; },
  async removeCronJob() {},
  async runCronJob() {},
  async getCronRuns() { return []; },
  async wake() {},

  async listNodes() { return []; },
  async describeNode() { return null; },
  async renameNode() {},
  async invokeNode() { return null; },
  async drainNodeQueue() {},
  async pullNodePending() { return []; },
  async ackNodePending() {},
  async enqueueNodePending() {},

  async listGwModels() { return []; },
  async getUsageStatus() { return { dailyCost: 0, monthlyCost: 0, currency: "USD" }; },
  async getUsageCost() { return { totalCost: 0, currency: "USD", breakdown: {} }; },
  async getChannelsStatus() { return []; },
  async getTtsStatus() { return { enabled: false }; },
  async listTtsProviders() { return []; },
  async setTtsProvider() {},
  async getTalkConfig() { return {}; },
  async setTalkMode() {},

  async getToolsCatalog() { return []; },
  async getEffectiveTools() { return []; },
  async invokeTool() { return { output: null }; },
};