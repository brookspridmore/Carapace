import { createServerFn } from "@tanstack/react-start";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { getOpenClawRootPath } from "./adapters/filesystem.server";

// Filesystem diagnostics for OpenClaw integration. Read-only.
// Returns a structured report describing what Carapace can (and cannot)
// see at the configured OPENCLAW_ROOT_PATH. No writes, ever.

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
  subdirectories: string[];
  agents: FsItem[];
  memory: FsItem[];
  sessions: FsItem[];
  logs: FsItem[];
  configs: FsItem[];
  suggestions: { path: string; exists: boolean }[];
  raw: string;
}

function expandHome(p: string): string {
  if (!p) return p;
  if (p === "~") return os.homedir();
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  return p;
}

async function statItem(p: string): Promise<{ size: number; modifiedAt: string; isDir: boolean } | null> {
  try {
    const st = await fs.stat(p);
    return { size: st.size, modifiedAt: st.mtime.toISOString(), isDir: st.isDirectory() };
  } catch { return null; }
}

async function isReadable(p: string): Promise<boolean> {
  try { await fs.access(p, (await import("node:fs")).constants.R_OK); return true; }
  catch { return false; }
}

async function toItem(p: string, kind: FsItemKind): Promise<FsItem> {
  const st = await statItem(p);
  return {
    kind,
    path: p,
    size: st?.size ?? null,
    modifiedAt: st?.modifiedAt ?? null,
    readable: await isReadable(p),
  };
}

async function listDir(p: string): Promise<string[]> {
  try { return await fs.readdir(p); } catch { return []; }
}

const CONFIG_NAMES = ["agent.json", "agent.toml", "config.json", "config.toml"];
const MEMORY_NAMES = ["MEMORY.md", "DREAMS.md"];
const LOG_EXT = [".log", ".jsonl"];
const SESSION_HINTS = ["sessions", "conversations"];

async function collectAgents(root: string, errors: string[]): Promise<{ agents: FsItem[]; memory: FsItem[]; logs: FsItem[]; sessions: FsItem[]; configs: FsItem[]; }> {
  const agentsDir = path.join(root, "agents");
  const agents: FsItem[] = [];
  const memory: FsItem[] = [];
  const logs: FsItem[] = [];
  const sessions: FsItem[] = [];
  const configs: FsItem[] = [];

  // Root-level memory files
  for (const fname of MEMORY_NAMES) {
    const fp = path.join(root, fname);
    if (await statItem(fp)) memory.push(await toItem(fp, "memory"));
  }
  // Root-level config
  for (const fname of [...CONFIG_NAMES, "providers.json"]) {
    const fp = path.join(root, fname);
    if (await statItem(fp)) configs.push(await toItem(fp, "config"));
  }

  const agentDirNames = await listDir(agentsDir);
  if (agentDirNames.length === 0) {
    const st = await statItem(agentsDir);
    if (!st) errors.push(`No agents directory at ${agentsDir}`);
  }

  for (const name of agentDirNames) {
    const dir = path.join(agentsDir, name);
    const st = await statItem(dir);
    if (!st || !st.isDir) continue;
    agents.push(await toItem(dir, "agent"));

    // Per-agent files
    for (const fname of MEMORY_NAMES) {
      const fp = path.join(dir, fname);
      if (await statItem(fp)) memory.push(await toItem(fp, "memory"));
    }
    for (const fname of CONFIG_NAMES) {
      const fp = path.join(dir, fname);
      if (await statItem(fp)) configs.push(await toItem(fp, "config"));
    }
    // Logs
    const logsDir = path.join(dir, "logs");
    for (const f of await listDir(logsDir)) {
      if (LOG_EXT.some((ext) => f.endsWith(ext))) {
        logs.push(await toItem(path.join(logsDir, f), "log"));
      }
    }
    // Sessions/conversations
    for (const sub of SESSION_HINTS) {
      const sdir = path.join(dir, sub);
      for (const f of await listDir(sdir)) {
        sessions.push(await toItem(path.join(sdir, f), "session"));
      }
    }
  }

  // Root-level sessions/logs
  for (const sub of SESSION_HINTS) {
    const sdir = path.join(root, sub);
    for (const f of await listDir(sdir)) {
      sessions.push(await toItem(path.join(sdir, f), "session"));
    }
  }
  const rootLogs = path.join(root, "logs");
  for (const f of await listDir(rootLogs)) {
    if (LOG_EXT.some((ext) => f.endsWith(ext))) {
      logs.push(await toItem(path.join(rootLogs, f), "log"));
    }
  }

  return { agents, memory, logs, sessions, configs };
}

export const ocFilesystemDiagnostics = createServerFn({ method: "GET" }).handler(async (): Promise<FsDiagnosticsReport> => {
  const t0 = Date.now();
  const errors: string[] = [];
  const rootPath = getOpenClawRootPath();
  const rootEnvSet = Boolean(process.env.OPENCLAW_ROOT_PATH && process.env.OPENCLAW_ROOT_PATH.trim());

  // Suggestion paths regardless of whether rootPath resolves.
  const suggestionsRaw = ["~/.openclaw", "~/.config/openclaw", "~/openclaw", process.cwd()];
  const suggestions = await Promise.all(
    suggestionsRaw.map(async (p) => {
      const abs = expandHome(p);
      return { path: abs, exists: !!(await statItem(abs)) };
    }),
  );

  if (!rootPath) {
    return {
      rootPath: null, rootEnvSet, exists: false, readable: false, isDirectory: false,
      scannedAt: new Date().toISOString(), durationMs: Date.now() - t0,
      errors: ["OPENCLAW_ROOT_PATH is not set"],
      subdirectories: [], agents: [], memory: [], sessions: [], logs: [], configs: [],
      suggestions, raw: JSON.stringify({ rootPath: null }, null, 2),
    };
  }

  const st = await statItem(rootPath);
  if (!st) {
    return {
      rootPath, rootEnvSet, exists: false, readable: false, isDirectory: false,
      scannedAt: new Date().toISOString(), durationMs: Date.now() - t0,
      errors: [`Root path not found: ${rootPath}`],
      subdirectories: [], agents: [], memory: [], sessions: [], logs: [], configs: [],
      suggestions, raw: JSON.stringify({ rootPath }, null, 2),
    };
  }

  const readable = await isReadable(rootPath);
  if (!readable) errors.push(`Permission denied reading ${rootPath}`);

  // Subdirectories at the root.
  const topLevel = await listDir(rootPath);
  const subdirectories: string[] = [];
  for (const name of topLevel) {
    const s2 = await statItem(path.join(rootPath, name));
    if (s2?.isDir) subdirectories.push(name);
  }

  const collected = await collectAgents(rootPath, errors);

  if (collected.agents.length === 0) errors.push("Root path found but no agent directories detected under /agents");
  else if (collected.memory.length === 0) errors.push("Agents detected but no memory files (MEMORY.md / DREAMS.md) found");

  const report: FsDiagnosticsReport = {
    rootPath,
    rootEnvSet,
    exists: true,
    readable,
    isDirectory: st.isDir,
    scannedAt: new Date().toISOString(),
    durationMs: Date.now() - t0,
    errors,
    subdirectories,
    agents: collected.agents,
    memory: collected.memory,
    sessions: collected.sessions,
    logs: collected.logs,
    configs: collected.configs,
    suggestions,
    raw: JSON.stringify({
      rootPath, topLevel, counts: {
        agents: collected.agents.length, memory: collected.memory.length,
        sessions: collected.sessions.length, logs: collected.logs.length,
        configs: collected.configs.length,
      },
    }, null, 2),
  };
  return report;
});