// ─────────────────────────────────────────────────────────────────────────────
// Gateway Zustand store — live OpenClaw state, hydrated from SSE stream.
//
// Import useGatewayStore in any component to read real-time data.
// Call useGatewayStream() once at the app root to keep it hydrated.
// ─────────────────────────────────────────────────────────────────────────────

import { create } from "zustand";
import type {
  GwSession,
  GwAgent,
  GwExecApproval,
  GwPluginApproval,
  GwCronJob,
  GwNode,
  GwModel,
  GwHealth,
  GwStatus,
  GwConfig,
  GwUsageCost,
  GwUsageStatus,
  GwMessage,
  GatewayConnectionState,
} from "@/server/gateway/protocol-types";

export interface LogLine {
  id: string;
  ts: string;
  level: "debug" | "info" | "warn" | "error" | string;
  message: string;
  agentId?: string;
  sessionKey?: string;
}

export interface GatewayState {
  // Connection
  connectionState: GatewayConnectionState | "sse-disconnected";
  connectionId: string | null;
  connectedAt: string | null;
  mode: string;

  // Core entities
  agents: GwAgent[];
  sessions: GwSession[];
  execApprovals: GwExecApproval[];
  pluginApprovals: GwPluginApproval[];
  cronJobs: GwCronJob[];
  nodes: GwNode[];
  models: GwModel[];

  // Usage / costs
  usageCost: GwUsageCost | null;
  usageStatus: GwUsageStatus | null;

  // Config
  config: GwConfig | null;

  // Health
  health: GwHealth | null;
  status: GwStatus | null;

  // Live log lines (capped at 1000)
  logs: LogLine[];

  // Per-session message cache (key → messages)
  sessionMessages: Record<string, GwMessage[]>;

  // Pending tool events
  toolEvents: Array<{ sessionKey: string; tool: string; status: string; ts: string }>;

  // Approval badge count
  pendingApprovalCount: number;

  // Actions
  setConnectionState: (state: GatewayConnectionState | "sse-disconnected") => void;
  hydrateWarmState: (data: WarmStatePayload) => void;
  upsertSession: (session: GwSession) => void;
  removeSession: (key: string) => void;
  upsertAgent: (agent: GwAgent) => void;
  appendMessage: (sessionKey: string, message: GwMessage) => void;
  upsertExecApproval: (approval: GwExecApproval) => void;
  upsertCronJob: (job: GwCronJob) => void;
  appendLog: (line: LogLine) => void;
  appendToolEvent: (event: { sessionKey: string; tool: string; status: string; ts: string }) => void;
  setConfig: (config: GwConfig) => void;
  setHealth: (health: GwHealth) => void;
  setUsageCost: (cost: GwUsageCost) => void;
  setUsageStatus: (status: GwUsageStatus) => void;
}

interface WarmStatePayload {
  agents?: GwAgent[];
  sessions?: GwSession[];
  approvals?: GwExecApproval[];
  cronJobs?: GwCronJob[];
  nodes?: GwNode[];
  models?: GwModel[];
  config?: GwConfig;
  health?: GwHealth;
  usageCost?: GwUsageCost;
  usageStatus?: GwUsageStatus;
  connectionId?: string;
  connectedAt?: string;
}

const MAX_LOGS = 1_000;

export const useGatewayStore = create<GatewayState>((set) => ({
  connectionState: "sse-disconnected",
  connectionId: null,
  connectedAt: null,
  mode: "mock",

  agents: [],
  sessions: [],
  execApprovals: [],
  pluginApprovals: [],
  cronJobs: [],
  nodes: [],
  models: [],

  usageCost: null,
  usageStatus: null,
  config: null,
  health: null,
  status: null,

  logs: [],
  sessionMessages: {},
  toolEvents: [],
  pendingApprovalCount: 0,

  setConnectionState: (state) => set({ connectionState: state }),

  hydrateWarmState: (data) =>
    set((s) => ({
      agents: data.agents ?? s.agents,
      sessions: data.sessions ?? s.sessions,
      execApprovals: data.approvals ?? s.execApprovals,
      cronJobs: data.cronJobs ?? s.cronJobs,
      nodes: data.nodes ?? s.nodes,
      models: data.models ?? s.models,
      config: data.config ?? s.config,
      health: data.health ?? s.health,
      usageCost: data.usageCost ?? s.usageCost,
      usageStatus: data.usageStatus ?? s.usageStatus,
      connectionId: data.connectionId ?? s.connectionId,
      connectedAt: data.connectedAt ?? s.connectedAt,
      pendingApprovalCount: (data.approvals ?? s.execApprovals).filter((a) => a.status === "pending").length,
    })),

  upsertSession: (session) =>
    set((s) => {
      const existing = s.sessions.findIndex((x) => x.key === session.key);
      const sessions = existing >= 0
        ? s.sessions.map((x) => x.key === session.key ? session : x)
        : [session, ...s.sessions];
      return { sessions };
    }),

  removeSession: (key) =>
    set((s) => ({ sessions: s.sessions.filter((x) => x.key !== key) })),

  upsertAgent: (agent) =>
    set((s) => {
      const existing = s.agents.findIndex((x) => x.id === agent.id);
      const agents = existing >= 0
        ? s.agents.map((x) => x.id === agent.id ? agent : x)
        : [agent, ...s.agents];
      return { agents };
    }),

  appendMessage: (sessionKey, message) =>
    set((s) => {
      const prev = s.sessionMessages[sessionKey] ?? [];
      // Deduplicate by id.
      if (prev.find((m) => m.id === message.id)) return s;
      return {
        sessionMessages: {
          ...s.sessionMessages,
          [sessionKey]: [...prev, message],
        },
      };
    }),

  upsertExecApproval: (approval) =>
    set((s) => {
      const existing = s.execApprovals.findIndex((x) => x.id === approval.id);
      const execApprovals = existing >= 0
        ? s.execApprovals.map((x) => x.id === approval.id ? approval : x)
        : [approval, ...s.execApprovals];
      return {
        execApprovals,
        pendingApprovalCount: execApprovals.filter((a) => a.status === "pending").length,
      };
    }),

  upsertCronJob: (job) =>
    set((s) => {
      const existing = s.cronJobs.findIndex((x) => x.id === job.id);
      const cronJobs = existing >= 0
        ? s.cronJobs.map((x) => x.id === job.id ? job : x)
        : [job, ...s.cronJobs];
      return { cronJobs };
    }),

  appendLog: (line) =>
    set((s) => ({
      logs: [...s.logs.slice(-(MAX_LOGS - 1)), line],
    })),

  appendToolEvent: (event) =>
    set((s) => ({
      toolEvents: [...s.toolEvents.slice(-199), event],
    })),

  setConfig: (config) => set({ config }),
  setHealth: (health) => set({ health }),
  setUsageCost: (usageCost) => set({ usageCost }),
  setUsageStatus: (usageStatus) => set({ usageStatus }),
}));
