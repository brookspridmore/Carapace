import {
  AGENTS,
  TASKS,
  SNAPSHOTS,
  CONVERSATIONS,
  APPROVALS,
  PROVIDERS,
  LOGS,
  type Task,
  type TaskStatus,
  type Snapshot,
} from "@/lib/mock-data";
import { useMemoryStore } from "@/lib/memory-store";
import { useSnapshotStore } from "@/lib/snapshot-store";
import type {
  OpenClawAdapter,
  AgentAliasInput,
  ConfigBackupRef,
  ConfigValidation,
  ConfigWriteResult,
  ConfigAgentRecord,
} from "./types";

const tasks: Task[] = TASKS.map((t) => ({ ...t }));
const approvals = APPROVALS.map((a) => ({ ...a }));

// In-memory mock storage for friendly-name aliases. The real adapter persists
// these to Carapace's local SQLite DB (carapace.db).
const aliasOverrides = new Map<string, AgentAliasInput>();
const mockBackups: ConfigBackupRef[] = [];

export const mockAdapter: OpenClawAdapter = {
  async health() {
    return { ok: true, baseUrl: "mock://carapace", latencyMs: 4 };
  },
  async listAgents() {
    return AGENTS;
  },
  async getAgent(id) {
    return AGENTS.find((a) => a.id === id) ?? null;
  },
  async listTasks() {
    return tasks;
  },
  async updateTaskStatus(id, status: TaskStatus) {
    const t = tasks.find((x) => x.id === id);
    if (!t) return null;
    t.status = status;
    return t;
  },
  async listSnapshots() {
    return SNAPSHOTS;
  },
  async listConversations() {
    return CONVERSATIONS;
  },
  async listApprovals() {
    return approvals;
  },
  async resolveApproval(id, decision) {
    const a = approvals.find((x) => x.id === id);
    if (!a) return null;
    a.status = decision === "approve" ? "approved" : "denied";
    return a;
  },
  async listProviders() {
    return PROVIDERS;
  },
  async recentLogs(limit = 60) {
    return LOGS.slice(0, limit);
  },

  async listAgentsFromConfig() {
    // No real OpenClaw config in the preview environment — return mock-shaped
    // records so the Agents page can demonstrate the read path.
    const agents: ConfigAgentRecord[] = AGENTS.map((a) => ({
      rawOpenClawId: a.id,
      friendlyName: a.name,
      role: a.role,
      parentRawOpenClawId: a.parentId,
      workspacePath: a.workspacePath,
      memoryPath: `/var/openclaw/agents/${a.id}/MEMORY.md`,
      model: a.model,
      provider: a.provider,
    }));
    return { source: "mock", agents };
  },

  async updateAgentAlias(input: AgentAliasInput) {
    aliasOverrides.set(input.rawOpenClawId, input);
    return { ok: true };
  },

  async backupOpenClawConfig() {
    const ref: ConfigBackupRef = {
      path: `/var/lib/carapace/backups/openclaw-config.${new Date()
        .toISOString()
        .replace(/[:.]/g, "-")}.toml`,
      createdAt: new Date().toISOString(),
      size: 1024,
    };
    mockBackups.unshift(ref);
    return ref;
  },

  async validateOpenClawConfig(payload: string) {
    const result: ConfigValidation = { ok: true, errors: [], warnings: [] };
    if (!payload.trim()) {
      result.ok = false;
      result.errors.push("Empty config payload");
    }
    if (!payload.includes("[agents")) {
      result.warnings.push("No [agents.*] sections detected — is this the right file?");
    }
    return result;
  },

  async writeOpenClawConfig(payload: string, opts: { rawIds: string[]; operatorNote?: string }) {
    const backup = await mockAdapter.backupOpenClawConfig();
    const audit = {
      id: `aud_${Date.now()}`,
      ts: new Date().toISOString(),
      summary: `Wrote ${opts.rawIds.length} agent alias${opts.rawIds.length === 1 ? "" : "es"} to OpenClaw config${opts.operatorNote ? ` — ${opts.operatorNote}` : ""}`,
    };
    const result: ConfigWriteResult = {
      ok: true,
      bytesWritten: payload.length,
      backup,
      audit,
    };
    return result;
  },

  // ---- Memory + snapshot bridge (mock backed by client stores) ------------
  // NOTE: in the preview these stores live in the browser, so the server
  // function returns the seeded snapshot from mock-data. Real adapter on the
  // VPS will read/write OpenClaw filesystem.
  async listMemorySources() {
    return useMemoryStore.getState().sources;
  },
  async searchMemory(query, opts) {
    return useMemoryStore.getState().search(query, { topK: opts?.topK }).hits;
  },
  async createSnapshot(input) {
    const ts = new Date().toISOString();
    const snap: Snapshot = { ...input, createdAt: ts, updatedAt: ts };
    useSnapshotStore.getState().upsert(snap);
    return snap;
  },
  async updateSnapshot(id, patch) {
    const store = useSnapshotStore.getState();
    const existing = store.snapshots.find((s) => s.id === id);
    if (!existing) return null;
    store.patch(id, patch);
    return useSnapshotStore.getState().snapshots.find((s) => s.id === id) ?? null;
  },
  async createMemoryWriteCandidate(input) {
    return useMemoryStore.getState().proposeWrite({
      ...input,
      sourceAgentId: input.sourceAgentId as Snapshot["agentId"] | undefined,
    });
  },
  async approveMemoryWrite(id, decision, overrideText) {
    useMemoryStore.getState().decide(id, decision, overrideText);
    return useMemoryStore.getState().candidates.find((c) => c.id === id) ?? null;
  },

  // ── New gateway methods — mock stubs ──────────────────────────────────────

  async getGatewayHealth() { return { ok: true, uptime: 0, version: "mock" }; },
  async getGatewayStatus() { return { agentCount: AGENTS.length, activeSessions: 0, pendingApprovals: 0, cronJobs: 0 }; },
  async getSystemPresence() { return { connected: true, clientCount: 1, gatewayVersion: "mock" }; },

  async listGwSessions() { return []; },
  async getGwSession() { return null; },
  async previewSession() { return null; },
  async describeSession() { return null; },
  async createSession() { throw new Error("mock: createSession not supported"); },
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
  async createGwAgent() { throw new Error("mock: createGwAgent not supported"); },
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
  async backupConfig() { return { path: "mock-backup", createdAt: new Date().toISOString(), size: 0 }; },
  async validateConfig() { return { ok: true, errors: [], warnings: [] }; },
  async writeConfig() {
    return {
      ok: true,
      bytesWritten: 0,
      backup: { path: "mock-backup", createdAt: new Date().toISOString(), size: 0 },
      audit: { id: crypto.randomUUID(), ts: new Date().toISOString(), summary: "mock write" },
    };
  },
  async getUpdateStatus() { return { available: false }; },
  async runUpdate() {},

  async listExecApprovals() { return APPROVALS.map((a) => ({
    id: a.id, agentId: a.agentId, tool: a.type, input: {}, status: a.status, requestedAt: a.requestedAt ?? new Date().toISOString(),
  })); },
  async getExecApproval() { return null; },
  async resolveExecApproval(id, decision) {
    const a = APPROVALS.find((x) => x.id === id);
    if (!a) return null;
    return { id, agentId: a.agentId, tool: a.type, input: {}, status: decision === "approve" ? "approved" : "denied", requestedAt: a.requestedAt ?? new Date().toISOString() };
  },
  async getApprovalPolicy() { return {}; },
  async setApprovalPolicy() {},
  async listPluginApprovals() { return []; },
  async resolvePluginApproval() { return null; },

  async getCronStatus() { return { running: 0, scheduled: 0, failed: 0 }; },
  async listCronJobs() { return []; },
  async addCronJob() { throw new Error("mock: addCronJob not supported"); },
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
