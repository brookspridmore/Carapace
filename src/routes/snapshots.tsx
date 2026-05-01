import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { PageHeader } from "@/components/shell/PageHeader";
import { OnboardingHint } from "@/components/shell/OnboardingHint";
import { AGENTS, type Snapshot, type AgentId } from "@/lib/mock-data";
import { useAgentLabelMap } from "@/lib/agent-registry";
import { format } from "date-fns";
import { Camera, FileText, Brain, Play, ListTodo, Search, Archive, X, Plus, MessagesSquare, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTaskStore } from "@/lib/task-store";
import { useSnapshotStore, useFilteredSnapshots, type SnapshotStatus } from "@/lib/snapshot-store";
import { useMemoryStore } from "@/lib/memory-store";

export const Route = createFileRoute("/snapshots")({
  head: () => ({
    meta: [
      { title: "Snapshots — Carapace" },
      { name: "description", content: "Snapshots store agent work-in-progress so tasks can resume without reprocessing the entire history." },
      { property: "og:title", content: "Snapshots — Carapace" },
      { property: "og:description", content: "Resumable agent work via snapshots." },
    ],
  }),
  component: SnapshotsPage,
});

function SnapshotsPage() {
  const navigate = useNavigate();
  const setFocusedSnapshot = useTaskStore((s) => s.setFocusedSnapshot);
  const labelMap = useAgentLabelMap();
  const tasks = useTaskStore((s) => s.tasks);
  const filter = useSnapshotStore((s) => s.filter);
  const setFilter = useSnapshotStore((s) => s.setFilter);
  const archive = useSnapshotStore((s) => s.archive);
  const patch = useSnapshotStore((s) => s.patch);
  const upsert = useSnapshotStore((s) => s.upsert);
  const recordResume = useMemoryStore((s) => s.recordResume);
  const filtered = useFilteredSnapshots();
  const [openId, setOpenId] = useState<string | null>(null);
  const open = useSnapshotStore((s) => s.snapshots.find((x) => x.id === openId)) ?? null;

  function resume(snap: Snapshot) {
    setFocusedSnapshot(snap.id);
    recordResume(snap.id, snap.agentId, snap.taskId);
    navigate({ to: "/", search: { snapshot: snap.id } as never });
  }

  function createBlank() {
    const id = `snap_blank_${Date.now().toString(36)}`;
    const snap: Snapshot = {
      id, title: "New snapshot", agentId: "chief",
      status: "active", importance: 0.4, confidenceScore: 0.4,
      objective: "", currentState: "",
      decisions: [], openQuestions: [], nextActions: [], blockers: [],
      files: [], memoryRefs: [], conversationRefs: [], artifacts: [], retrievalKeywords: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    upsert(snap);
    setOpenId(id);
  }

  return (
    <AppShell title="Snapshots" subtitle="Resumable agent work · structured state">
      <PageHeader
        eyebrow="Module"
        title="Snapshots"
        description="Snapshots are compressed operational state — not transcripts. Each one captures objective, decisions, open questions, next actions, blockers, and refs so an agent can resume cleanly without reprocessing history."
        hint={
          <OnboardingHint
            id="snapshots.intro"
            title="Snapshots make work resumable"
            docsHref="/docs"
          >
            <p>Use a snapshot when an agent stops mid-task. It saves objective, decisions made, next actions and blockers — no transcript.</p>
            <p>You can create one from a Kanban card or from this page. Snapshots show up as clickable nodes in Flow and become searchable from Memory.</p>
          </OnboardingHint>
        }
      />
      <div className="p-6 space-y-4">
        {/* Filter bar */}
        <div className="panel border border-border rounded-lg p-3 flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2 surface border border-border rounded-md px-2 py-1 flex-1 min-w-[220px]">
            <Search className="w-3.5 h-3.5 text-muted-foreground" />
            <input
              value={filter.query}
              onChange={(e) => setFilter({ query: e.target.value })}
              placeholder="Search objective, decisions, next actions, keywords…"
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <select value={filter.agentId} onChange={(e) => setFilter({ agentId: e.target.value as AgentId | "all" })}
            className="surface border border-border rounded-md px-2 py-1 text-xs">
            <option value="all">All agents</option>
            {AGENTS.map((a) => <option key={a.id} value={a.id}>{labelMap[a.id] ?? a.name}</option>)}
          </select>
          <select value={filter.taskId} onChange={(e) => setFilter({ taskId: e.target.value })}
            className="surface border border-border rounded-md px-2 py-1 text-xs max-w-[200px]">
            <option value="all">All tasks</option>
            {tasks.map((t) => <option key={t.id} value={t.id}>{t.id} · {t.title.slice(0, 28)}</option>)}
          </select>
          <select value={filter.status} onChange={(e) => setFilter({ status: e.target.value as SnapshotStatus | "all" })}
            className="surface border border-border rounded-md px-2 py-1 text-xs">
            <option value="all">All statuses</option>
            <option value="active">active</option>
            <option value="stale">stale</option>
            <option value="completed">completed</option>
            <option value="archived">archived</option>
          </select>
          <span className="text-[10px] text-mono text-muted-foreground ml-1">{filtered.length} result{filtered.length === 1 ? "" : "s"}</span>
          <button onClick={createBlank}
            className="ml-auto text-[11px] px-2 py-1 rounded-md bg-yellow text-primary-foreground flex items-center gap-1 hover:opacity-90">
            <Plus className="w-3 h-3" /> New snapshot
          </button>
        </div>

        {filtered.length === 0 && (
          <div className="text-center text-sm text-muted-foreground py-12 border border-dashed border-border rounded-lg">
            No snapshots match the current filters.
          </div>
        )}

        {filtered.map((s) => {
          const agentName = labelMap[s.agentId] ?? AGENTS.find((a) => a.id === s.agentId)?.name ?? s.agentId;
          const status = s.status ?? "active";
          const importance = s.importance ?? 0.5;
          const tone =
            status === "active" ? "border-sky/50" :
            status === "stale" ? "border-border opacity-80" :
            status === "archived" ? "border-border opacity-50" :
            "border-border opacity-60";
          return (
            <article key={s.id} className={cn("panel border rounded-lg overflow-hidden", tone)}>
              <header className="px-4 py-3 border-b border-border flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 min-w-0">
                  <Camera className={cn("w-4 h-4", status === "active" ? "text-sky" : "text-muted-foreground")} />
                  <button onClick={() => setOpenId(s.id)} className="text-mono text-xs hover:text-yellow underline-offset-2 hover:underline">
                    {s.id}
                  </button>
                  {s.title && <span className="text-xs font-medium truncate max-w-[260px]">{s.title}</span>}
                  <span className="text-xs text-muted-foreground">·</span>
                  <span className="text-xs">{agentName}</span>
                  <span className={cn("ml-2 text-[10px] text-mono px-1.5 py-0.5 rounded border",
                    status === "active" ? "border-sky/60 text-sky" :
                    status === "stale" ? "border-yellow/60 text-yellow" :
                    "border-border text-muted-foreground")}>{status}</span>
                  {s.taskId && (
                    <span className="ml-1 text-[10px] text-mono text-muted-foreground flex items-center gap-1">
                      <ListTodo className="w-3 h-3" /> {s.taskId}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5 text-[10px] text-mono text-muted-foreground">
                    <span>importance</span>
                    <span className="w-16 h-1.5 rounded bg-border overflow-hidden">
                      <span className="block h-full bg-yellow" style={{ width: `${Math.round(importance * 100)}%` }} />
                    </span>
                    <span className="text-yellow">{Math.round(importance * 100)}%</span>
                  </div>
                  <span className="text-[10px] text-mono text-muted-foreground">
                    upd {format(new Date(s.updatedAt ?? s.createdAt), "MMM d, HH:mm")}
                  </span>
                  {status !== "archived" && (
                    <button onClick={() => archive(s.id)}
                      className="px-2 py-1 rounded-md surface border border-border text-[11px] text-muted-foreground hover:text-coral hover:border-coral/60 flex items-center gap-1">
                      <Archive className="w-3 h-3" /> Archive
                    </button>
                  )}
                  <button
                    onClick={() => resume(s)}
                    className="px-2.5 py-1 rounded-md bg-yellow text-primary-foreground text-[11px] font-medium flex items-center gap-1.5 hover:opacity-90"
                  >
                    <Play className="w-3 h-3" /> Resume in Flow
                  </button>
                </div>
              </header>
              <div className="p-4 grid gap-4 lg:grid-cols-2">
                <SnapField label="Objective" body={s.objective} />
                <SnapField label="Current state" body={s.currentState} />
                <SnapList label="Decisions" items={s.decisions} />
                <SnapList label="Next actions" items={s.nextActions} emphasized />
                {(s.openQuestions ?? []).length > 0 && (
                  <SnapList label="Open questions" items={s.openQuestions ?? []} icon={<HelpCircle className="w-3 h-3" />} />
                )}
                {s.blockers.length > 0 && <SnapList label="Blockers" items={s.blockers} tone="coral" />}
                <div>
                  <div className="text-[10px] uppercase text-mono text-muted-foreground tracking-wider mb-2">Refs</div>
                  <div className="flex flex-wrap gap-1.5">
                    {s.files.map((f) => (
                      <span key={f} className="text-[11px] surface border border-border rounded px-1.5 py-0.5 flex items-center gap-1">
                        <FileText className="w-3 h-3" /> {f}
                      </span>
                    ))}
                    {s.memoryRefs.map((m) => (
                      <span key={m} className="text-[11px] surface border border-border rounded px-1.5 py-0.5 flex items-center gap-1">
                        <Brain className="w-3 h-3 text-yellow" /> {m}
                      </span>
                    ))}
                    {(s.conversationRefs ?? []).map((c) => (
                      <span key={c} className="text-[11px] surface border border-border rounded px-1.5 py-0.5 flex items-center gap-1">
                        <MessagesSquare className="w-3 h-3 text-sky" /> {c}
                      </span>
                    ))}
                    {(s.retrievalKeywords ?? []).length > 0 && (
                      <span className="text-[10px] text-mono text-muted-foreground ml-2">
                        keywords: {(s.retrievalKeywords ?? []).join(", ")}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </article>
          );
        })}

        {open && (
          <SnapshotEditDrawer
            snapshot={open}
            onClose={() => setOpenId(null)}
            onPatch={(p) => patch(open.id, p)}
            onResume={() => { resume(open); setOpenId(null); }}
            onArchive={() => { archive(open.id); setOpenId(null); }}
            tasks={tasks.map((t) => ({ id: t.id, title: t.title }))}
          />
        )}
      </div>
    </AppShell>
  );
}

function SnapField({ label, body }: { label: string; body: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase text-mono text-muted-foreground tracking-wider mb-1.5">{label}</div>
      <p className="text-sm text-foreground/90 leading-relaxed">{body}</p>
    </div>
  );
}

function SnapList({ label, items, tone = "default", emphasized = false, icon }: { label: string; items: string[]; tone?: "default" | "coral"; emphasized?: boolean; icon?: React.ReactNode }) {
  return (
    <div className={cn(emphasized && "rounded-md border border-yellow/40 bg-[color-mix(in_oklab,var(--carapace-yellow)_6%,transparent)] p-2")}>
      <div className={cn("text-[10px] uppercase text-mono tracking-wider mb-1.5 flex items-center gap-1",
        emphasized ? "text-yellow" : "text-muted-foreground")}>{icon}{label}</div>
      <ul className="space-y-1 text-sm">
        {items.map((it, i) => (
          <li key={i} className="flex gap-2">
            <span className={tone === "coral" ? "text-coral" : "text-yellow"}>{emphasized ? "→" : "•"}</span>
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Edit drawer
// ---------------------------------------------------------------------------

function SnapshotEditDrawer({ snapshot, onClose, onPatch, onResume, onArchive, tasks }: {
  snapshot: Snapshot;
  onClose: () => void;
  onPatch: (p: Partial<Snapshot>) => void;
  onResume: () => void;
  onArchive: () => void;
  tasks: { id: string; title: string }[];
}) {
  const labelMap = useAgentLabelMap();
  return (
    <div className="fixed inset-0 z-40 pointer-events-none">
      <div className="absolute inset-0 bg-black/40 pointer-events-auto" onClick={onClose} />
      <aside className="absolute top-0 right-0 h-full w-full sm:w-[560px] panel border-l border-border pointer-events-auto overflow-y-auto">
        <div className="px-5 py-4 border-b border-border flex items-start justify-between gap-3 sticky top-0 panel z-10">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground text-mono mb-1">
              {snapshot.id} · {snapshot.status ?? "active"}
            </div>
            <input
              value={snapshot.title ?? ""}
              onChange={(e) => onPatch({ title: e.target.value })}
              placeholder="Snapshot title"
              className="text-base font-semibold leading-tight bg-transparent outline-none w-full"
            />
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button onClick={onResume} className="px-2 py-1 rounded-md bg-yellow text-primary-foreground text-[11px] font-medium flex items-center gap-1.5 hover:opacity-90">
              <Play className="w-3 h-3" /> Resume
            </button>
            <button onClick={onArchive} className="px-2 py-1 rounded-md surface border border-border text-[11px] flex items-center gap-1.5 hover:border-coral/60">
              <Archive className="w-3 h-3" /> Archive
            </button>
            <button onClick={onClose} className="p-1 rounded-md hover:bg-surface text-muted-foreground"><X className="w-4 h-4" /></button>
          </div>
        </div>

        <div className="p-5 space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <FieldSelect label="Agent" value={snapshot.agentId} onChange={(v) => onPatch({ agentId: v as AgentId })}>
              {AGENTS.map((a) => <option key={a.id} value={a.id}>{labelMap[a.id] ?? a.name}</option>)}
            </FieldSelect>
            <FieldSelect label="Linked task" value={snapshot.taskId ?? ""} onChange={(v) => onPatch({ taskId: v || undefined })}>
              <option value="">— none —</option>
              {tasks.map((t) => <option key={t.id} value={t.id}>{t.id} · {t.title.slice(0, 28)}</option>)}
            </FieldSelect>
            <FieldSelect label="Status" value={snapshot.status ?? "active"} onChange={(v) => onPatch({ status: v as SnapshotStatus })}>
              <option value="active">active</option>
              <option value="stale">stale</option>
              <option value="completed">completed</option>
              <option value="archived">archived</option>
            </FieldSelect>
            <FieldRange label={`Importance · ${Math.round((snapshot.importance ?? 0) * 100)}%`} value={snapshot.importance ?? 0.5} onChange={(v) => onPatch({ importance: v })} />
            <FieldRange label={`Confidence · ${Math.round((snapshot.confidenceScore ?? 0) * 100)}%`} value={snapshot.confidenceScore ?? 0.5} onChange={(v) => onPatch({ confidenceScore: v })} />
          </div>

          <FieldText label="Objective" value={snapshot.objective} onChange={(v) => onPatch({ objective: v })} />
          <FieldText label="Current state" value={snapshot.currentState} onChange={(v) => onPatch({ currentState: v })} />
          <FieldList label="Decisions" items={snapshot.decisions} onChange={(items) => onPatch({ decisions: items })} />
          <FieldList label="Next actions" items={snapshot.nextActions} onChange={(items) => onPatch({ nextActions: items })} emphasized />
          <FieldList label="Open questions" items={snapshot.openQuestions ?? []} onChange={(items) => onPatch({ openQuestions: items })} />
          <FieldList label="Blockers" items={snapshot.blockers} onChange={(items) => onPatch({ blockers: items })} tone="coral" />
          <FieldList label="Files" items={snapshot.files} onChange={(items) => onPatch({ files: items })} />
          <FieldList label="Memory refs" items={snapshot.memoryRefs} onChange={(items) => onPatch({ memoryRefs: items })} />
          <FieldList label="Conversation refs" items={snapshot.conversationRefs ?? []} onChange={(items) => onPatch({ conversationRefs: items })} />
          <FieldList label="Artifacts" items={snapshot.artifacts ?? []} onChange={(items) => onPatch({ artifacts: items })} />
          <FieldList label="Retrieval keywords" items={snapshot.retrievalKeywords ?? []} onChange={(items) => onPatch({ retrievalKeywords: items })} />
        </div>
      </aside>
    </div>
  );
}

function FieldSelect({ label, value, onChange, children }: { label: string; value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase text-mono text-muted-foreground tracking-wider">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 w-full surface border border-border rounded-md px-2 py-1.5 text-sm">{children}</select>
    </label>
  );
}
function FieldRange({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase text-mono text-muted-foreground tracking-wider">{label}</span>
      <input type="range" min={0} max={1} step={0.01} value={value} onChange={(e) => onChange(Number(e.target.value))} className="mt-2 w-full accent-[var(--carapace-yellow)]" />
    </label>
  );
}
function FieldText({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase text-mono text-muted-foreground tracking-wider">{label}</span>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={2} className="mt-1 w-full surface border border-border rounded-md px-2 py-1.5 text-sm" />
    </label>
  );
}
function FieldList({ label, items, onChange, tone = "default", emphasized = false }: { label: string; items: string[]; onChange: (v: string[]) => void; tone?: "default" | "coral"; emphasized?: boolean }) {
  const [draft, setDraft] = useState("");
  return (
    <div className={cn(emphasized && "rounded-md border border-yellow/40 bg-[color-mix(in_oklab,var(--carapace-yellow)_6%,transparent)] p-2")}>
      <div className={cn("text-[10px] uppercase text-mono tracking-wider mb-1.5", emphasized ? "text-yellow" : "text-muted-foreground")}>{label}</div>
      <ul className="space-y-1 text-sm mb-1.5">
        {items.map((it, i) => (
          <li key={i} className="flex gap-2 items-start">
            <span className={tone === "coral" ? "text-coral" : "text-yellow"}>{emphasized ? "→" : "•"}</span>
            <input value={it} onChange={(e) => onChange(items.map((x, j) => j === i ? e.target.value : x))} className="flex-1 bg-transparent outline-none border-b border-transparent focus:border-border text-sm" />
            <button onClick={() => onChange(items.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-coral">×</button>
          </li>
        ))}
      </ul>
      <div className="flex gap-1.5">
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={`Add ${label.toLowerCase()}…`} className="flex-1 surface border border-border rounded px-2 py-1 text-xs" />
        <button onClick={() => { if (draft.trim()) { onChange([...items, draft.trim()]); setDraft(""); } }} className="text-[11px] px-2 py-1 rounded surface border border-border hover:border-yellow/60">Add</button>
      </div>
    </div>
  );
}
