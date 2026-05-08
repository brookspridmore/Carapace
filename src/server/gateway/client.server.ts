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
  HelloOk,
  HelloError,
  RpcResponse,
  GatewayEvent,
  GatewayConnectionState,
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
    // Prevent unhandled "error" events from crashing Node.
    this.on("error", (err: Error) => {
      console.error("[carapace:gw] client error:", err.message);
    });
    this.on("auth-error", (err: Error) => {
      console.error("[carapace:gw] auth error:", err.message);
    });
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
    console.log(`[carapace:gw] connecting to ${this.wsUrl} (token: ${this.token ? "set" : "empty"})`);
    try {
      const ws = new WebSocket(this.wsUrl, {
        headers: { Authorization: `Bearer ${this.token}` },
      } as unknown as Parameters<typeof WebSocket>[1]);
      this.ws = ws;

      ws.onopen = () => {
        console.log("[carapace:gw] WebSocket open — waiting for server challenge");
        this.setState("authenticating");
      };

      ws.onmessage = (evt: MessageEvent) => {
        // Log every raw frame during handshake so we can verify the protocol.
        if (this.state !== "ready") {
          console.log("[carapace:gw] frame (pre-ready):", String(evt.data).slice(0, 500));
        }
        this.handleMessage(evt.data as string);
      };

      ws.onerror = (evt: Event) => {
        const msg = (evt as ErrorEvent).message ?? "WebSocket error";
        console.error("[carapace:gw] WebSocket error:", msg);
        this.emit("error", new Error(msg));
        this.handleDisconnect();
      };

      ws.onclose = (evt: CloseEvent) => {
        console.log(`[carapace:gw] WebSocket closed — code=${(evt as CloseEvent).code} reason=${(evt as CloseEvent).reason} state-was=${this.state}`);
        this.handleDisconnect();
      };
    } catch (err) {
      console.error("[carapace:gw] failed to create WebSocket:", err);
      this.emit("error", err instanceof Error ? err : new Error(String(err)));
      this.handleDisconnect();
    }
  }

  // ── Message dispatch ─────────────────────────────────────────────────────────

  private handleMessage(raw: string): void {
    let frame: Record<string, unknown>;
    try {
      frame = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      console.warn("[carapace:gw] unparseable frame:", String(raw).slice(0, 200));
      return; // ignore unparseable frames
    }

    // Real OpenClaw protocol wraps server→client pushes as:
    //   { type: "event", event: "<name>", payload: {...} }
    if (frame.type === "event" && typeof frame.event === "string") {
      const eventName = frame.event;
      const payload = (frame.payload ?? {}) as Record<string, unknown>;

      if (eventName === "connect.challenge") {
        console.log("[carapace:gw] received connect.challenge — sending connect event");
        this.handleChallenge(payload);
        return;
      }

      // Auth success — server may use any of these event names.
      if (eventName === "hello-ok" || eventName === "connect.ok" || eventName === "authenticated") {
        console.log(`[carapace:gw] received ${eventName} — connection ready`);
        const features = (payload.features ?? {}) as { methods?: string[]; events?: string[] };
        this.handleHelloOk({
          type: "hello-ok",
          connectionId: typeof payload.connectionId === "string" ? payload.connectionId : "",
          protocolVersion: typeof payload.protocolVersion === "string" ? payload.protocolVersion : "",
          features: { methods: features.methods ?? [], events: features.events ?? [] },
          snapshot: payload.snapshot as Record<string, unknown> | undefined,
        });
        return;
      }

      // Auth failure.
      if (eventName === "hello-error" || eventName === "connect.error" || eventName === "auth.error") {
        console.error(`[carapace:gw] received ${eventName}:`, payload);
        this.handleHelloError({
          type: "hello-error",
          code: typeof payload.code === "string" ? payload.code : "unknown",
          message: typeof payload.message === "string" ? payload.message : JSON.stringify(payload),
        });
        return;
      }

      // Translate to legacy GatewayEvent shape so downstream handlers (cache,
      // SSE bus) keep working unchanged.
      this.handleEvent({
        type: eventName,
        data: payload,
        sessionKey: typeof frame.sessionKey === "string" ? frame.sessionKey : undefined,
        agentId: typeof frame.agentId === "string" ? frame.agentId : undefined,
        ts: typeof frame.ts === "string" ? frame.ts : undefined,
      } as GatewayEvent);
      return;
    }

    // Legacy handshake frames (kept for compatibility / older gateways)
    if (frame.type === "connect.challenge") {
      console.log("[carapace:gw] received legacy connect.challenge — sending connect RPC");
      this.handleChallenge(frame as Record<string, unknown>);
      return;
    }
    if (frame.type === "hello-ok") {
      console.log("[carapace:gw] received legacy hello-ok — connection ready");
      this.handleHelloOk(frame as unknown as HelloOk);
      return;
    }
    if (frame.type === "hello-error") {
      this.handleHelloError(frame as unknown as HelloError);
      return;
    }

    // RPC response. The real protocol wraps responses as
    //   { type: "response", id, result?, error? }
    // but legacy gateways send bare { id, result, error }.
    if (frame.type === "response" && typeof frame.id === "string") {
      this.handleRpcResponse(frame as unknown as RpcResponse);
      return;
    }
    if ("id" in frame && typeof frame.id === "string") {
      this.handleRpcResponse(frame as unknown as RpcResponse);
      return;
    }

    // Unrecognised — log during handshake to help diagnose protocol drift.
    if (this.state !== "ready") {
      console.warn("[carapace:gw] unrecognised frame during handshake:", String(raw).slice(0, 300));
    }
  }

  private handleChallenge(payload: Record<string, unknown>): void {
    // Mirror the server's event-envelope format for the connect reply.
    // Send only token + nonce; avoid unknown fields that may trigger rejection.
    const connectPayload: Record<string, unknown> = { token: this.token };
    if (typeof payload.nonce === "string") connectPayload.nonce = payload.nonce;

    const frame = { type: "event", event: "connect", payload: connectPayload };
    console.log("[carapace:gw] sending connect event:", JSON.stringify(frame));
    this.send(frame);

    // Auth timeout — if the server doesn't respond within 30 s, give up.
    const authTimeout = setTimeout(() => {
      if (this.state === "authenticating") {
        console.error("[carapace:gw] connect auth timed out");
        this.handleHelloError({ type: "hello-error", code: "timeout", message: "auth timed out" });
      }
    }, DEFAULT_TIMEOUT_MS);
    this.once("ready", () => clearTimeout(authTimeout));
    this.once("auth-error", () => clearTimeout(authTimeout));
  }

  private handleHelloOk(frame: HelloOk): void {
    this.connectionId = frame.connectionId;
    this.availableMethods = frame.features?.methods ?? [];
    this.availableEvents = frame.features?.events ?? [];
    this.lastConnectedAt = new Date().toISOString();
    this.reconnectAttempt = 0;
    console.log(`[carapace:gw] ready — connectionId=${frame.connectionId} methods=${this.availableMethods.length} events=${this.availableEvents.length}`);
    this.setState("ready");
    this.emit("ready", frame);
    // Warm state in the background; don't block callers.
    this.warmState().catch((err) => this.emit("error", err));
  }

  private handleHelloError(frame: HelloError): void {
    console.error(`[carapace:gw] hello-error: ${frame.code}: ${frame.message}`);
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

      this.send({ type: "request", id, method, params });
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
