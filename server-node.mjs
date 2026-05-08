// Node.js production entrypoint for Carapace.
//
// TanStack Start's build output (dist/server/server.js) is a Web-standards
// fetch handler designed for serverless platforms. On a self-hosted VPS we
// need a real Node HTTP server, so this wrapper:
//
//   1. Handles /api/stream as a Server-Sent Events keepalive endpoint. The
//      browser opens this once per tab and expects a long-lived stream;
//      returning 404 would spam the console with reconnect errors. Live
//      gateway events are not yet bridged here — every route falls back to
//      React Query polling for live data, which works correctly. Wiring the
//      gateway event bus into this Node entry is a follow-up.
//   2. Forwards every other request to TanStack Start's fetch handler,
//      bridging Node IncomingMessage/ServerResponse to Web Request/Response.

import http from "node:http";
import { Readable } from "node:stream";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import server from "./dist/server/server.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATIC_DIR = path.join(__dirname, "dist/client");
const PORT = Number(process.env.PORT ?? 8080);
const HOST = process.env.HOST ?? "127.0.0.1";

const MIME_TYPES = {
  ".js": "application/javascript",
  ".css": "text/css",
  ".html": "text/html",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".eot": "application/vnd.ms-fontobject",
  ".json": "application/json",
  ".map": "application/json",
};

// ── /api/stream — SSE keepalive ───────────────────────────────────────────

function handleStream(req, res) {
  const mode = process.env.OPENCLAW_MODE ?? "mock";

  res.statusCode = 200;
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  // Initial frame so the browser knows we're alive.
  res.write(
    `data: ${JSON.stringify({
      type: "carapace.connected",
      data: { mode, ts: new Date().toISOString() },
    })}\n\n`,
  );

  // Keepalive comments every 20s prevent proxies from closing the stream.
  const keepalive = setInterval(() => {
    try { res.write(": keepalive\n\n"); } catch { clearInterval(keepalive); }
  }, 20_000);

  const cleanup = () => {
    clearInterval(keepalive);
    try { res.end(); } catch { /* ignore */ }
  };
  req.on("close", cleanup);
  req.on("error", cleanup);
}

// ── Static file serving ────────────────────────────────────────────────────

function serveStaticFile(pathname, res) {
  const filepath = path.join(STATIC_DIR, pathname);

  // Security: prevent path traversal
  if (!filepath.startsWith(STATIC_DIR)) {
    res.statusCode = 403;
    res.end("Forbidden");
    return true;
  }

  try {
    if (!fs.existsSync(filepath)) {
      return false;
    }

    const stat = fs.statSync(filepath);
    if (!stat.isFile()) {
      return false;
    }

    const ext = path.extname(filepath);
    const contentType = MIME_TYPES[ext] || "application/octet-stream";

    res.statusCode = 200;
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Length", stat.size);

    // Cache static assets for 1 year (they have content hashes in filenames)
    if (ext === ".js" || ext === ".css") {
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    }

    const stream = fs.createReadStream(filepath);
    stream.pipe(res);
    return true;
  } catch (err) {
    console.error(`[carapace] error serving ${filepath}:`, err);
    res.statusCode = 500;
    res.end("Internal Server Error");
    return true;
  }
}

// ── Web Request <-> Node bridge ───────────────────────────────────────────

function nodeRequestToWebRequest(req) {
  const protocol = req.socket.encrypted ? "https" : "http";
  const url = `${protocol}://${req.headers.host ?? `${HOST}:${PORT}`}${req.url}`;

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) for (const v of value) headers.append(key, v);
    else headers.set(key, value);
  }

  const init = { method: req.method, headers };
  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = Readable.toWeb(req);
    init.duplex = "half";
  }
  return new Request(url, init);
}

async function writeWebResponseToNode(response, res) {
  res.statusCode = response.status;
  res.statusMessage = response.statusText;
  for (const [key, value] of response.headers.entries()) res.setHeader(key, value);

  if (!response.body) { res.end(); return; }

  const reader = response.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!res.write(value)) await new Promise((resolve) => res.once("drain", resolve));
    }
  } finally {
    reader.releaseLock();
  }
  res.end();
}

// ── HTTP server ───────────────────────────────────────────────────────────

const httpServer = http.createServer(async (req, res) => {
  try {
    const url = req.url ?? "/";
    const pathname = new URL(url, `http://${req.headers.host ?? `${HOST}:${PORT}`}`).pathname;

    if (url === "/api/stream" || url.startsWith("/api/stream?")) {
      handleStream(req, res);
      return;
    }

    // Serve static files from dist/client
    if (pathname.startsWith("/assets/")) {
      if (serveStaticFile(pathname, res)) {
        return;
      }
    }

    const request = nodeRequestToWebRequest(req);
    const response = await server.fetch(request);
    await writeWebResponseToNode(response, res);
  } catch (err) {
    console.error("[carapace] request error:", err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("content-type", "text/plain");
    }
    res.end("Internal Server Error");
  }
});

httpServer.listen(PORT, HOST, () => {
  console.log(`[carapace] listening on http://${HOST}:${PORT}`);
});

function shutdown(signal) {
  console.log(`[carapace] received ${signal}, shutting down…`);
  httpServer.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
