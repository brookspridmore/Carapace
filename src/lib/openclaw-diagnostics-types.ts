// Client-safe type definitions for OpenClaw filesystem diagnostics.
// No node:* imports — safe to import from React route files.

export type FsItemKind = "agent" | "memory" | "session" | "log" | "config" | "dir";

export interface FsItem {
  kind: FsItemKind;
  path: string;
  size: number | null;
  modifiedAt: string | null;
  readable: boolean;
}

export interface FsDiagnosticsReport {
  rootPath: string | null;
  rootEnvSet: boolean;
  exists: boolean;
  readable: boolean;
  isDirectory: boolean;
  scannedAt: string;
  durationMs: number;
  errors: string[];
  warnings: string[];
  subdirectories: string[];
  agents: FsItem[];
  memory: FsItem[];
  sessions: FsItem[];
  logs: FsItem[];
  configs: FsItem[];
  suggestions: { path: string; exists: boolean }[];
  raw: string;
}