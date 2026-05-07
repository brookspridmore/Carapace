// ─────────────────────────────────────────────────────────────────────────────
// OpenClaw Gateway WebSocket Protocol – TypeScript types
//
// Source: Henri audit of live OpenClaw instance, May 2026.
//
// Handshake flow (all frames are JSON text):
//   1. WS open → server sends ConnectChallenge
//   2. Client responds with ConnectFrame
//   3. Server sends HelloOk (or HelloError)
//   4. Normal RPC + event stream begins
//
// RPC pattern:
//   Client → { id, method, params? }
//   Server → { id, result } | { id, error }
//
// Events (push, no id):
//   Server → { type, data?, sessionKey?, agentId?, ts? }
//
// NOTE: Exact field names were inferred from the protocol description and
// are marked with @verify where testing against the live gateway may require
// minor adjustments.
// ─────────────────────────────────────────────────────────────────────────────

// ── Handshake ────────────────────────────────────────────────────────────────

/** First frame the server sends on WS open. @verify nonce field name */
export interface ConnectChallenge {
  type: "connect.challenge";
  nonce?: string;
  protocolVersion?: string;
}

/** First frame the client must send. */
export interface ConnectFrame {
  type: "connect";
  token: string;
  /** Echo server nonce if provided in the challenge. */
  nonce?: string;
  clientId?: string;
  capabilities?: string[];
}

/** Successful auth response. Features list drives feature detection. */
export interface HelloOk {
  type: "hello-ok";
  connectionId: string;
  protocolVersion: string;
  features: {
    methods: string[];
    events: string[];
  };
  /** Optional initial state snapshot included by gateway. */
  snapshot?: Record<string, unknown>;
  auth?: Record<string, unknown>;
  policy?: Record<string, unknown>;
}

export interface HelloError {
  type: "hello-error";
  code: string;
  message: string;
}

// ── RPC ──────────────────────────────────────────────────────────────────────

export interface RpcRequest<P = unknown> {
  id: string;
  method: string;
  params?: P;
}

export interface RpcResponse<R = unknown> {
  id: string;
  result?: R;
  error?: RpcError;
}

export interface RpcError {
  code: string;
  message: string;
  data?: unknown;
}

// ── Gateway events (push, no id) ─────────────────────────────────────────────

export type KnownGatewayEventType =
  | "sessions.changed"
  | "session.message"
  | "session.tool"
  | "chat"
  | "presence"
  | "tick"
  | "health"
  | "heartbeat"
  | "cron"
  | "shutdown"
  | "exec.approval.requested"
  | "exec.approval.resolved"
  | "update.progress"
  | "node.changed"
  | "usage.tick";

export interface GatewayEvent<D = unknown> {
  type: KnownGatewayEventType | string;
  data?: D;
  sessionKey?: string;
  agentId?: string;
  ts?: string;
}

// ── Incoming frame discriminated union ───────────────────────────────────────

export type IncomingFrame =
  | ConnectChallenge
  | HelloOk
  | HelloError
  | RpcResponse
  | GatewayEvent;

// ─────────────────────────────────────────────────────────────────────────────
// Domain entity types (response shapes for each RPC method)
// ─────────────────────────────────────────────────────────────────────────────

// ── Sessions ─────────────────────────────────────────────────────────────────

export interface GwSession {
  key: string;
  agentId: string;
  status: "idle" | "running" | "waiting" | "done" | "error" | string;
  preview?: string;
  title?: string;
  createdAt: string;
  updatedAt: string;
  messageCount?: number;
  parentKey?: string;
  channel?: string;
  /** Peer (e.g. Telegram user id) for channel-scoped sessions. */
  peer?: string;
  metadata?: Record<string, unknown>;
}

export interface GwMessage {
  id: string;
  sessionKey: string;
  role: "user" | "assistant" | "tool" | "system";
  content: string;
  ts: string;
  cost?: number;
  inputTokens?: number;
  outputTokens?: number;
  model?: string;
  provider?: string;
  toolName?: string;
  toolInput?: unknown;
  toolResult?: unknown;
  thinking?: string;
}

export interface GwSessionPreview {
  key: string;
  agentId: string;
  preview?: string;
  status?: string;
  updatedAt?: string;
}

export interface GwSessionDescription {
  key: string;
  agentId: string;
  status: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface GwChatHistory {
  messages: GwMessage[];
  hasMore?: boolean;
  nextCursor?: string;
}

// ── Agents ────────────────────────────────────────────────────────────────────

export interface GwAgent {
  id: string;
  name?: string;
  role?: string;
  model?: string;
  provider?: string;
  parentId?: string;
  status?: string;
  workspacePath?: string;
  bootstrapFiles?: string[];
  memoryPath?: string;
  createdAt?: string;
  updatedAt?: string;
  metadata?: Record<string, unknown>;
}

export interface GwAgentIdentity {
  id: string;
  name: string;
  persona?: string;
  role?: string;
  capabilities?: string[];
}

export interface GwAgentFile {
  path: string;
  content: string;
  size?: number;
  updatedAt?: string;
}

export interface GwAgentFileEntry {
  path: string;
  size?: number;
  updatedAt?: string;
}

// ── Config ────────────────────────────────────────────────────────────────────

export type GwConfig = Record<string, unknown>;

export type GwConfigSchema = Record<string, {
  type: string;
  description?: string;
  default?: unknown;
  enum?: unknown[];
  required?: boolean;
  properties?: Record<string, unknown>;
}>;

export interface GwConfigPatchResult {
  ok: boolean;
  changed: string[];
}

export interface GwConfigApplyResult {
  ok: boolean;
  restarted?: boolean;
  message?: string;
}

// ── Approvals ─────────────────────────────────────────────────────────────────

export interface GwExecApproval {
  id: string;
  agentId: string;
  sessionKey?: string;
  tool: string;
  input: Record<string, unknown>;
  status: "pending" | "approved" | "denied" | "expired" | string;
  requestedAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
  expiresAt?: string;
}

export interface GwPluginApproval {
  id: string;
  agentId?: string;
  plugin: string;
  action: string;
  params: Record<string, unknown>;
  status: "pending" | "approved" | "denied" | string;
  requestedAt: string;
  resolvedAt?: string;
}

export interface GwApprovalPolicy {
  autoApprove?: string[];
  autoDeny?: string[];
  requireApproval?: string[];
  [key: string]: unknown;
}

// ── Cron ──────────────────────────────────────────────────────────────────────

export interface GwCronJob {
  id: string;
  name?: string;
  schedule: string;
  agentId: string;
  message: string;
  enabled: boolean;
  lastRun?: string;
  nextRun?: string;
  status?: "ok" | "error" | "running" | string;
}

export interface GwCronRun {
  id: string;
  cronId: string;
  startedAt: string;
  finishedAt?: string;
  status: "running" | "done" | "error" | string;
  error?: string;
}

export interface GwCronStatus {
  running: number;
  scheduled: number;
  failed: number;
}

// ── Nodes ──────────────────────────────────────────────────────────────────────

export interface GwNode {
  id: string;
  name?: string;
  hostname?: string;
  status: "online" | "offline" | "unknown" | string;
  capabilities?: string[];
  lastSeen?: string;
  metadata?: Record<string, unknown>;
}

export interface GwNodePendingItem {
  id: string;
  method: string;
  params?: unknown;
  enqueuedAt: string;
}

// ── Models / Usage / Providers ────────────────────────────────────────────────

export interface GwModel {
  id: string;
  provider: string;
  name: string;
  contextWindow?: number;
  inputPricePer1k?: number;
  outputPricePer1k?: number;
  capabilities?: string[];
  available?: boolean;
}

export interface GwUsageCost {
  totalCost: number;
  currency: string;
  period?: string;
  breakdown: Record<string, {
    inputTokens: number;
    outputTokens: number;
    cost: number;
  }>;
}

export interface GwUsageStatus {
  dailyCost: number;
  monthlyCost: number;
  dailyBudget?: number;
  monthlyBudget?: number;
  currency: string;
  period?: string;
}

export interface GwChannelStatus {
  id: string;
  type: string;
  status: "ok" | "error" | "disabled" | string;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface GwTtsProvider {
  id: string;
  name: string;
  active: boolean;
  voices?: string[];
}

export interface GwTtsStatus {
  enabled: boolean;
  activeProvider?: string;
  mode?: string;
}

// ── Health / Status ───────────────────────────────────────────────────────────

export interface GwHealth {
  ok: boolean;
  uptime?: number;
  version?: string;
  gatewayId?: string;
  build?: string;
}

export interface GwStatus {
  agentCount?: number;
  activeSessions?: number;
  pendingApprovals?: number;
  cronJobs?: number;
  agents?: Array<{ id: string; status: string }>;
  [key: string]: unknown;
}

export interface GwSystemPresence {
  connected: boolean;
  clientCount?: number;
  gatewayVersion?: string;
}

// ── Tools ────────────────────────────────────────────────────────────────────

export interface GwToolDescriptor {
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
  denied?: boolean;
  category?: string;
}

export interface GwToolInvokeResult {
  output?: unknown;
  error?: string;
  durationMs?: number;
}

// ── Update ────────────────────────────────────────────────────────────────────

export interface GwUpdateStatus {
  available: boolean;
  currentVersion?: string;
  latestVersion?: string;
  changelog?: string;
}

// ── Connection state (Carapace internal, not a gateway type) ─────────────────

export type GatewayConnectionState =
  | "disconnected"
  | "connecting"
  | "authenticating"
  | "ready"
  | "reconnecting";
