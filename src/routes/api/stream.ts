// ─────────────────────────────────────────────────────────────────────────────
// GET /api/stream — Server-Sent Events relay.
//
// Each browser tab opens one persistent EventSource to this endpoint.
// The gateway client's events (and synthetic Carapace events) are fanned out
// here in real time.
//
// Browser receives newline-delimited SSE frames:
//   data: <JSON>\n\n
//
// The client closes the EventSource on unmount; the request's abort signal
// triggers cleanup of the server-side subscription.
// ─────────────────────────────────────────────────────────────────────────────

import { createAPIFileRoute } from "@tanstack/react-start/api";

export const APIRoute = createAPIFileRoute("/api/stream")({
  GET: async ({ request }) => {
    // Lazily import server-only modules inside the handler.
    const { subscribeToEvents } = await import("@/server/gateway/event-bus.server");
    const { ensureGatewayConnected } = await import("@/server/gateway/client.server");
    const { getOpenClawMode } = await import("@/server/openclaw.server");

    const mode = getOpenClawMode();

    // In gateway mode: ensure the WS connection is alive before streaming.
    if (mode === "gateway") {
      ensureGatewayConnected();
    }

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      start(controller) {
        // Send an initial connection event so the browser knows we're live.
        const hello = encoder.encode(
          `data: ${JSON.stringify({ type: "carapace.connected", data: { mode, ts: new Date().toISOString() } })}\n\n`,
        );
        controller.enqueue(hello);

        // Subscribe to all gateway events.
        const unsub = subscribeToEvents((event) => {
          try {
            const frame = encoder.encode(`data: ${JSON.stringify(event)}\n\n`);
            controller.enqueue(frame);
          } catch {
            // Controller already closed — ignore.
          }
        });

        // Keepalive: send a comment every 20 s to prevent proxy timeouts.
        const keepalive = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(": keepalive\n\n"));
          } catch {
            clearInterval(keepalive);
          }
        }, 20_000);

        // Cleanup when the client disconnects.
        request.signal.addEventListener("abort", () => {
          clearInterval(keepalive);
          unsub();
          try { controller.close(); } catch { /* already closed */ }
        });
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no", // disable nginx buffering
        "Access-Control-Allow-Origin": "*",
      },
    });
  },
});
