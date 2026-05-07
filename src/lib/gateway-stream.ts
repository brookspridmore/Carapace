// ─────────────────────────────────────────────────────────────────────────────
// useGatewayStream — browser hook that subscribes to /api/stream (SSE)
// and hydrates the gateway Zustand store.
//
// Mount this ONCE in the app root (e.g. __root.tsx) — NOT in every component.
// All components read from useGatewayStore() directly.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef } from "react";
import { useGatewayStore } from "@/lib/gateway-store";
import type {
  GwSession,
  GwAgent,
  GwExecApproval,
  GwCronJob,
  GwHealth,
  GwConfig,
  GwUsageCost,
  GwUsageStatus,
  GwMessage,
  GatewayConnectionState,
} from "@/server/gateway/protocol-types";

interface SseEvent {
  type: string;
  data?: unknown;
  sessionKey?: string;
  agentId?: string;
  ts?: string;
}

const RECONNECT_BASE = 1_000;
const RECONNECT_MAX = 30_000;

export function useGatewayStream(): void {
  const store = useGatewayStore;
  const attempt = useRef(0);
  const esRef = useRef<EventSource | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;

    function connect() {
      if (cancelled) return;
      const es = new EventSource("/api/stream");
      esRef.current = es;

      es.onopen = () => {
        attempt.current = 0;
        store.getState().setConnectionState("ready" as GatewayConnectionState);
      };

      es.onmessage = (evt) => {
        let parsed: SseEvent;
        try {
          parsed = JSON.parse(evt.data as string) as SseEvent;
        } catch {
          return;
        }
        handleEvent(parsed, store.getState());
      };

      es.onerror = () => {
        es.close();
        esRef.current = null;
        store.getState().setConnectionState("sse-disconnected");
        if (!cancelled) scheduleReconnect();
      };
    }

    function scheduleReconnect() {
      const delay = Math.min(RECONNECT_BASE * 2 ** attempt.current, RECONNECT_MAX);
      attempt.current++;
      timerRef.current = setTimeout(() => {
        if (!cancelled) connect();
      }, delay);
    }

    connect();

    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      esRef.current?.close();
      esRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}

// ── Event router ──────────────────────────────────────────────────────────────

function handleEvent(event: SseEvent, state: ReturnType<typeof useGatewayStore.getState>): void {
  switch (event.type) {

    // ── Carapace synthetic events ──────────────────────────────────────────

    case "carapace.connected":
      state.setConnectionState("ready" as GatewayConnectionState);
      break;

    case "carapace.connection": {
      const d = event.data as { state: GatewayConnectionState };
      if (d?.state) state.setConnectionState(d.state);
      break;
    }

    case "carapace.warm-state": {
      type WarmData = {
        agents?: GwAgent[];
        sessions?: GwSession[];
        approvals?: GwExecApproval[];
        cronJobs?: GwCronJob[];
        nodes?: never[];
        models?: never[];
        config?: GwConfig;
        health?: GwHealth;
        usageCost?: GwUsageCost;
        usageStatus?: GwUsageStatus;
        connectionId?: string;
        connectedAt?: string;
      };
      state.hydrateWarmState(event.data as WarmData);
      break;
    }

    // ── Session events ────────────────────────────────────────────────────

    case "sessions.changed": {
      const sessions = event.data as GwSession[] | undefined;
      if (Array.isArray(sessions)) {
        sessions.forEach((s) => state.upsertSession(s));
      }
      break;
    }

    case "session.message": {
      const msg = event.data as GwMessage | undefined;
      if (msg && event.sessionKey) {
        state.appendMessage(event.sessionKey, msg);
        // Update session preview.
        if (msg.content) {
          state.upsertSession({
            key: event.sessionKey,
            agentId: event.agentId ?? "",
            status: "running",
            preview: msg.content.slice(0, 120),
            createdAt: msg.ts,
            updatedAt: msg.ts,
          });
        }
      }
      break;
    }

    case "session.tool": {
      const d = event.data as { tool: string; status: string } | undefined;
      if (d && event.sessionKey) {
        state.appendToolEvent({
          sessionKey: event.sessionKey,
          tool: d.tool,
          status: d.status,
          ts: event.ts ?? new Date().toISOString(),
        });
      }
      break;
    }

    // ── Approval events ───────────────────────────────────────────────────

    case "exec.approval.requested":
    case "exec.approval.resolved": {
      const approval = event.data as GwExecApproval | undefined;
      if (approval?.id) state.upsertExecApproval(approval);
      break;
    }

    // ── Health ────────────────────────────────────────────────────────────

    case "health": {
      const h = event.data as GwHealth | undefined;
      if (h) state.setHealth(h);
      break;
    }

    // ── Cron ──────────────────────────────────────────────────────────────

    case "cron": {
      const job = event.data as GwCronJob | undefined;
      if (job?.id) state.upsertCronJob(job);
      break;
    }

    // ── Usage tick ────────────────────────────────────────────────────────

    case "usage.tick": {
      const cost = event.data as GwUsageCost | undefined;
      if (cost) state.setUsageCost(cost);
      break;
    }

    // ── Log stream ────────────────────────────────────────────────────────

    case "log":
    case "sys.log": {
      const d = event.data as { level?: string; message?: string } | undefined;
      if (d?.message) {
        state.appendLog({
          id: crypto.randomUUID(),
          ts: event.ts ?? new Date().toISOString(),
          level: d.level ?? "info",
          message: d.message,
          agentId: event.agentId,
          sessionKey: event.sessionKey,
        });
      }
      break;
    }

    // ── Shutdown ──────────────────────────────────────────────────────────

    case "shutdown":
      state.setConnectionState("disconnected" as GatewayConnectionState);
      break;

    default:
      // Unknown event — no-op.
      break;
  }
}
