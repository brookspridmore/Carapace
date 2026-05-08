import { useEffect, useState } from "react";
import { getOpenClawStatus } from "@/lib/openclaw-client";

export type OpenClawConnection = "mock" | "connected" | "unreachable" | "no-data";
export type OpenClawMode = "mock" | "readonly" | "live";

export interface OpenClawStatus {
  mode: OpenClawMode;
  baseUrl: string;
  gatewayTokenConfigured: boolean;
  connection: OpenClawConnection;
  lastError: string | null;
  lastFetch: {
    url: string | null;
    ok: boolean;
    status: number | null;
    startedAt: string | null;
    finishedAt: string | null;
    latencyMs: number | null;
    error: string | null;
    rawPreview: string | null;
  };
}

const FALLBACK: OpenClawStatus = {
  mode: "mock",
  baseUrl: "",
  gatewayTokenConfigured: false,
  connection: "mock",
  lastError: null,
  lastFetch: {
    url: null, ok: false, status: null, startedAt: null,
    finishedAt: null, latencyMs: null, error: null, rawPreview: null,
  },
};

// Tiny module-level cache so every consumer doesn't refetch on mount.
let cached: OpenClawStatus | null = null;
let inflight: Promise<OpenClawStatus> | null = null;
const subscribers = new Set<(s: OpenClawStatus) => void>();

async function fetchStatus(): Promise<OpenClawStatus> {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const s = (await getOpenClawStatus()) as OpenClawStatus;
      cached = s;
      subscribers.forEach((fn) => fn(s));
      return s;
    } catch {
      cached = FALLBACK;
      return FALLBACK;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export function useOpenClawStatus(pollMs = 15000): OpenClawStatus {
  const [status, setStatus] = useState<OpenClawStatus>(cached ?? FALLBACK);
  useEffect(() => {
    let cancelled = false;
    const tick = () => {
      fetchStatus().then((s) => {
        if (!cancelled) setStatus(s);
      });
    };
    tick();
    const sub = (s: OpenClawStatus) => { if (!cancelled) setStatus(s); };
    subscribers.add(sub);
    const id = window.setInterval(tick, pollMs);
    return () => {
      cancelled = true;
      subscribers.delete(sub);
      window.clearInterval(id);
    };
  }, [pollMs]);
  return status;
}

export function refreshOpenClawStatus(): Promise<OpenClawStatus> {
  return fetchStatus();
}