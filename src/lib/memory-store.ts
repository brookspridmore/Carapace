import { create } from "zustand";
import { MEMORY_ENTRIES, SNAPSHOTS, CONVERSATIONS, TASKS, type AgentId } from "./mock-data";

// ---------------------------------------------------------------------------
// Carapace Memory Store
// ---------------------------------------------------------------------------
// Memory is NOT dumped blindly into agent context. It is retrieved, ranked,
// traced, and controlled. This store powers:
//
//   - Memory Search       — unified, ranked search over all sources.
//   - Retrieval Traces    — auditable record of every search/resume retrieval.
//   - Memory Write Queue  — proposed memory writes that need operator approval.
//
// Today everything is in-memory + mock-seeded. The adapter boundary
// (searchMemory / createMemoryWriteCandidate / approveMemoryWrite) is shaped
// so the real OpenClaw filesystem can plug in unchanged.

export type MemorySourceKind =
  | "snapshot"
  | "agent_file"
  | "memory_md"
  | "dreams_md"
  | "task_note"
  | "conversation_summary";

export interface MemorySource {
  id: string;
  kind: MemorySourceKind;
  agentId?: AgentId;
  path: string;
  title: string;
  body: string;
  updatedAt: string;
}

export interface MemorySearchHit {
  source: MemorySource;
  score: number;          // 0..1
  reason: string;         // why selected (e.g. "matched 'launch' x2 in title")
  snippet: string;
}

export interface RetrievalTrace {
  id: string;
  query: string;
  agentId?: AgentId;
  taskId?: string;
  selected: { sourceId: string; score: number; reason: string }[];
  rejected: { sourceId: string; score: number; reason: string }[];
  contextPreview: string; // first ~400 chars of the assembled context
  ts: string;
  origin: "search" | "resume_snapshot" | "agent_runtime";
}

export type WriteLayer = "short_term" | "medium_term" | "long_term" | "dreams" | "snapshot" | "discard";
export type WriteStatus = "pending" | "approved" | "rejected" | "applied";

export interface MemoryWriteCandidate {
  id: string;
  proposedMemory: string;
  sourceTaskId?: string;
  sourceAgentId?: AgentId;
  targetLayer: WriteLayer;
  reason: string;
  confidence: number; // 0..1
  status: WriteStatus;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Source index — built from existing mock data so search has something real
// to chew on. Real adapter will replace seedSources() with a filesystem walk.
// ---------------------------------------------------------------------------

function seedSources(): MemorySource[] {
  const sources: MemorySource[] = [];

  // MEMORY.md / DREAMS.md / daily / snapshot entries
  for (const e of MEMORY_ENTRIES) {
    const kind: MemorySourceKind =
      e.source === "MEMORY.md" ? "memory_md" :
      e.source === "DREAMS.md" ? "dreams_md" :
      e.source === "snapshot"  ? "snapshot" :
      "agent_file";
    sources.push({
      id: `src_${e.id}`,
      kind,
      agentId: e.agentId,
      path: `${e.source}#${e.title.replace(/\s+/g, "-").toLowerCase()}`,
      title: e.title,
      body: e.excerpt,
      updatedAt: e.promotedAt,
    });
  }

  // Snapshots become first-class searchable sources
  for (const s of SNAPSHOTS) {
    sources.push({
      id: `src_${s.id}`,
      kind: "snapshot",
      agentId: s.agentId,
      path: `snapshots/${s.id}`,
      title: s.title ?? s.objective.slice(0, 60),
      body: [s.objective, s.currentState, ...(s.decisions ?? []), ...(s.nextActions ?? [])].join(" \n"),
      updatedAt: s.updatedAt ?? s.createdAt,
    });
  }

  // Task notes
  for (const t of TASKS) {
    sources.push({
      id: `src_task_${t.id}`,
      kind: "task_note",
      agentId: t.agentId,
      path: `tasks/${t.id}`,
      title: t.title,
      body: `${t.description} ${t.logTail.join(" ")}`,
      updatedAt: t.createdAt,
    });
  }

  // Conversation summaries
  for (const c of CONVERSATIONS) {
    sources.push({
      id: `src_conv_${c.id}`,
      kind: "conversation_summary",
      agentId: c.agentId,
      path: `conversations/${c.id}`,
      title: c.title,
      body: c.messages.map((m) => `${m.author}: ${m.body}`).join(" \n"),
      updatedAt: c.lastActivity,
    });
  }

  return sources;
}

// ---------------------------------------------------------------------------
// Ranking — simple keyword scoring. Good enough for preview; real adapter
// will plug FTS5 / Postgres FTS in here.
// ---------------------------------------------------------------------------

function tokenize(s: string): string[] {
  return s.toLowerCase().split(/[^a-z0-9_#.-]+/).filter(Boolean);
}

function scoreSource(query: string, src: MemorySource): { score: number; reason: string; snippet: string } {
  const qTokens = tokenize(query);
  if (qTokens.length === 0) return { score: 0, reason: "empty query", snippet: src.body.slice(0, 140) };
  const titleTokens = tokenize(src.title);
  const bodyTokens = tokenize(src.body);
  let titleHits = 0, bodyHits = 0;
  for (const t of qTokens) {
    titleHits += titleTokens.filter((x) => x === t).length;
    bodyHits += bodyTokens.filter((x) => x === t).length;
  }
  const raw = titleHits * 3 + bodyHits;
  const norm = Math.min(1, raw / (qTokens.length * 4));
  const reason =
    titleHits > 0 ? `matched ${titleHits} term${titleHits === 1 ? "" : "s"} in title` :
    bodyHits > 0 ? `matched ${bodyHits} term${bodyHits === 1 ? "" : "s"} in body` :
    "no direct match";

  // Snippet: first sentence containing any matched token, else head of body.
  const lowerBody = src.body.toLowerCase();
  let snippetStart = -1;
  for (const t of qTokens) {
    const idx = lowerBody.indexOf(t);
    if (idx >= 0) { snippetStart = Math.max(0, idx - 40); break; }
  }
  const snippet = snippetStart >= 0
    ? src.body.slice(snippetStart, snippetStart + 180).trim()
    : src.body.slice(0, 140).trim();

  return { score: norm, reason, snippet };
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

interface MemoryStore {
  sources: MemorySource[];
  traces: RetrievalTrace[];
  candidates: MemoryWriteCandidate[];
  search: (query: string, opts?: { agentId?: AgentId; taskId?: string; topK?: number; rejectThreshold?: number; origin?: RetrievalTrace["origin"] }) => { hits: MemorySearchHit[]; trace: RetrievalTrace };
  recordResume: (snapshotId: string, agentId?: AgentId, taskId?: string) => void;
  proposeWrite: (input: Omit<MemoryWriteCandidate, "id" | "status" | "createdAt" | "updatedAt">) => MemoryWriteCandidate;
  decide: (id: string, decision: "approve" | "reject", overrideText?: string) => void;
  applyApproved: (id: string) => void;
  clearTraces: () => void;
}

function nowIso() { return new Date().toISOString(); }

export const useMemoryStore = create<MemoryStore>((set, get) => ({
  sources: seedSources(),
  traces: [],
  candidates: [
    {
      id: "mwc_001",
      proposedMemory: "Tuesday launches consistently outperform Thursday by ~12% in click-through (confirmed across 3 launches).",
      sourceTaskId: "t-001",
      sourceAgentId: "chief",
      targetLayer: "long_term",
      reason: "Pattern reinforced in this launch cycle; should harden into MEMORY.md",
      confidence: 0.86,
      status: "pending",
      createdAt: nowIso(),
      updatedAt: nowIso(),
    },
    {
      id: "mwc_002",
      proposedMemory: "Competitor C deprecated their free tier on 2026-04-29 — reposition our free tier messaging.",
      sourceTaskId: "t-002",
      sourceAgentId: "researcher",
      targetLayer: "medium_term",
      reason: "High-recency competitive intel; useful for next 30 days.",
      confidence: 0.74,
      status: "pending",
      createdAt: nowIso(),
      updatedAt: nowIso(),
    },
    {
      id: "mwc_003",
      proposedMemory: "Builder prefers exec tools over file edits when patching ≤3 lines — speeds review.",
      sourceAgentId: "builder",
      targetLayer: "discard",
      reason: "Low signal — operator-specific preference, not a system pattern.",
      confidence: 0.31,
      status: "pending",
      createdAt: nowIso(),
      updatedAt: nowIso(),
    },
  ],

  search: (query, opts = {}) => {
    const topK = opts.topK ?? 6;
    const rejectThreshold = opts.rejectThreshold ?? 0.05;
    const sources = get().sources;
    const scored = sources.map((src) => ({ src, ...scoreSource(query, src) }));
    scored.sort((a, b) => b.score - a.score);
    const hits = scored.slice(0, topK)
      .filter((s) => s.score > 0)
      .map<MemorySearchHit>(({ src, score, reason, snippet }) => ({ source: src, score, reason, snippet }));
    const rejected = scored.slice(topK)
      .filter((s) => s.score >= rejectThreshold)
      .slice(0, 5)
      .map((s) => ({ sourceId: s.src.id, score: s.score, reason: "below top-K threshold" }));

    const trace: RetrievalTrace = {
      id: `rt_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6)}`,
      query,
      agentId: opts.agentId,
      taskId: opts.taskId,
      selected: hits.map((h) => ({ sourceId: h.source.id, score: h.score, reason: h.reason })),
      rejected,
      contextPreview: hits.map((h) => `[${h.source.path}] ${h.snippet}`).join("\n").slice(0, 400),
      ts: nowIso(),
      origin: opts.origin ?? "search",
    };
    set((s) => ({ traces: [trace, ...s.traces].slice(0, 50) }));
    return { hits, trace };
  },

  recordResume: (snapshotId, agentId, taskId) => {
    const sources = get().sources;
    const matched = sources.filter((s) =>
      s.path.includes(snapshotId) ||
      (taskId && s.path.includes(taskId)),
    );
    const trace: RetrievalTrace = {
      id: `rt_${Date.now().toString(36)}`,
      query: `resume:${snapshotId}`,
      agentId, taskId,
      selected: matched.map((s) => ({ sourceId: s.id, score: 1, reason: "linked to resumed snapshot" })),
      rejected: [],
      contextPreview: matched.map((s) => `[${s.path}] ${s.body.slice(0, 120)}`).join("\n").slice(0, 400),
      ts: nowIso(),
      origin: "resume_snapshot",
    };
    set((s) => ({ traces: [trace, ...s.traces].slice(0, 50) }));
  },

  proposeWrite: (input) => {
    const candidate: MemoryWriteCandidate = {
      id: `mwc_${Date.now().toString(36)}`,
      ...input,
      status: "pending",
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    set((s) => ({ candidates: [candidate, ...s.candidates] }));
    return candidate;
  },

  decide: (id, decision, overrideText) =>
    set((s) => ({
      candidates: s.candidates.map((c) =>
        c.id === id
          ? {
              ...c,
              proposedMemory: overrideText ?? c.proposedMemory,
              status: decision === "approve" ? "approved" : "rejected",
              updatedAt: nowIso(),
            }
          : c,
      ),
    })),

  applyApproved: (id) =>
    set((s) => ({
      candidates: s.candidates.map((c) =>
        c.id === id && c.status === "approved" ? { ...c, status: "applied", updatedAt: nowIso() } : c,
      ),
    })),

  clearTraces: () => set({ traces: [] }),
}));

export function getSourceById(id: string): MemorySource | undefined {
  return useMemoryStore.getState().sources.find((s) => s.id === id);
}