import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { PageHeader } from "@/components/shell/PageHeader";
import { MEMORY_ENTRIES, AGENTS } from "@/lib/mock-data";
import { Search, History, Inbox, Check, X as XIcon, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { useMemoryStore, getSourceById, type MemorySearchHit, type WriteLayer } from "@/lib/memory-store";
import { useAgentLabelMap } from "@/lib/agent-registry";

const ENTRY_TABS = ["all", "MEMORY.md", "DREAMS.md", "daily", "snapshot"] as const;
const TOP_TABS = ["search", "browse", "traces", "queue"] as const;
type TopTab = typeof TOP_TABS[number];

const SOURCE_LABEL: Record<string, string> = {
  snapshot: "Snapshot",
  agent_file: "Agent file",
  memory_md: "MEMORY.md",
  dreams_md: "DREAMS.md",
  task_note: "Task note",
  conversation_summary: "Conversation",
};

export const Route = createFileRoute("/memory")({
  head: () => ({
    meta: [
      { title: "Memory — Carapace" },
      { name: "description", content: "Carapace memory command center — full-text search across MEMORY.md, DREAMS.md, daily notes, and snapshots." },
      { property: "og:title", content: "Memory — Carapace" },
      { property: "og:description", content: "Controlled memory for OpenClaw agents." },
    ],
  }),
  component: MemoryPage,
});

function MemoryPage() {
  const [topTab, setTopTab] = useState<TopTab>("search");
  return (
    <AppShell title="Memory" subtitle="Markdown · FTS5 (Postgres FTS in preview) · snapshots">
      <PageHeader
        eyebrow="Module"
        title="Memory command center"
        description="Memory is retrieved, ranked, traced, and controlled — not dumped blindly into agent context. Search across snapshots, agent files, MEMORY.md, DREAMS.md, task notes, and conversation summaries; review every retrieval; approve or reject proposed writes."
      />
      <div className="p-6 space-y-4">
        <div className="flex gap-1.5 border-b border-border">
          {TOP_TABS.map((t) => (
            <button key={t} onClick={() => setTopTab(t)}
              className={cn("text-xs px-3 py-1.5 -mb-px border-b-2 capitalize text-mono",
                topTab === t ? "border-yellow text-yellow" : "border-transparent text-muted-foreground hover:text-foreground")}>
              {t === "queue" ? "Write queue" : t === "traces" ? "Retrieval traces" : t}
            </button>
          ))}
        </div>
        {topTab === "search" && <SearchTab />}
        {topTab === "browse" && <BrowseTab />}
        {topTab === "traces" && <TracesTab />}
        {topTab === "queue" && <QueueTab />}
      </div>
    </AppShell>
  );
}

// --------------------------------------------------------------------------
// Search tab
// --------------------------------------------------------------------------

function SearchTab() {
  const search = useMemoryStore((s) => s.search);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<MemorySearchHit[]>([]);
  const [traceId, setTraceId] = useState<string | null>(null);
  const labelMap = useAgentLabelMap();

  function run() {
    if (!query.trim()) { setHits([]); setTraceId(null); return; }
    const res = search(query.trim(), { topK: 8 });
    setHits(res.hits);
    setTraceId(res.trace.id);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 surface border border-border rounded-md px-3 py-2">
        <Search className="w-4 h-4 text-muted-foreground" />
        <input value={query} onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") run(); }}
          placeholder="Search snapshots, agent files, MEMORY.md, DREAMS.md, task notes, conversations…"
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
        <button onClick={run} className="text-[11px] px-2 py-1 rounded bg-yellow text-primary-foreground flex items-center gap-1">
          <Sparkles className="w-3 h-3" /> Retrieve
        </button>
      </div>
      {traceId && <div className="text-[10px] text-mono text-muted-foreground">Trace recorded: {traceId} · {hits.length} hit{hits.length === 1 ? "" : "s"}</div>}
      <ul className="space-y-2">
        {hits.map((h) => (
          <li key={h.source.id} className="panel border border-border rounded-lg p-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] uppercase text-mono px-1.5 py-0.5 rounded border border-border text-muted-foreground">{SOURCE_LABEL[h.source.kind] ?? h.source.kind}</span>
              {h.source.agentId && <span className="text-[10px] text-mono text-yellow">{labelMap[h.source.agentId] ?? h.source.agentId}</span>}
              <span className="text-[10px] text-mono text-muted-foreground">{h.source.path}</span>
              <span className="ml-auto text-[10px] text-mono text-muted-foreground flex items-center gap-1.5">
                score
                <span className="w-12 h-1 rounded bg-border overflow-hidden">
                  <span className="block h-full bg-yellow" style={{ width: `${Math.round(h.score * 100)}%` }} />
                </span>
                <span className="text-yellow">{Math.round(h.score * 100)}%</span>
              </span>
            </div>
            <div className="text-sm font-medium mt-1">{h.source.title}</div>
            <p className="text-xs text-foreground/80 leading-relaxed mt-1">{h.snippet}</p>
            <div className="text-[10px] text-mono text-muted-foreground mt-1">↳ {h.reason}</div>
          </li>
        ))}
        {hits.length === 0 && query && (
          <li className="text-center text-sm text-muted-foreground py-8 border border-dashed border-border rounded-lg">No matches.</li>
        )}
      </ul>
    </div>
  );
}

// --------------------------------------------------------------------------
// Browse (legacy entries) tab
// --------------------------------------------------------------------------

function BrowseTab() {
  const [tab, setTab] = useState<(typeof ENTRY_TABS)[number]>("all");
  const [q, setQ] = useState("");
  const filtered = MEMORY_ENTRIES.filter((e) =>
    (tab === "all" || e.source === tab) &&
    (q === "" || (e.title + e.excerpt).toLowerCase().includes(q.toLowerCase())),
  );
  return (
    <div className="space-y-4">
        <div className="flex items-center gap-2 surface border border-border rounded-md px-3 py-2">
          <Search className="w-4 h-4 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter promoted entries…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
          <span className="text-[10px] text-mono text-muted-foreground">{filtered.length} results</span>
        </div>
        <div className="flex gap-1.5">
          {ENTRY_TABS.map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={cn("text-[11px] px-2.5 py-1 rounded-md text-mono",
                tab === t ? "bg-yellow/20 text-yellow" : "surface border border-border text-muted-foreground hover:text-foreground")}
            >{t}</button>
          ))}
        </div>
        <ul className="space-y-2">
          {filtered.map((e) => (
            <li key={e.id} className="panel border border-border rounded-lg p-4 hover:border-yellow/40 transition-colors">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[10px] uppercase text-mono text-muted-foreground tracking-wider">{e.source}</div>
                  <div className="text-sm font-semibold mt-0.5">{e.title}</div>
                  <p className="text-xs text-foreground/80 mt-1.5 leading-relaxed">{e.excerpt}</p>
                </div>
                <div className="text-[10px] text-mono text-muted-foreground shrink-0">{format(new Date(e.promotedAt), "MMM d")}</div>
              </div>
            </li>
          ))}
        </ul>
    </div>
  );
}

// --------------------------------------------------------------------------
// Traces tab
// --------------------------------------------------------------------------

function TracesTab() {
  const traces = useMemoryStore((s) => s.traces);
  const clear = useMemoryStore((s) => s.clearTraces);
  const labelMap = useAgentLabelMap();
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground flex items-center gap-2"><History className="w-3.5 h-3.5" /> {traces.length} retrieval{traces.length === 1 ? "" : "s"} recorded</div>
        {traces.length > 0 && <button onClick={clear} className="text-[11px] text-coral hover:underline">Clear traces</button>}
      </div>
      {traces.length === 0 && (
        <div className="text-center text-sm text-muted-foreground py-12 border border-dashed border-border rounded-lg">
          No retrievals yet. Search memory or resume from a snapshot to record traces.
        </div>
      )}
      {traces.map((t) => (
        <article key={t.id} className="panel border border-border rounded-lg overflow-hidden">
          <header className="px-3 py-2 border-b border-border flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-mono text-[10px] text-muted-foreground">{t.id}</span>
              <span className="text-[10px] text-mono px-1.5 py-0.5 rounded border border-border text-muted-foreground capitalize">{t.origin.replace("_", " ")}</span>
              <span className="text-xs">{t.query}</span>
              {t.agentId && <span className="text-[10px] text-mono text-yellow">· {labelMap[t.agentId] ?? t.agentId}</span>}
              {t.taskId && <span className="text-[10px] text-mono text-muted-foreground">· {t.taskId}</span>}
            </div>
            <span className="text-[10px] text-mono text-muted-foreground">{format(new Date(t.ts), "MMM d, HH:mm:ss")}</span>
          </header>
          <div className="p-3 grid gap-3 lg:grid-cols-2 text-xs">
            <div>
              <div className="text-[10px] uppercase text-mono text-yellow tracking-wider mb-1">Selected ({t.selected.length})</div>
              <ul className="space-y-1">
                {t.selected.map((s, i) => {
                  const src = getSourceById(s.sourceId);
                  return (
                    <li key={i} className="flex gap-2">
                      <span className="text-yellow">✓</span>
                      <div className="min-w-0">
                        <div className="text-mono text-[10px] text-muted-foreground">{src?.path ?? s.sourceId} · {Math.round(s.score * 100)}%</div>
                        <div className="text-foreground truncate">{src?.title ?? s.sourceId}</div>
                        <div className="text-[10px] text-muted-foreground">↳ {s.reason}</div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
            <div>
              <div className="text-[10px] uppercase text-mono text-muted-foreground tracking-wider mb-1">Rejected ({t.rejected.length})</div>
              <ul className="space-y-1">
                {t.rejected.length === 0 && <li className="text-muted-foreground">— none —</li>}
                {t.rejected.map((s, i) => {
                  const src = getSourceById(s.sourceId);
                  return (
                    <li key={i} className="flex gap-2 opacity-70">
                      <span className="text-muted-foreground">×</span>
                      <div className="min-w-0">
                        <div className="text-mono text-[10px] text-muted-foreground">{src?.path ?? s.sourceId} · {Math.round(s.score * 100)}%</div>
                        <div className="text-[10px] text-muted-foreground">↳ {s.reason}</div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
            <div className="lg:col-span-2">
              <div className="text-[10px] uppercase text-mono text-muted-foreground tracking-wider mb-1">Final context preview</div>
              <pre className="surface border border-border rounded p-2 text-[11px] text-mono whitespace-pre-wrap">{t.contextPreview || "(empty)"}</pre>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

// --------------------------------------------------------------------------
// Write queue tab
// --------------------------------------------------------------------------

const LAYERS: WriteLayer[] = ["short_term", "medium_term", "long_term", "dreams", "snapshot", "discard"];

function QueueTab() {
  const candidates = useMemoryStore((s) => s.candidates);
  const decide = useMemoryStore((s) => s.decide);
  const apply = useMemoryStore((s) => s.applyApproved);
  const labelMap = useAgentLabelMap();
  const [edits, setEdits] = useState<Record<string, string>>({});
  const grouped = useMemo(() => ({
    pending: candidates.filter((c) => c.status === "pending"),
    decided: candidates.filter((c) => c.status !== "pending"),
  }), [candidates]);
  return (
    <div className="space-y-4">
      <div className="text-xs text-muted-foreground flex items-center gap-2">
        <Inbox className="w-3.5 h-3.5" /> {grouped.pending.length} pending · {grouped.decided.length} resolved
      </div>
      {[...grouped.pending, ...grouped.decided].map((c) => {
        const value = edits[c.id] ?? c.proposedMemory;
        const isPending = c.status === "pending";
        return (
          <article key={c.id} className={cn("panel border rounded-lg p-3 space-y-2",
            c.status === "approved" ? "border-yellow/40" :
            c.status === "applied" ? "border-sky/40" :
            c.status === "rejected" ? "border-coral/40 opacity-70" :
            "border-border")}>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-mono text-[10px] text-muted-foreground">{c.id}</span>
              <span className={cn("text-[10px] uppercase text-mono px-1.5 py-0.5 rounded border",
                c.status === "pending" ? "border-yellow/60 text-yellow" :
                c.status === "approved" ? "border-yellow/60 text-yellow" :
                c.status === "applied" ? "border-sky/60 text-sky" :
                "border-coral/60 text-coral")}>{c.status}</span>
              {c.sourceAgentId && <span className="text-[10px] text-mono text-yellow">{labelMap[c.sourceAgentId] ?? c.sourceAgentId}</span>}
              {c.sourceTaskId && <span className="text-[10px] text-mono text-muted-foreground">· {c.sourceTaskId}</span>}
              <span className="ml-auto text-[10px] text-mono text-muted-foreground flex items-center gap-1.5">
                confidence
                <span className="w-12 h-1 rounded bg-border overflow-hidden">
                  <span className="block h-full bg-yellow" style={{ width: `${Math.round(c.confidence * 100)}%` }} />
                </span>
                <span className="text-yellow">{Math.round(c.confidence * 100)}%</span>
              </span>
            </div>
            <textarea value={value} onChange={(e) => setEdits((s) => ({ ...s, [c.id]: e.target.value }))}
              disabled={!isPending} rows={2}
              className="w-full surface border border-border rounded-md px-2 py-1.5 text-sm disabled:opacity-70" />
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <span>Target layer:</span>
              <select disabled={!isPending} value={c.targetLayer}
                onChange={(e) => useMemoryStore.setState((s) => ({
                  candidates: s.candidates.map((x) => x.id === c.id ? { ...x, targetLayer: e.target.value as WriteLayer } : x),
                }))}
                className="surface border border-border rounded px-1.5 py-0.5 text-xs disabled:opacity-70">
                {LAYERS.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
              <span className="ml-2 text-muted-foreground italic">↳ {c.reason}</span>
            </div>
            {isPending && (
              <div className="flex gap-1.5">
                <button onClick={() => decide(c.id, "approve", value)}
                  className="px-2 py-1 rounded-md bg-yellow text-primary-foreground text-[11px] flex items-center gap-1 hover:opacity-90">
                  <Check className="w-3 h-3" /> Approve
                </button>
                <button onClick={() => decide(c.id, "reject")}
                  className="px-2 py-1 rounded-md surface border border-border text-[11px] flex items-center gap-1 hover:border-coral/60 text-muted-foreground hover:text-coral">
                  <XIcon className="w-3 h-3" /> Reject
                </button>
              </div>
            )}
            {c.status === "approved" && (
              <button onClick={() => apply(c.id)} className="px-2 py-1 rounded-md surface border border-sky/40 text-[11px] text-sky hover:bg-sky/10">
                Mark applied
              </button>
            )}
          </article>
        );
      })}
      {candidates.length === 0 && (
        <div className="text-center text-sm text-muted-foreground py-12 border border-dashed border-border rounded-lg">
          No write candidates pending.
        </div>
      )}
    </div>
  );
}

// Wrapping JSX from prior return
/* eslint-disable @typescript-eslint/no-unused-vars */
function _unused() { return AGENTS; }
/* eslint-enable @typescript-eslint/no-unused-vars */
