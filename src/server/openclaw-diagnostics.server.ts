import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { getOpenClawRootPath } from "./adapters/filesystem.server";
import type { FsDiagnosticsReport, FsItem, FsItemKind } from "@/lib/openclaw-diagnostics-types";

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

// Real OpenClaw config files live under agents/<id>/agent/.
const AGENT_SUB_CONFIG_NAMES = ["models.json", "auth-profiles.json", "auth-state.json"];
// Legacy single-file configs at the agent root (optional).
const LEGACY_CONFIG_NAMES = ["agent.json", "agent.toml", "config.json", "config.toml"];
const LOG_EXT = [".log", ".jsonl"];
const SESSION_HINTS = ["sessions", "conversations"];
const SESSION_FILE_NAMES = new Set(["sessions.json"]);
const SCAN_SKIP_DIRS = new Set(["node_modules", ".git"]);

// Recursively scan a directory (bounded depth) for *.md files.
async function scanMarkdown(dir: string, depth: number, out: FsItem[]): Promise<void> {
  if (depth < 0) return;
  const names = await listDir(dir);
  for (const name of names) {
    if (SCAN_SKIP_DIRS.has(name)) continue;
    const fp = path.join(dir, name);
    const st = await statItem(fp);
    if (!st) continue;
    if (st.isDir) {
      // Skip noisy subtrees.
      if (name === "sessions" || name === "logs") continue;
      await scanMarkdown(fp, depth - 1, out);
      continue;
    }
    if (name.toLowerCase().endsWith(".md")) {
      out.push(await toItem(fp, "memory"));
    }
  }
}

async function collectAgents(
  root: string,
  warnings: string[],
): Promise<{ agents: FsItem[]; memory: FsItem[]; logs: FsItem[]; sessions: FsItem[]; configs: FsItem[]; }> {
  const agentsDir = path.join(root, "agents");
  const agents: FsItem[] = [];
  const memory: FsItem[] = [];
  const logs: FsItem[] = [];
  const sessions: FsItem[] = [];
  const configs: FsItem[] = [];

  // Root-level memory: top-level MEMORY.md / DREAMS.md plus deep scan of
  // OPENCLAW_ROOT_PATH/memory and /workspace.
  for (const name of ["MEMORY.md", "DREAMS.md"]) {
    const fp = path.join(root, name);
    if (await statItem(fp)) memory.push(await toItem(fp, "memory"));
  }
  await scanMarkdown(path.join(root, "memory"), 3, memory);
  await scanMarkdown(path.join(root, "workspace"), 3, memory);

  // Root-level configs (optional).
  for (const fname of [...LEGACY_CONFIG_NAMES, "providers.json"]) {
    const fp = path.join(root, fname);
    if (await statItem(fp)) configs.push(await toItem(fp, "config"));
  }

  const agentDirNames = await listDir(agentsDir);
  if (agentDirNames.length === 0) {
    const st = await statItem(agentsDir);
    if (!st) warnings.push(`No agents directory at ${agentsDir}`);
  }

  for (const name of agentDirNames) {
    const dir = path.join(agentsDir, name);
    const st = await statItem(dir);
    if (!st || !st.isDir) continue;
    // Any directory under agents/* counts as an agent — config files are
    // optional under the real OpenClaw layout.
    agents.push(await toItem(dir, "agent"));

    // Real OpenClaw config layout: agents/<id>/agent/{models,auth-profiles,auth-state}.json
    const agentSub = path.join(dir, "agent");
    let foundAgentConfig = false;
    for (const fname of AGENT_SUB_CONFIG_NAMES) {
      const fp = path.join(agentSub, fname);
      if (await statItem(fp)) {
        configs.push(await toItem(fp, "config"));
        foundAgentConfig = true;
      }
    }
    // Legacy fallback (warn if completely missing — never fatal).
    let foundLegacyConfig = false;
    for (const fname of LEGACY_CONFIG_NAMES) {
      const fp = path.join(dir, fname);
      if (await statItem(fp)) {
        configs.push(await toItem(fp, "config"));
        foundLegacyConfig = true;
      }
    }
    if (!foundAgentConfig && !foundLegacyConfig) {
      warnings.push(`Agent ${name}: no config files (agent/models.json or legacy config). This is OK — agent will be detected anyway.`);
    }

    // Per-agent memory: deep scan of agent dir for *.md files.
    await scanMarkdown(dir, 3, memory);

    // Sessions: agents/<id>/sessions/sessions.json + *.jsonl.
    const sessionsDir = path.join(dir, "sessions");
    for (const f of await listDir(sessionsDir)) {
      const fp = path.join(sessionsDir, f);
      const lower = f.toLowerCase();
      if (SESSION_FILE_NAMES.has(lower) || lower.endsWith(".jsonl") || lower.endsWith(".json")) {
        sessions.push(await toItem(fp, "session"));
      }
      if (LOG_EXT.some((ext) => lower.endsWith(ext))) {
        logs.push(await toItem(fp, "log"));
      }
    }

    // Legacy logs/ dir.
    const logsDir = path.join(dir, "logs");
    for (const f of await listDir(logsDir)) {
      if (LOG_EXT.some((ext) => f.endsWith(ext))) {
        logs.push(await toItem(path.join(logsDir, f), "log"));
      }
    }

    // Other session hints.
    for (const sub of SESSION_HINTS) {
      if (sub === "sessions") continue;
      const sdir = path.join(dir, sub);
      for (const f of await listDir(sdir)) {
        sessions.push(await toItem(path.join(sdir, f), "session"));
      }
    }
  }

  // Root-level sessions / logs (rare but supported).
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

export async function runFilesystemDiagnostics(): Promise<FsDiagnosticsReport> {
  const t0 = Date.now();
  const errors: string[] = [];
  const warnings: string[] = [];
  const rootPath = getOpenClawRootPath();
  const rootEnvSet = Boolean(process.env.OPENCLAW_ROOT_PATH && process.env.OPENCLAW_ROOT_PATH.trim());

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
      errors: ["OPENCLAW_ROOT_PATH is not set"], warnings,
      subdirectories: [], agents: [], memory: [], sessions: [], logs: [], configs: [],
      suggestions, raw: JSON.stringify({ rootPath: null }, null, 2),
    };
  }

  const st = await statItem(rootPath);
  if (!st) {
    return {
      rootPath, rootEnvSet, exists: false, readable: false, isDirectory: false,
      scannedAt: new Date().toISOString(), durationMs: Date.now() - t0,
      errors: [`Root path not found: ${rootPath}`], warnings,
      subdirectories: [], agents: [], memory: [], sessions: [], logs: [], configs: [],
      suggestions, raw: JSON.stringify({ rootPath }, null, 2),
    };
  }

  const readable = await isReadable(rootPath);
  if (!readable) errors.push(`Permission denied reading ${rootPath}`);

  const topLevel = await listDir(rootPath);
  const subdirectories: string[] = [];
  for (const name of topLevel) {
    const s2 = await statItem(path.join(rootPath, name));
    if (s2?.isDir) subdirectories.push(name);
  }

  const collected = await collectAgents(rootPath, warnings);

  if (collected.agents.length === 0) errors.push("Root path found but no agent directories detected under /agents");
  else if (collected.memory.length === 0) warnings.push("Agents detected but no memory files (*.md under /memory, /workspace, or agent dirs) found");

  return {
    rootPath,
    rootEnvSet,
    exists: true,
    readable,
    isDirectory: st.isDir,
    scannedAt: new Date().toISOString(),
    durationMs: Date.now() - t0,
    errors,
    warnings,
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
}