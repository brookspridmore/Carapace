import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/shell/AppShell";
import { PageHeader } from "@/components/shell/PageHeader";
import { SNAPSHOTS, AGENTS } from "@/lib/mock-data";
import { format } from "date-fns";
import { Camera, FileText, Brain } from "lucide-react";

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
  return (
    <AppShell title="Snapshots" subtitle="Resumable agent work · structured state">
      <PageHeader
        eyebrow="Module"
        title="Snapshots"
        description="Each snapshot captures objective, current state, decisions, next actions, blockers, files, and memory references — so an agent can resume cleanly."
      />
      <div className="p-6 space-y-4">
        {SNAPSHOTS.map((s) => {
          const agent = AGENTS.find((a) => a.id === s.agentId);
          return (
            <article key={s.id} className="panel border border-border rounded-lg overflow-hidden">
              <header className="px-4 py-3 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Camera className="w-4 h-4 text-yellow" />
                  <span className="text-mono text-xs">{s.id}</span>
                  <span className="text-xs text-muted-foreground">·</span>
                  <span className="text-xs">{agent?.name}</span>
                </div>
                <span className="text-[10px] text-mono text-muted-foreground">{format(new Date(s.createdAt), "MMM d, HH:mm")}</span>
              </header>
              <div className="p-4 grid gap-4 lg:grid-cols-2">
                <SnapField label="Objective" body={s.objective} />
                <SnapField label="Current state" body={s.currentState} />
                <SnapList label="Decisions" items={s.decisions} />
                <SnapList label="Next actions" items={s.nextActions} />
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

function SnapList({ label, items, tone = "default" }: { label: string; items: string[]; tone?: "default" | "coral" }) {
  return (
    <div>
      <div className="text-[10px] uppercase text-mono text-muted-foreground tracking-wider mb-1.5">{label}</div>
      <ul className="space-y-1 text-sm">
        {items.map((it, i) => (
          <li key={i} className="flex gap-2">
            <span className={tone === "coral" ? "text-coral" : "text-yellow"}>•</span>
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
