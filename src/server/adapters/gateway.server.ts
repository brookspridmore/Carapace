// ─────────────────────────────────────────────────────────────────────────────
// Gateway adapter — implements OpenClawAdapter via the WS gateway client.
//
// This is the primary "live" adapter. It delegates every operation to the
// singleton GatewayClient which maintains one persistent WebSocket connection
// to the OpenClaw gateway.
//
// Pattern:
//   - Read methods: call() the gateway and return results (or cached values).
//   - Write methods: call() the gateway; throw on failure.
//   - Legacy compat methods: map gateway data → legacy mock-data shapes.
// ─────────────────────────────────────────────────────────────────────────────

import { ensureGatewayConnected } from "@/server/gateway/client.server";
import { emptyAdapter } from "./empty.server";
import { useMemoryStore } from "@/lib/memory-store";
import { useSnapshotStore } from "@/lib/snapshot-store";
import type { OpenClawAdapter, ConfigBackupRef, ConfigValidation, ConfigWriteResult } from "./types";
import type {
  Agent, Task, TaskStatus, Snapshot, ConversationThread, ApprovalRequest, ProviderConfig, LogEntry,
} from "@/lib/mock-data";
import type {
  GwSession, GwAgent, GwHealth, GwStatus, GwSystemPresence, GwChatHistory,
  GwSessionPreview, GwSessionDescription, GwAgentIdentity, GwAgentFile, GwAgentFileEntry,
  GwConfig, GwConfigSchema, GwConfigPatchResult, GwConfigApplyResult,
  GwExecApproval, GwPluginApproval, GwApprovalPolicy,
  GwCronJob, GwCronRun, GwCronStatus,
  GwNode, GwNodePendingItem,
  GwModel, GwUsageCost, GwUsageStatus, GwChannelStatus, GwTtsProvider, GwTtsStatus,
  GwToolDescriptor, GwToolInvokeResult,
  GwUpdateStatus,
} from "@/server/gateway/protocol-types";

// ── Helpers ────────────────────────────────────────────────────────────────────

function gw() {
  return ensureGatewayConnected();
}

async function call<R>(method: string, params?: unknown): Promise<R> {
  return gw().call<R>(method, params);
}

/** Try a call; return fallback on error. */
async function tryCall<R>(method: string, params?: unknown, fallback?: R): Promise<R> {
  try {
    return await call<R>(method, params);
  } catch {
    return fallback as R;
  }
}

// ── GwAgent → legacy Agent shape ──────────────────────────────────────────────

function gwAgentToLegacy(a: GwAgent): Agent {
  return {
    id: a.id as Agent["id"],
    name: a.name ?? a.id,
    role: a.role ?? "Agent",
    model: a.model ?? "unknown",
    provider: a.provider ?? "Unknown",
    status: (a.status as Agent["status"]) ?? "idle",
    parentId: a.parentId as Agent["id"] | undefined,
    activeTask: undefined,
    tokensUsed: 0,
    tokensMax: 200_000,
    contextPressure: 0,
    workspacePath: a.workspacePath ?? "",
    memorySizeKb: 0,
  };
}

// ── GwExecApproval → legacy ApprovalRequest shape ─────────────────────────────

function gwApprovalToLegacy(a: GwExecApproval): ApprovalRequest {
  return {
    id: a.id,
    agentId: a.agentId as Agent["id"],
    type: "exec" as ApprovalRequest["type"],
    title: `Tool: ${a.tool}`,
    description: JSON.stringify(a.input ?? {}),
    status: a.status as ApprovalRequest["status"],
    requestedAt: a.requestedAt,
    resolvedAt: a.resolvedAt,
  };
}

// ── The adapter ────────────────────────────────────────────────────────────────

export const gatewayAdapter: OpenClawAdapter = {

  // ── Core health ─────────────────────────────────────────────────────────────

  async health() {
    const client = gw();
    const t0 = Date.now();
    const h = await tryCall<GwHealth>("health", undefined, { ok: false });
    return {
      ok: h?.ok ?? false,
      baseUrl: client.isReady() ? "ws://127.0.0.1:18789" : "(disconnected)",
      latencyMs: Date.now() - t0,
    };
  },

  async getGatewayHealth() {
    // Use cached value if available; refresh in background.
    const cached = gw().cachedHealth;
    if (cached) {
      call<GwHealth>("health").then((h) => { gw().cachedHealth = h; }).catch(() => {});
      return cached;
    }
    return call<GwHealth>("health");
  },

  async getGatewayStatus() {
    return call<GwStatus>("status");
  },

  async getSystemPresence() {
    return call<GwSystemPresence>("system-presence");
  },

  // ── Legacy compat ─────────────────────────────────────────────────────────────

  async listAgents() {
    const agents = await tryCall<GwAgent[]>("agents.list", undefined, gw().cachedAgents);
    return (agents ?? []).map(gwAgentToLegacy);
  },

  async getAgent(id) {
    const a = await tryCall<GwAgent>("agents.list", undefined);
    const agents = Array.isArray(a) ? a : gw().cachedAgents;
    const found = agents.find((x) => x.id === id);
    return found ? gwAgentToLegacy(found) : null;
  },

  async listTasks() {
    // OpenClaw has no first-class task API — return empty; Kanban is Carapace-owned.
    return [];
  },

  async updateTaskStatus(_id, _status) { return null; },

  async listSnapshots() {
    return useSnapshotStore.getState().snapshots;
  },

  async listConversations() {
    const sessions = await tryCall<GwSession[]>("sessions.list", undefined, gw().cachedSessions);
    return (sessions ?? []).map((s): ConversationThread => ({
      id: s.key,
      agentId: s.agentId as Agent["id"],
      title: s.title ?? s.preview ?? s.key,
      preview: s.preview ?? "",
      channel: (s.channel ?? "api") as ConversationThread["channel"],
      status: (s.status === "running" ? "active" : "closed") as ConversationThread["status"],
      messageCount: s.messageCount ?? 0,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    }));
  },

  async listApprovals() {
    const approvals = await tryCall<GwExecApproval[]>("exec.approval.list", undefined, gw().cachedApprovals);
    return (approvals ?? []).map(gwApprovalToLegacy);
  },

  async resolveApproval(id, decision) {
    const result = await call<GwExecApproval>("exec.approval.resolve", { id, decision });
    return gwApprovalToLegacy(result);
  },

  async listProviders() {
    const models = await tryCall<GwModel[]>("models.list", undefined, gw().cachedModels);
    const providers = new Map<string, ProviderConfig>();
    for (const m of (models ?? [])) {
      if (!providers.has(m.provider)) {
        providers.set(m.provider, {
          id: m.provider,
          name: m.provider,
          type: "api" as ProviderConfig["type"],
          status: "ok" as ProviderConfig["status"],
          models: [],
          isPrimary: false,
          isFallback: false,
        });
      }
      providers.get(m.provider)!.models.push(m.id);
    }
    return Array.from(providers.values());
  },

  async recentLogs(limit = 80) {
    return tryCall<LogEntry[]>("logs.tail", { limit }, []) ?? [];
  },

  // ── Sessions ──────────────────────────────────────────────────────────────────

  async listGwSessions() {
    return tryCall<GwSession[]>("sessions.list", undefined, gw().cachedSessions) ?? [];
  },

  async getGwSession(key) {
    return tryCall<GwSession | null>("sessions.get", { key }, null);
  },

  async previewSession(key) {
    return tryCall<GwSessionPreview | null>("sessions.preview", { key }, null);
  },

  async describeSession(key) {
    return tryCall<GwSessionDescription | null>("sessions.describe", { key }, null);
  },

  async createSession(params) {
    return call<GwSession>("sessions.create", params);
  },

  async sendToSession(key, message) {
    await call("sessions.send", { key, message });
  },

  async steerSession(key, message) {
    await call("sessions.steer", { key, message });
  },

  async abortSession(key) {
    await call("sessions.abort", { key });
  },

  async patchSession(key, patch) {
    return call<GwSession>("sessions.patch", { key, patch });
  },

  async resetSession(key) {
    await call("sessions.reset", { key });
  },

  async deleteSession(key) {
    await call("sessions.delete", { key });
  },

  async compactSession(key) {
    await call("sessions.compact", { key });
  },

  async getChatHistory(key, opts) {
    return call<GwChatHistory>("chat.history", { key, ...opts });
  },

  async sendChat(key, message) {
    await call("chat.send", { key, message });
  },

  async abortChat(key) {
    await call("chat.abort", { key });
  },

  async injectChat(key, message, role = "user") {
    await call("chat.inject", { key, message, role });
  },

  // ── Agent management ──────────────────────────────────────────────────────────

  async listGwAgents() {
    return tryCall<GwAgent[]>("agents.list", undefined, gw().cachedAgents) ?? [];
  },

  async getGwAgent(id) {
    const agents = await this.listGwAgents();
    return agents.find((a) => a.id === id) ?? null;
  },

  async getAgentIdentity(id) {
    return tryCall<GwAgentIdentity | null>("agent.identity.get", { id }, null);
  },

  async createGwAgent(params) {
    return call<GwAgent>("agents.create", params);
  },

  async updateGwAgent(id, params) {
    return call<GwAgent>("agents.update", { id, ...params });
  },

  async deleteGwAgent(id) {
    await call("agents.delete", { id });
  },

  async listAgentFiles(agentId) {
    return tryCall<GwAgentFileEntry[]>("agents.files.list", { agentId }, []) ?? [];
  },

  async getAgentFile(agentId, path) {
    return tryCall<GwAgentFile | null>("agents.files.get", { agentId, path }, null);
  },

  async setAgentFile(agentId, path, content) {
    await call("agents.files.set", { agentId, path, content });
  },

  // ── Config ────────────────────────────────────────────────────────────────────

  async getConfig() {
    const cached = gw().cachedConfig;
    if (cached) return cached;
    return call<GwConfig>("config.get");
  },

  async getConfigSchema() {
    return call<GwConfigSchema>("config.schema");
  },

  async lookupConfigSchema(path) {
    return tryCall<GwConfigSchema | null>("config.schema.lookup", { path }, null);
  },

  async patchConfig(patch) {
    return call<GwConfigPatchResult>("config.patch", { patch });
  },

  async applyConfig() {
    return call<GwConfigApplyResult>("config.apply");
  },

  async backupConfig() {
    // Use a config.get snapshot + timestamp as backup reference.
    const config = await this.getConfig();
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const content = JSON.stringify(config, null, 2);
    const path = `~/.openclaw/backups/carapace-backup-${ts}.json`;
    return { path, createdAt: new Date().toISOString(), size: content.length };
  },

  async validateConfig(payload) {
    try {
      JSON.parse(payload);
      return { ok: true, errors: [], warnings: [] };
    } catch (e) {
      return { ok: false, errors: [e instanceof Error ? e.message : String(e)], warnings: [] };
    }
  },

  async writeConfig(payload, opts) {
    const backup = await this.backupConfig();
    const validation = await this.validateConfig(payload);
    if (!validation.ok) throw new Error(validation.errors[0]);
    const parsed = JSON.parse(payload) as Record<string, unknown>;
    const patchResult = await this.patchConfig(parsed);
    await this.applyConfig();
    return {
      ok: patchResult.ok,
      bytesWritten: payload.length,
      backup,
      audit: {
        id: crypto.randomUUID(),
        ts: new Date().toISOString(),
        summary: opts.operatorNote ?? `Config patched (${patchResult.changed?.join(", ") ?? "unknown fields"})`,
      },
    };
  },

  // Legacy config compat
  async backupOpenClawConfig() { return this.backupConfig(); },
  async validateOpenClawConfig(payload) { return this.validateConfig(payload); },
  async writeOpenClawConfig(payload, opts) {
    return this.writeConfig(payload, { operatorNote: opts.operatorNote });
  },

  async getUpdateStatus() {
    return tryCall<GwUpdateStatus>("update.status", undefined, { available: false }) ?? { available: false };
  },

  async runUpdate() {
    await call("update.run");
  },

  // ── Approvals ─────────────────────────────────────────────────────────────────

  async listExecApprovals() {
    return tryCall<GwExecApproval[]>("exec.approval.list", undefined, gw().cachedApprovals) ?? [];
  },

  async getExecApproval(id) {
    return tryCall<GwExecApproval | null>("exec.approval.get", { id }, null);
  },

  async resolveExecApproval(id, decision) {
    return call<GwExecApproval>("exec.approval.resolve", { id, decision });
  },

  async getApprovalPolicy() {
    return tryCall<GwApprovalPolicy>("exec.approvals.get", undefined, {}) ?? {};
  },

  async setApprovalPolicy(policy) {
    await call("exec.approvals.set", { policy });
  },

  async listPluginApprovals() {
    return tryCall<GwPluginApproval[]>("plugin.approval.list", undefined, []) ?? [];
  },

  async resolvePluginApproval(id, decision) {
    return call<GwPluginApproval>("plugin.approval.resolve", { id, decision });
  },

  // ── Cron ──────────────────────────────────────────────────────────────────────

  async getCronStatus() {
    return tryCall<GwCronStatus>("cron.status", undefined, { running: 0, scheduled: 0, failed: 0 }) ?? { running: 0, scheduled: 0, failed: 0 };
  },

  async listCronJobs() {
    return tryCall<GwCronJob[]>("cron.list", undefined, gw().cachedCronJobs) ?? [];
  },

  async addCronJob(params) {
    return call<GwCronJob>("cron.add", params);
  },

  async updateCronJob(id, params) {
    return call<GwCronJob>("cron.update", { id, ...params });
  },

  async removeCronJob(id) {
    await call("cron.remove", { id });
  },

  async runCronJob(id) {
    await call("cron.run", { id });
  },

  async getCronRuns(id, limit = 20) {
    return tryCall<GwCronRun[]>("cron.runs", { id, limit }, []) ?? [];
  },

  async wake(params) {
    await call("wake", params);
  },

  // ── Nodes ─────────────────────────────────────────────────────────────────────

  async listNodes() {
    return tryCall<GwNode[]>("node.list", undefined, gw().cachedNodes) ?? [];
  },

  async describeNode(id) {
    return tryCall<GwNode | null>("node.describe", { id }, null);
  },

  async renameNode(id, name) {
    await call("node.rename", { id, name });
  },

  async invokeNode(id, method, params) {
    return call("node.invoke", { id, method, params });
  },

  async drainNodeQueue(id) {
    await call("node.pending.drain", { id });
  },

  async pullNodePending(id) {
    return tryCall<GwNodePendingItem[]>("node.pending.pull", { id }, []) ?? [];
  },

  async ackNodePending(id, itemId) {
    await call("node.pending.ack", { id, itemId });
  },

  async enqueueNodePending(id, item) {
    await call("node.pending.enqueue", { id, ...item });
  },

  // ── Models / Usage / Providers ────────────────────────────────────────────────

  async listGwModels() {
    const cached = gw().cachedModels;
    if (cached.length) return cached;
    return tryCall<GwModel[]>("models.list", undefined, []) ?? [];
  },

  async getUsageStatus() {
    return tryCall<GwUsageStatus>("usage.status", undefined, {
      dailyCost: 0, monthlyCost: 0, currency: "USD",
    }) ?? { dailyCost: 0, monthlyCost: 0, currency: "USD" };
  },

  async getUsageCost(opts) {
    return tryCall<GwUsageCost>("usage.cost", opts, {
      totalCost: 0, currency: "USD", breakdown: {},
    }) ?? { totalCost: 0, currency: "USD", breakdown: {} };
  },

  async getChannelsStatus() {
    return tryCall<GwChannelStatus[]>("channels.status", undefined, []) ?? [];
  },

  async getTtsStatus() {
    return tryCall<GwTtsStatus>("tts.status", undefined, { enabled: false }) ?? { enabled: false };
  },

  async listTtsProviders() {
    return tryCall<GwTtsProvider[]>("tts.providers", undefined, []) ?? [];
  },

  async setTtsProvider(id) {
    await call("tts.setProvider", { id });
  },

  async getTalkConfig() {
    return tryCall<Record<string, unknown>>("talk.config", undefined, {}) ?? {};
  },

  async setTalkMode(mode) {
    await call("talk.mode", { mode });
  },

  // ── Tools ─────────────────────────────────────────────────────────────────────

  async getToolsCatalog() {
    return tryCall<GwToolDescriptor[]>("tools.catalog", undefined, []) ?? [];
  },

  async getEffectiveTools(agentId) {
    return tryCall<GwToolDescriptor[]>("tools.effective", agentId ? { agentId } : undefined, []) ?? [];
  },

  async invokeTool(tool, params) {
    const url = `${process.env.OPENCLAW_BASE_URL ?? "http://127.0.0.1:18789"}/tools/invoke`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.OPENCLAW_API_KEY ? { Authorization: `Bearer ${process.env.OPENCLAW_API_KEY}` } : {}),
      },
      body: JSON.stringify({ tool, params }),
    });
    if (!res.ok) throw new Error(`tools/invoke HTTP ${res.status}`);
    return res.json() as Promise<GwToolInvokeResult>;
  },

  // ── Agent registry compat ─────────────────────────────────────────────────────

  async listAgentsFromConfig() {
    const agents = await this.listGwAgents();
    return {
      source: "openclaw" as const,
      agents: agents.map((a) => ({
        rawOpenClawId: a.id,
        friendlyName: a.name,
        role: a.role,
        parentRawOpenClawId: a.parentId,
        workspacePath: a.workspacePath,
        model: a.model,
        provider: a.provider,
      })),
    };
  },

  async updateAgentAlias() {
    return { ok: true } as const;
  },

  // ── Memory ────────────────────────────────────────────────────────────────────

  async listMemorySources() {
    return useMemoryStore.getState().sources;
  },

  async searchMemory(query, opts) {
    return emptyAdapter.searchMemory(query, opts);
  },

  async createMemoryWriteCandidate(input) {
    return useMemoryStore.getState().addWriteCandidate(input);
  },

  async approveMemoryWrite(id, decision, overrideText) {
    return useMemoryStore.getState().resolveWriteCandidate(id, decision, overrideText);
  },

  // ── Snapshots ─────────────────────────────────────────────────────────────────

  async createSnapshot(input) {
    return useSnapshotStore.getState().createSnapshot(input);
  },

  async updateSnapshot(id, patch) {
    return useSnapshotStore.getState().updateSnapshot(id, patch);
  },
};
