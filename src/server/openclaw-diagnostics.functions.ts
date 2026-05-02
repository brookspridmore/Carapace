import { createServerFn } from "@tanstack/react-start";
import type { FsDiagnosticsReport } from "@/lib/openclaw-diagnostics-types";

// Re-export types for convenience so call sites can do a single import.
export type { FsDiagnosticsReport, FsItem, FsItemKind } from "@/lib/openclaw-diagnostics-types";

// Server function wrapper. The node:fs / adapter imports live in
// openclaw-diagnostics.server.ts and are loaded lazily inside the handler
// so this file stays safe to import from React route files.
export const ocFilesystemDiagnostics = createServerFn({ method: "GET" }).handler(
  async (): Promise<FsDiagnosticsReport> => {
    const { runFilesystemDiagnostics } = await import("./openclaw-diagnostics.server");
    return runFilesystemDiagnostics();
  },
);