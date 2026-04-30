import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/shell/AppShell";
import { PageHeader } from "@/components/shell/PageHeader";
import { SNAPSHOTS, AGENTS } from "@/lib/mock-data";
import { format } from "date-fns";
import { Camera, FileText, Brain, Play, ListTodo } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTaskStore } from "@/lib/task-store";

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

  function resume(snapshotId: string) {
    setFocusedSnapshot(snapshotId);
    navigate({ to: "/", search: { snapshot: snapshotId } as never });
  }

  return (
    <AppShell title="Snapshots" subtitle="Resumable agent work · structured state">
      <PageHeader
        eyebrow="Module"
        title="Snapshots"
        description="Each snapshot captures objective, current state, decisions, next actions, blockers, files, and memory references — so an agent can resume cleanly. Resume from a snapshot to focus the Flow on its next actions."
      />
      <div className="p-6 space-y-4">
        {SNAPSHOTS.map((s) => {
          const agent = AGENTS.find((a) => a.id === s.agentId);
          const status = s.status ?? "active";
          const importance = s.importance ?? 0.5;
          const tone =
            status === "active" ? "border-sky/50" :
            status === "stale" ? "border-border opacity-80" :
            "border-border opacity-60";
          return (
            <article key={s.id} className={cn("panel border rounded-lg overflow-hidden", tone)}>
              <header className="px-4 py-3 border-b border-border flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 min-w-0">
                  <Camera className={cn("w-4 h-4", status === "active" ? "text-sky" : "text-muted-foreground")} />
                  <span className="text-mono text-xs">{s.id}</span>
                  <span className="text-xs text-muted-foreground">·</span>
                  <span className="text-xs">{agent?.name}</span>
                  <span className={cn("ml-2 text-[10px] text-mono px-1.5 py-0.5 rounded border",
                    status === "active" ? "border-sky/60 text-sky" :
                    status === "stale" ? "border-border text-muted-foreground" :
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
                  <button
                    onClick={() => resume(s.id)}
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
                  </div>
                </div>
              </div>
            </article>
          );
        })}
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

function SnapList({ label, items, tone = "default", emphasized = false }: { label: string; items: string[]; tone?: "default" | "coral"; emphasized?: boolean }) {
  return (
    <div className={cn(emphasized && "rounded-md border border-yellow/40 bg-[color-mix(in_oklab,var(--carapace-yellow)_6%,transparent)] p-2")}>
      <div className={cn("text-[10px] uppercase text-mono tracking-wider mb-1.5",
        emphasized ? "text-yellow" : "text-muted-foreground")}>{label}</div>
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
