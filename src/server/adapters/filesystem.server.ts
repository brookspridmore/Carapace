import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import type {
  OpenClawAdapter,
  ConfigAgentRecord,
} from "./types";
import type {
  Agent,
  Task,
  TaskStatus,
  LogEntry,
  AgentId,
} from "@/lib/mock-data";
import { recordFetch } from "../openclaw-telemetry.server";

// Filesystem-backed OpenClaw adapter.
//
// OpenClaw is primarily a local runtime + filesystem + gateway protocol —
// NOT a REST service. This adapter reads agent state, memory, sessions and
// logs directly from `OPENCLAW_ROOT_PATH` (default `~/.openclaw`).
//
// READ-ONLY contract:
//   - Every method either reads from disk or returns an empty value.
//   - No file writes, no execs, no mutations.
//   - On any error (missing dir, parse failure, permission denied) the
//     method returns an empty result and records the failure to telemetry.
//   - We never fall back to mock data — empty states are honest.

function expandHome(p: string): string {
  if (!p) return p;
  if (p === "~") return os.homedir();
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  return p;
}

export function getOpenClawRootPath(): string | null {
  const raw = process.env.OPENCLAW_ROOT_PATH;
  if (!raw || !raw.trim()) return null;
  return expandHome(raw.trim());
}

async function safeRead(filePath: string): Promise<string | null> {
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  try {
    const text = await fs.readFile(filePath, "utf8");
    recordFetch({
      url: `file://${filePath}`,
      ok: true,
      status: 200,
      startedAt,
      finishedAt: new Date().toISOString(),
      latencyMs: Date.now() - t0,
      error: null,
      rawPreview: text.slice(0, 512),
    });
    return text;
  } catch (err) {
    recordFetch({
      url: `file://${filePath}`,
      ok: false,
      status: null,
      startedAt,
      finishedAt: new Date().toISOString(),
      latencyMs: Date.now() - t0,
      error: err instanceof Error ? err.message : String(err),
      rawPreview: null,
    });
    return null;
  }
}

async function safeReaddir(dirPath: string): Promise<string[]> {
  try {
    return await fs.readdir(dirPath);
  } catch {
    return [];
  }
}

async function safeStat(p: string) {
  try { return await fs.stat(p); } catch { return null; }
}

// Very forgiving "config" parser. Tries JSON first, then a tiny TOML/INI
// subset (key = "value"). Anything we can't parse becomes an empty record.
function parseAgentConfig(raw: string): Record<string, string> {
  const trimmed = raw.trim();
  if (!trimmed) return {};
  if (trimmed.startsWith("{")) {
    try {
      const obj = JSON.parse(trimmed);
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(obj)) {
        if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
          out[k] = String(v);
        }
      }
      return out;
    } catch { /* fall through */ }
  }
  const out: Record<string, string> = {};
  for (const line of trimmed.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_.-]+)\s*=\s*"?([^"#\n]+?)"?\s*(#.*)?$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

interface AgentDirInfo {
  rawId: string;
  dir: string;
  config: Record<string, string>;
  memorySize: number;
}

async function readAgentDirs(root: string): Promise<AgentDirInfo[]> {
  const agentsDir = path.join(root, "agents");
  const entries = await safeReaddir(agentsDir);
  const out: AgentDirInfo[] = [];
  for (const name of entries) {
    const dir = path.join(agentsDir, name);
    const st = await safeStat(dir);
    if (!st || !st.isDirectory()) continue;
    // Real OpenClaw layout:
    //   agents/<id>/agent/models.json
    //   agents/<id>/agent/auth-profiles.json
    //   agents/<id>/agent/auth-state.json
    //   agents/<id>/sessions/sessions.json
    //   agents/<id>/sessions/*.jsonl
    // Legacy/optional:
    //   agents/<id>/agent.json|config.json|agent.toml|config.toml
    //   agents/<id>/MEMORY.md
    //
    // No config file is required. An agent is simply any directory under
    // OPENCLAW_ROOT_PATH/agents/*. Missing config files are NOT errors.
    const config: Record<string, string> = {};

    // Optional legacy single-file configs at the agent root.
    for (const fname of ["agent.json", "config.json", "agent.toml", "config.toml"]) {
      const raw = await safeRead(path.join(dir, fname));
      if (raw) {
        Object.assign(config, parseAgentConfig(raw));
        break;
      }
    }

    // Real OpenClaw `agent/` subfolder.
    const agentSub = path.join(dir, "agent");
    const modelsRaw = await safeRead(path.join(agentSub, "models.json"));
    if (modelsRaw) {
      try {
        const parsed = JSON.parse(modelsRaw);
        const first = Array.isArray(parsed)
          ? parsed[0]
          : Array.isArray(parsed?.models)
            ? parsed.models[0]
            : parsed?.default ?? parsed;
        if (first && typeof first === "object") {
          if (typeof first.model === "string") config.model = first.model;
          if (typeof first.id === "string" && !config.model) config.model = first.id;
          if (typeof first.provider === "string") config.provider = first.provider;
        }
      } catch { /* ignore */ }
    }
    const authRaw = await safeRead(path.join(agentSub, "auth-profiles.json"));
    if (authRaw) {
      try {
        const parsed = JSON.parse(authRaw);
        const profile = Array.isArray(parsed) ? parsed[0] : parsed?.default ?? parsed;
        if (profile && typeof profile === "object" && typeof profile.provider === "string" && !config.provider) {
          config.provider = profile.provider;
        }
      } catch { /* ignore */ }
    }

    const memStat = await safeStat(path.join(dir, "MEMORY.md"));
    out.push({
      rawId: name,
      dir,
      config,
      memorySize: memStat?.size ?? 0,
    });
  }
  return out;
}

function toAgent(info: AgentDirInfo): Agent {
  const c = info.config;
  return {
    id: info.rawId as unknown as AgentId,
    name: c.name || c.friendly_name || info.rawId,
    role: c.role || c.description || "",
    model: c.model || "",
    provider: c.provider || "",
    status: (c.status as Agent["status"]) || "idle",
    parentId: (c.parent || c.parent_id || undefined) as AgentId | undefined,
    activeTask: c.active_task || undefined,
    tokensUsed: Number(c.tokens_used) || 0,
    tokensMax: Number(c.tokens_max) || 0,
    contextPressure: Number(c.context_pressure) || 0,
    workspacePath: c.workspace_path || info.dir,
    memorySizeKb: Math.round(info.memorySize / 1024),
  };
}

const READ_DISABLED = (label: string) => () => {
  throw new Error(`${label} is disabled — filesystem readonly mode`);
};

export function createFilesystemAdapter(root: string): OpenClawAdapter {
  return {
    async health() {
      const t0 = Date.now();
      const st = await safeStat(root);
      const ok = !!st && st.isDirectory();
      recordFetch({
        url: `file://${root}`,
        ok,
        status: ok ? 200 : null,
        startedAt: new Date(Date.now() - (Date.now() - t0)).toISOString(),
        finishedAt: new Date().toISOString(),
        latencyMs: Date.now() - t0,
        error: ok ? null : "OPENCLAW_ROOT_PATH is missing or not a directory",
        rawPreview: null,
      });
      return { ok, baseUrl: `file://${root}`, latencyMs: Date.now() - t0 };
    },

    async listAgents() {
      const infos = await readAgentDirs(root);
      return infos.map(toAgent);
    },
    async getAgent(id) {
      const infos = await readAgentDirs(root);
      const hit = infos.find((i) => i.rawId === id);
      return hit ? toAgent(hit) : null;
    },

    // Tasks: OpenClaw doesn't (yet) own canonical task state on disk in a
    // standardized format. Carapace's Kanban store is the source of truth
    // for now — the filesystem adapter returns empty so the UI shows real
    // user-created tasks plus an honest empty state when none exist.
    async listTasks(): Promise<Task[]> { return []; },
    updateTaskStatus: (async (_id: string, _status: TaskStatus) => null) as OpenClawAdapter["updateTaskStatus"],

    // Snapshots, conversations, approvals, providers — read directories
    // under the root if present, otherwise empty. Detailed parsers can be
    // layered in once OpenClaw's on-disk format stabilizes.
    async listSnapshots() {
      const dir = path.join(root, "snapshots");
      const names = await safeReaddir(dir);
      // Without a stable schema we surface zero records rather than guess.
      return names.length === 0 ? [] : [];
    },
    async listConversations() { return []; },
    async listApprovals() { return []; },
    resolveApproval: READ_DISABLED("resolveApproval"),
    async listProviders() {
      const raw = await safeRead(path.join(root, "providers.json"))
        ?? await safeRead(path.join(root, "config", "providers.json"));
      if (!raw) return [];
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : Array.isArray(parsed.items) ? parsed.items : [];
      } catch { return []; }
    },

    async recentLogs(limit = 80): Promise<LogEntry[]> {
      const out: LogEntry[] = [];
      const infos = await readAgentDirs(root);
      for (const info of infos) {
        // Real OpenClaw stores activity under sessions/*.jsonl. Also check
        // a legacy logs/ dir if present.
        const candidateDirs = [path.join(info.dir, "sessions"), path.join(info.dir, "logs")];
        for (const logsDir of candidateDirs) {
          const files = (await safeReaddir(logsDir)).filter(
            (f) => f.endsWith(".log") || f.endsWith(".jsonl"),
          );
          files.sort().reverse();
          for (const f of files.slice(0, 3)) {
            const raw = await safeRead(path.join(logsDir, f));
            if (!raw) continue;
            const lines = raw
              .split(/\r?\n/)
              .filter(Boolean)
              .slice(-Math.ceil(limit / Math.max(infos.length, 1)));
            for (const line of lines) {
              let message = line.slice(0, 500);
              let ts = new Date().toISOString();
              if (line.startsWith("{")) {
                try {
                  const obj = JSON.parse(line);
                  if (typeof obj.message === "string") message = obj.message.slice(0, 500);
                  else if (typeof obj.content === "string") message = obj.content.slice(0, 500);
                  else if (typeof obj.text === "string") message = obj.text.slice(0, 500);
                  if (typeof obj.timestamp === "string") ts = obj.timestamp;
                  else if (typeof obj.ts === "string") ts = obj.ts;
                } catch { /* keep raw line */ }
              }
              out.push({
                id: `${info.rawId}:${f}:${out.length}`,
                ts,
                level: "info",
                agentId: info.rawId as unknown as AgentId,
                message,
              } as LogEntry);
            }
          }
        }
      }
      return out.slice(0, limit);
    },

    async listAgentsFromConfig() {
      const infos = await readAgentDirs(root);
      const agents: ConfigAgentRecord[] = infos.map((i) => ({
        rawOpenClawId: i.rawId,
        friendlyName: i.config.name || i.config.friendly_name || i.rawId,
        role: i.config.role,
        parentRawOpenClawId: i.config.parent || i.config.parent_id,
        workspacePath: i.config.workspace_path || i.dir,
        memoryPath: path.join(i.dir, "MEMORY.md"),
        model: i.config.model,
        provider: i.config.provider,
      }));
      return { source: "openclaw" as const, agents };
    },
    async updateAgentAlias() {
      // Aliases live in Carapace's local store (client). Server is a no-op.
      return { ok: true } as const;
    },
    backupOpenClawConfig: READ_DISABLED("backupOpenClawConfig"),
    async validateOpenClawConfig() {
      return { ok: false, errors: ["filesystem adapter is read-only — config writes disabled"], warnings: [] };
    },
    writeOpenClawConfig: READ_DISABLED("writeOpenClawConfig"),

    async listMemorySources() {
      const infos = await readAgentDirs(root);
      const sources: Awaited<ReturnType<OpenClawAdapter["listMemorySources"]>> = [];
      const seen = new Set<string>();
      const push = async (id: string, fp: string, kind: "memory_md" | "dreams_md", agentId?: string) => {
        if (seen.has(fp)) return;
        seen.add(fp);
        const st = await safeStat(fp);
        if (!st) return;
        const body = (await safeRead(fp)) ?? "";
        sources.push({
          id,
          kind,
          agentId: agentId as AgentId | undefined,
          path: fp,
          title: path.basename(fp),
          body: body.slice(0, 4096),
          updatedAt: st.mtime.toISOString(),
        });
      };

      // Recursively scan a directory (bounded depth) for *.md files. Used for
      // global memory and workspace folders.
      const scanDir = async (dir: string, agentId: string | undefined, depth: number) => {
        if (depth < 0) return;
        const names = await safeReaddir(dir);
        for (const name of names) {
          const fp = path.join(dir, name);
          const st = await safeStat(fp);
          if (!st) continue;
          if (st.isDirectory()) {
            if (name === "node_modules" || name === ".git" || name === "sessions" || name === "logs") continue;
            await scanDir(fp, agentId, depth - 1);
            continue;
          }
          const lower = name.toLowerCase();
          if (!lower.endsWith(".md")) continue;
          const kind: "memory_md" | "dreams_md" = lower.includes("dream") ? "dreams_md" : "memory_md";
          await push(`${agentId ?? "root"}:${fp}`, fp, kind, agentId);
        }
      };

      await push("root:MEMORY.md", path.join(root, "MEMORY.md"), "memory_md");
      await push("root:DREAMS.md", path.join(root, "DREAMS.md"), "dreams_md");
      await scanDir(path.join(root, "memory"), undefined, 3);
      await scanDir(path.join(root, "workspace"), undefined, 3);

      for (const info of infos) {
        await push(`${info.rawId}:MEMORY.md`, path.join(info.dir, "MEMORY.md"), "memory_md", info.rawId);
        await push(`${info.rawId}:DREAMS.md`, path.join(info.dir, "DREAMS.md"), "dreams_md", info.rawId);
        await scanDir(info.dir, info.rawId, 3);
      }
      return sources;
    },
    async searchMemory() { return []; },

    createSnapshot: READ_DISABLED("createSnapshot"),
    updateSnapshot: READ_DISABLED("updateSnapshot"),
    createMemoryWriteCandidate: READ_DISABLED("createMemoryWriteCandidate"),
    approveMemoryWrite: READ_DISABLED("approveMemoryWrite"),
  };
}
