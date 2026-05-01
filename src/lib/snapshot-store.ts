import { create } from "zustand";
import { SNAPSHOTS, type Snapshot, type AgentId } from "./mock-data";

// ---------------------------------------------------------------------------
// Carapace Snapshot Store
// ---------------------------------------------------------------------------
// Snapshots are compressed, structured operational state — NOT transcripts.
// They let a paused or context-pressured agent resume cleanly without
// re-reading the entire history.
//
// All UI surfaces (Snapshots page, Kanban, Flow, Memory search) read from
// this single store. Persistence to OpenClaw goes through the adapter
// boundary (createSnapshot/updateSnapshot) — see openclaw.functions.ts.

export type SnapshotStatus = NonNullable<Snapshot["status"]>;

export interface SnapshotFilter {
  query: string;
  agentId: AgentId | "all";
  taskId: string | "all";
  status: SnapshotStatus | "all";
}

interface SnapshotStore {
  snapshots: Snapshot[];
  filter: SnapshotFilter;
  selectedId: string | null;
  setFilter: (patch: Partial<SnapshotFilter>) => void;
  setSelected: (id: string | null) => void;
  upsert: (s: Snapshot) => void;
  patch: (id: string, patch: Partial<Snapshot>) => void;
  archive: (id: string) => void;
  remove: (id: string) => void;
  createForTask: (args: { taskId: string; agentId: AgentId; title: string; objective: string }) => Snapshot;
}

const DEFAULT_FILTER: SnapshotFilter = {
  query: "",
  agentId: "all",
  taskId: "all",
  status: "all",
};

function nowIso() {
  return new Date().toISOString();
}

export const useSnapshotStore = create<SnapshotStore>((set, get) => ({
  snapshots: SNAPSHOTS.map((s) => ({ ...s })),
  filter: { ...DEFAULT_FILTER },
  selectedId: null,
  setFilter: (patch) => set((s) => ({ filter: { ...s.filter, ...patch } })),
  setSelected: (id) => set({ selectedId: id }),
  upsert: (snap) =>
    set((s) => {
      const exists = s.snapshots.some((x) => x.id === snap.id);
      const next = exists
        ? s.snapshots.map((x) => (x.id === snap.id ? { ...snap, updatedAt: nowIso() } : x))
        : [{ ...snap, createdAt: snap.createdAt ?? nowIso(), updatedAt: nowIso() }, ...s.snapshots];
      return { snapshots: next };
    }),
  patch: (id, patch) =>
    set((s) => ({
      snapshots: s.snapshots.map((x) =>
        x.id === id ? { ...x, ...patch, updatedAt: nowIso() } : x,
      ),
    })),
  archive: (id) =>
    set((s) => ({
      snapshots: s.snapshots.map((x) =>
        x.id === id ? { ...x, status: "archived", updatedAt: nowIso() } : x,
      ),
    })),
  remove: (id) =>
    set((s) => ({ snapshots: s.snapshots.filter((x) => x.id !== id) })),
  createForTask: ({ taskId, agentId, title, objective }) => {
    const snap: Snapshot = {
      id: `snap_${taskId}_${Date.now().toString(36)}`,
      title,
      agentId,
      taskId,
      status: "active",
      importance: 0.5,
      confidenceScore: 0.5,
      objective,
      currentState: "",
      decisions: [],
      openQuestions: [],
      nextActions: [],
      blockers: [],
      files: [],
      memoryRefs: [],
      conversationRefs: [],
      artifacts: [],
      retrievalKeywords: [],
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    get().upsert(snap);
    return snap;
  },
}));

// ---- Selectors -------------------------------------------------------------

export function useSnapshotById(id?: string | null): Snapshot | undefined {
  return useSnapshotStore((s) => (id ? s.snapshots.find((x) => x.id === id) : undefined));
}

export function useSnapshotsForTask(taskId?: string | null): Snapshot[] {
  return useSnapshotStore((s) =>
    taskId ? s.snapshots.filter((x) => x.taskId === taskId) : [],
  );
}

export function useFilteredSnapshots(): Snapshot[] {
  return useSnapshotStore((s) => {
    const f = s.filter;
    const q = f.query.trim().toLowerCase();
    return s.snapshots.filter((snap) => {
      if (f.agentId !== "all" && snap.agentId !== f.agentId) return false;
      if (f.taskId !== "all" && snap.taskId !== f.taskId) return false;
      const status = snap.status ?? "active";
      if (f.status !== "all" && status !== f.status) return false;
      if (q.length === 0) return true;
      const hay = [
        snap.id, snap.title ?? "", snap.objective, snap.currentState,
        ...(snap.decisions ?? []), ...(snap.nextActions ?? []),
        ...(snap.blockers ?? []), ...(snap.openQuestions ?? []),
        ...(snap.retrievalKeywords ?? []),
      ].join(" ").toLowerCase();
      return hay.includes(q);
    });
  });
}