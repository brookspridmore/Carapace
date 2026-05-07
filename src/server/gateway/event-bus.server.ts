// ─────────────────────────────────────────────────────────────────────────────
// Server-side event bus — fans gateway events out to SSE clients.
//
// The gateway client calls publishEvent() on every incoming push frame.
// The SSE route creates an EventSource-style ReadableStream per browser tab
// and subscribes via subscribeToEvents().
// ─────────────────────────────────────────────────────────────────────────────

import { EventEmitter } from "node:events";

declare global {
  // eslint-disable-next-line no-var
  var __carapaceEventBus: EventEmitter | undefined;
}

function getBus(): EventEmitter {
  if (!globalThis.__carapaceEventBus) {
    const bus = new EventEmitter();
    bus.setMaxListeners(500); // one listener per open browser tab
    globalThis.__carapaceEventBus = bus;
  }
  return globalThis.__carapaceEventBus;
}

const EVENT_CHANNEL = "gw";

/** Called by the gateway client on every incoming event (and synthetic ones). */
export function publishEvent(event: unknown): void {
  getBus().emit(EVENT_CHANNEL, event);
}

/**
 * Subscribe to all gateway events.
 * @returns Unsubscribe function — call it when the SSE connection closes.
 */
export function subscribeToEvents(handler: (event: unknown) => void): () => void {
  const bus = getBus();
  bus.on(EVENT_CHANNEL, handler);
  return () => bus.off(EVENT_CHANNEL, handler);
}

/** How many SSE clients are currently subscribed. */
export function listenerCount(): number {
  return getBus().listenerCount(EVENT_CHANNEL);
}
