// Lightweight in-process telemetry for the OpenClaw readonly adapter.
// Exposed to the UI via the ocStatus server function and the Settings
// Debug panel. Resets on each Worker cold start, which is fine for a
// "last fetch" indicator.

export interface FetchTelemetry {
  url: string | null;
  ok: boolean;
  status: number | null;
  startedAt: string | null;
  finishedAt: string | null;
  latencyMs: number | null;
  error: string | null;
  rawPreview: string | null; // first ~512 chars of last response body
}

let last: FetchTelemetry = {
  url: null,
  ok: false,
  status: null,
  startedAt: null,
  finishedAt: null,
  latencyMs: null,
  error: null,
  rawPreview: null,
};

export function recordFetch(t: FetchTelemetry) {
  last = t;
}

export function getLastFetch(): FetchTelemetry {
  return last;
}