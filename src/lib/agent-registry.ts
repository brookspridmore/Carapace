import { create } from "zustand";
import { AGENTS, type AgentId } from "./mock-data";

// ---------------------------------------------------------------------------
// Carapace Agent Registry / Alias Layer
// ---------------------------------------------------------------------------
// Carapace exposes friendly, human-readable names for OpenClaw's raw IDs
// without ever losing those raw IDs. Every UI surface should resolve display
// names through this registry (see useAgentLabel / getAgentLabel below).
//
// Source priority for an alias:
//   1. "openclaw"  — read from OpenClaw config (preferred, authoritative)
//   2. "carapace"  — saved locally in Carapace, not yet pushed to OpenClaw
//   3. "mock"      — seeded from mock-data while Carapace is unconfigured

export type AliasSource = "mock" | "carapace" | "openclaw";

export interface AgentAlias {
  rawOpenClawId: string;
  friendlyName: string;
  role: string;
  parentRawOpenClawId?: string;
  model?: string;
  provider?: string;
  workspacePath?: string;
  memoryPath?: string;
  notes?: string;
  tags?: string[];
  source: AliasSource;
  dirty?: boolean;
  updatedAt?: string;
}

export interface AuditEntry {
  id: string;
  ts: string;
  kind: "alias_edit" | "openclaw_write" | "openclaw_backup";
  rawOpenClawId?: string;
  summary: string;
  details?: string;
}

function seedAliases(): AgentAlias[] {
  return AGENTS.map((a) => ({
    rawOpenClawId: a.id,
    friendlyName: a.name,
    role: a.role,
    parentRawOpenClawId: a.parentId,
    model: a.model,
    provider: a.provider,
    workspacePath: a.workspacePath,
    memoryPath: `/var/openclaw/agents/${a.id}/MEMORY.md`,
    source: "mock",
    notes: "",
    tags: [],
  }));
}

interface AgentRegistryStore {
  aliases: AgentAlias[];
  audit: AuditEntry[];
  openclawConfigPath: string;
  openclawAgentsPath: string;
  setAliases: (a: AgentAlias[]) => void;
  updateAlias: (rawId: string, patch: Partial<AgentAlias>) => void;
  markPushed: (rawIds: string[]) => void;
  pushAudit: (entry: Omit<AuditEntry, "id" | "ts">) => void;
  setOpenClawConfigPath: (p: string) => void;
  setOpenClawAgentsPath: (p: string) => void;
}

export const useAgentRegistry = create<AgentRegistryStore>((set) => ({
  aliases: seedAliases(),
  audit: [],
  openclawConfigPath: "",
  openclawAgentsPath: "",
  setAliases: (aliases) => set({ aliases }),
  updateAlias: (rawId, patch) =>
    set((s) => ({
      aliases: s.aliases.map((a) =>
        a.rawOpenClawId === rawId
          ? {
              ...a,
              ...patch,
              source: a.source === "mock" ? "carapace" : a.source,
              dirty: true,
              updatedAt: new Date().toISOString(),
            }
          : a,
      ),
    })),
  markPushed: (rawIds) =>
    set((s) => ({
      aliases: s.aliases.map((a) =>
        rawIds.includes(a.rawOpenClawId)
          ? { ...a, dirty: false, source: "openclaw" }
          : a,
      ),
    })),
  pushAudit: (entry) =>
    set((s) => ({
      audit: [
        { id: `aud_${Date.now()}_${Math.floor(Math.random() * 1e6)}`, ts: new Date().toISOString(), ...entry },
        ...s.audit,
      ].slice(0, 200),
    })),
  setOpenClawConfigPath: (p) => set({ openclawConfigPath: p }),
  setOpenClawAgentsPath: (p) => set({ openclawAgentsPath: p }),
}));

// ---- Lookup helpers ---------------------------------------------------------

export function useAgentLabel(rawId?: string | null): string {
  const aliases = useAgentRegistry((s) => s.aliases);
  if (!rawId) return "—";
  return aliases.find((a) => a.rawOpenClawId === rawId)?.friendlyName ?? rawId;
}

export function useAgentAlias(rawId?: string | null): AgentAlias | undefined {
  const aliases = useAgentRegistry((s) => s.aliases);
  if (!rawId) return undefined;
  return aliases.find((a) => a.rawOpenClawId === rawId);
}

export function getAgentLabel(rawId?: string | null): string {
  if (!rawId) return "—";
  const aliases = useAgentRegistry.getState().aliases;
  return aliases.find((a) => a.rawOpenClawId === rawId)?.friendlyName ?? rawId;
}

export function getAgentAlias(rawId?: string | null): AgentAlias | undefined {
  if (!rawId) return undefined;
  return useAgentRegistry.getState().aliases.find((a) => a.rawOpenClawId === rawId);
}

export function useAgentLabelMap(): Record<string, string> {
  const aliases = useAgentRegistry((s) => s.aliases);
  const map: Record<string, string> = {};
  for (const a of aliases) map[a.rawOpenClawId] = a.friendlyName;
  return map;
}

export type RawAgentId = AgentId | string;
