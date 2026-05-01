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
    return useMemoryStore.getState().proposeWrite(input);
  },
  async approveMemoryWrite(id, decision, overrideText) {
    useMemoryStore.getState().decide(id, decision, overrideText);
    return useMemoryStore.getState().candidates.find((c) => c.id === id) ?? null;
  },
};
