// ─────────────────────────────────────────────────────────────────────────────
// OpenClaw Gateway WebSocket Client — server-side singleton
//
// Lives in globalThis so it survives Vite HMR module reloads in development.
// One persistent connection per Carapace process → the browser never talks
// directly to OpenClaw.
//
// Lifecycle:
//   disconnected → connecting → authenticating → ready → reconnecting → …
//
// All public RPC calls queue while connecting and are dispatched once ready.
// ─────────────────────────────────────────────────────────────────────────────

import { EventEmitter } from "node:events";
import type {
  ConnectChallenge,
  ConnectFrame,
  HelloOk,
  HelloError,
  RpcRequest,
  RpcResponse,
  GatewayEvent,
  GatewayConnectionState,
  IncomingFrame,
  GwAgent,
  GwSession,
  GwExecApproval,
  GwCronJob,
  GwNode,
  GwHealth,
  GwStatus,
  GwConfig,
  GwModel,
  GwUsageCost,
  GwUsageStatus,
} from "./protocol-types";
import { publishEvent } from "./event-bus.server";

// ── Pending RPC request ───────────────────────────────────────────────────────

interface PendingRequest {
  resolve: (result: unknown) => void;
  reject: (err: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
  method: string;
}

// ── Config ────────────────────────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 30_000;
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;
const RECONNECT_JITTER_MS = 500;

// ── Gateway client class ──────────────────────────────────────────────────────

export class GatewayClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private state: GatewayConnectionState = "disconnected";
  private pending = new Map<string, PendingRequest>();
  private reqCounter = 0;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private activeSubscriptions = new Set<string>();

  // Cached warm state (rehydrated on every connect)
  cachedAgents: GwAgent[] = [];
  cachedSessions: GwSession[] = [];
  cachedApprovals: GwExecApproval[] = [];
  cachedCronJobs: GwCronJob[] = [];
  cachedNodes: GwNode[] = [];
  cachedHealth: GwHealth | null = null;
  cachedConfig: GwConfig | null = null;
  cachedModels: GwModel[] = [];
  cachedUsageCost: GwUsageCost | null = null;
  cachedUsageStatus: GwUsageStatus | null = null;
  lastConnectedAt: string | null = null;
  connectionId: string | null = null;
  availableMethods: string[] = [];
  availableEvents: string[] = [];

  constructor(
    private readonly wsUrl: string,
    private readonly token: string,
  ) {
    super();
    this.setMaxListeners(200);
  }

  // ── State accessors ─────────────────────────────────────────────────────────

  getState(): GatewayConnectionState { return this.state; }
  isReady(): boolean { return this.state === "ready"; }
  supports(method: string): boolean {
    // If we haven't negotiated features yet, assume supported.
    return this.availableMethods.length === 0 || this.availableMethods.includes(method);
  }

  // ── Connect ─────────────────────────────────────────────────────────────────

  connect(): void {
    if (this.state === "connecting" || this.state === "authenticating" || this.state === "ready") return;
    this.setState("connecting");
    this.openSocket();
  }

  private openSocket(): void {
    try {
      const ws = new WebSocket(this.wsUrl, {
        headers: { Authorization: `Bearer ${this.token}` },
      } as unknown as Parameters<typeof WebSocket>[1]);
      this.ws = ws;

      ws.onopen = () => {
        // State transitions to authenticating; wait for challenge.
        this.setState("authenticating");
      };

      ws.onmessage = (evt: MessageEvent) => {
        this.handleMessage(evt.data as string);
      };

      ws.onerror = (evt: Event) => {
        const msg = (evt as ErrorEvent).message ?? "WebSocket error";
        this.emit("error", new Error(msg));
        this.handleDisconnect();
      };

      ws.onclose = () => {
        this.handleDisconnect();
      };
    } catch (err) {
      this.emit("error", err instanceof Error ? err : new Error(String(err)));
      this.handleDisconnect();
    }
  }

  // ── Message dispatch ─────────────────────────────────────────────────────────

  private handleMessage(raw: string): void {
    let frame: IncomingFrame;
    try {
      frame = JSON.parse(raw) as IncomingFrame;
    } catch {
      return; // ignore unparseable frames
    }

    // Handshake frames
    if ((frame as ConnectChallenge).type === "connect.challenge") {
      this.handleChallenge(frame as ConnectChallenge);
      return;
    }
    if ((frame as HelloOk).type === "hello-ok") {
      this.handleHelloOk(frame as HelloOk);
      return;
    }
    if ((frame as HelloError).type === "hello-error") {
      this.handleHelloError(frame as HelloError);
      return;
    }

    // RPC response (has an id)
    if ("id" in frame && typeof (frame as RpcResponse).id === "string") {
      this.handleRpcResponse(frame as RpcResponse);
      return;
    }

    // Push event (no id, has type)
    if ("type" in frame) {
      this.handleEvent(frame as GatewayEvent);
    }
  }

  private handleChallenge(frame: ConnectChallenge): void {
    const connect: ConnectFrame = {
      type: "connect",
      token: this.token,
      ...(frame.nonce ? { nonce: frame.nonce } : {}),
      clientId: "carapace",
      capabilities: ["god-mode", "admin"],
    };
    this.send(connect);
  }

  private handleHelloOk(frame: HelloOk): void {
    this.connectionId = frame.connectionId;
    this.availableMethods = frame.features?.methods ?? [];
    this.availableEvents = frame.features?.events ?? [];
    this.lastConnectedAt = new Date().toISOString();
    this.reconnectAttempt = 0;
    this.setState("ready");
    this.emit("ready", frame);
    // Warm state in the background; don't block callers.
    this.warmState().catch((err) => this.emit("error", err));
  }

  private handleHelloError(frame: HelloError): void {
    this.emit("auth-error", new Error(`${frame.code}: ${frame.message}`));
    // Don't reconnect on auth failures — wrong token won't fix itself.
    this.setState("disconnected");
    this.ws?.close();
    this.ws = null;
  }

  private handleRpcResponse(frame: RpcResponse): void {
    const pending = this.pending.get(frame.id);
    if (!pending) return;
    clearTimeout(pending.timeout);
    this.pending.delete(frame.id);
    if (frame.error) {
      pending.reject(new Error(`${frame.error.code}: ${frame.error.message}`));
    } else {
      pending.resolve(frame.result);
    }
  }

  private handleEvent(event: GatewayEvent): void {
    this.emit("gateway:event", event);
    publishEvent(event); // fan out to all SSE clients
    this.updateCacheFromEvent(event);
  }

  // ── Cache updates from live events ───────────────────────────────────────────

  private updateCacheFromEvent(event: GatewayEvent): void {
    switch (event.type) {
      case "sessions.changed":
        if (Array.isArray(event.data)) {
          this.cachedSessions = event.data as GwSession[];
        }
        break;
      case "health":
        if (event.data) this.cachedHealth = event.data as GwHealth;
        break;
      case "exec.approval.requested": {
        const a = event.data as GwExecApproval | undefined;
        if (a && !this.cachedApprovals.find((x) => x.id === a.id)) {
          this.cachedApprovals = [a, ...this.cachedApprovals];
        }
        break;
      }
      case "exec.approval.resolved": {
        const a = event.data as GwExecApproval | undefined;
        if (a) {
          this.cachedApprovals = this.cachedApprovals.map((x) => x.id === a.id ? a : x);
        }
        break;
      }
    }
  }

  // ── Disconnect / Reconnect ────────────────────────────────────────────────────

  private handleDisconnect(): void {
    // Reject all pending requests.
    for (const [id, req] of this.pending) {
      clearTimeout(req.timeout);
      req.reject(new Error(`Gateway disconnected while waiting for ${req.method}`));
      this.pending.delete(id);
    }
    if (this.state === "disconnected") return;
    this.ws = null;
    this.setState("reconnecting");
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    const delay = Math.min(
      RECONNECT_BASE_MS * 2 ** this.reconnectAttempt + Math.random() * RECONNECT_JITTER_MS,
      RECONNECT_MAX_MS,
    );
    this.reconnectAttempt++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.setState("connecting");
      this.openSocket();
    }, delay);
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.setState("disconnected");
    this.ws?.close();
    this.ws = null;
  }

  // ── State management ─────────────────────────────────────────────────────────

  private setState(next: GatewayConnectionState): void {
    if (this.state === next) return;
    const prev = this.state;
    this.state = next;
    this.emit("state-change", { prev, next });
    publishEvent({ type: "carapace.connection", data: { state: next, connectionId: this.connectionId } });
  }

  // ── Low-level send ────────────────────────────────────────────────────────────

  private send(payload: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  // ── RPC call ─────────────────────────────────────────────────────────────────

  call<R = unknown>(method: string, params?: unknown, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<R> {
    return new Promise<R>((resolve, reject) => {
      if (!this.isReady()) {
        // Queue: wait for ready then call.
        const onReady = () => {
          this.call<R>(method, params, timeoutMs).then(resolve).catch(reject);
        };
        this.once("ready", onReady);
        // Abandon if still not ready after 2× timeout.
        setTimeout(() => {
          this.off("ready", onReady);
          reject(new Error(`Gateway not ready for method ${method} (timeout waiting for connection)`));
        }, timeoutMs * 2);
        return;
      }

      const id = String(++this.reqCounter);
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Gateway RPC timeout: ${method} (${timeoutMs}ms)`));
      }, timeoutMs);

      this.pending.set(id, {
        resolve: resolve as (r: unknown) => void,
        reject,
        timeout,
        method,
      });

      const req: RpcRequest = { id, method, params };
      this.send(req);
    });
  }

  // ── Subscriptions ─────────────────────────────────────────────────────────────

  async subscribeSessions(): Promise<void> {
    if (this.activeSubscriptions.has("sessions")) return;
    this.activeSubscriptions.add("sessions");
    await this.call("sessions.subscribe").catch(() => {
      this.activeSubscriptions.delete("sessions");
    });
  }

  async subscribeSessionMessages(sessionKey: string): Promise<void> {
    const key = `session.messages:${sessionKey}`;
    if (this.activeSubscriptions.has(key)) return;
    this.activeSubscriptions.add(key);
    await this.call("sessions.messages.subscribe", { key: sessionKey }).catch(() => {
      this.activeSubscriptions.delete(key);
    });
  }

  async unsubscribeSessionMessages(sessionKey: string): Promise<void> {
    const key = `session.messages:${sessionKey}`;
    this.activeSubscriptions.delete(key);
    await this.call("sessions.messages.unsubscribe", { key: sessionKey }).catch(() => {});
  }

  // ── State warming (called after each successful connect) ──────────────────────

  private async warmState(): Promise<void> {
    const settled = <T>(p: Promise<T>): Promise<T | null> =>
      p.catch(() => null);

    const [health, status, agents, sessions, approvals, cronJobs, nodes, config, models, usageCost, usageStatus] =
      await Promise.all([
        settled(this.call<GwHealth>("health")),
        settled(this.call<GwStatus>("status")),
        settled(this.call<GwAgent[]>("agents.list")),
        settled(this.call<GwSession[]>("sessions.list")),
        settled(this.call<GwExecApproval[]>("exec.approval.list")),
        settled(this.call<GwCronJob[]>("cron.list")),
        settled(this.call<GwNode[]>("node.list")),
        settled(this.call<GwConfig>("config.get")),
        settled(this.call<GwModel[]>("models.list")),
        settled(this.call<GwUsageCost>("usage.cost")),
        settled(this.call<GwUsageStatus>("usage.status")),
      ]);

    if (health) this.cachedHealth = health;
    if (agents) this.cachedAgents = agents;
    if (sessions) this.cachedSessions = sessions;
    if (approvals) this.cachedApprovals = approvals;
    if (cronJobs) this.cachedCronJobs = cronJobs;
    if (nodes) this.cachedNodes = nodes;
    if (config) this.cachedConfig = config;
    if (models) this.cachedModels = models;
    if (usageCost) this.cachedUsageCost = usageCost;
    if (usageStatus) this.cachedUsageStatus = usageStatus;

    // Set up global session index subscription.
    await this.subscribeSessions().catch(() => {});

    // Publish warm state to all SSE clients.
    publishEvent({
      type: "carapace.warm-state",
      data: {
        health: this.cachedHealth,
        agents: this.cachedAgents,
        sessions: this.cachedSessions,
        approvals: this.cachedApprovals,
        cronJobs: this.cachedCronJobs,
        nodes: this.cachedNodes,
        config: this.cachedConfig,
        models: this.cachedModels,
        usageCost: this.cachedUsageCost,
        usageStatus: this.cachedUsageStatus,
        connectionId: this.connectionId,
        connectedAt: this.lastConnectedAt,
      },
    });

    void status; // available via cached health/status if needed
    this.emit("warm", {
      agents: this.cachedAgents,
      sessions: this.cachedSessions,
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Singleton management
// ─────────────────────────────────────────────────────────────────────────────

declare global {
  // eslint-disable-next-line no-var
  var __carapaceGatewayClient: GatewayClient | undefined;
}

let _autoConnectScheduled = false;

export function getGatewayClient(): GatewayClient {
  if (!globalThis.__carapaceGatewayClient) {
    const url = process.env.OPENCLAW_GATEWAY_URL ?? process.env.OPENCLAW_BASE_URL ?? "ws://127.0.0.1:18789";
    const token = process.env.OPENCLAW_GATEWAY_TOKEN ?? "";
    // Swap ws: → wss: if the base URL is already https.
    const wsUrl = url.replace(/^http/, "ws");
    const client = new GatewayClient(wsUrl, token);
    globalThis.__carapaceGatewayClient = client;
  }
  return globalThis.__carapaceGatewayClient;
}

/** Call this once at server startup (or lazily on first request in gateway mode). */
export function ensureGatewayConnected(): GatewayClient {
  const client = getGatewayClient();
  if (!_autoConnectScheduled && client.getState() === "disconnected") {
    _autoConnectScheduled = true;
    client.connect();
  }
  return client;
}
