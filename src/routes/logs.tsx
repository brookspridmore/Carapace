import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { PageHeader } from "@/components/shell/PageHeader";
import { LOGS, AGENTS } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

const LEVEL_COLOR = { debug: "text-muted-foreground", info: "text-foreground", warn: "text-yellow", error: "text-coral" } as const;

export const Route = createFileRoute("/logs")({
  head: () => ({
    meta: [
      { title: "Logs — Carapace" },
      { name: "description", content: "Live log stream from OpenClaw, filterable by agent and level." },
      { property: "og:title", content: "Logs — Carapace" },
      { property: "og:description", content: "Operator log viewer for OpenClaw." },
    ],
  }),
  component: LogsPage,
});

function LogsPage() {
  const [level, setLevel] = useState<string>("all");
  const [agent, setAgent] = useState<string>("all");
  const filtered = LOGS.filter((l) => (level === "all" || l.level === level) && (agent === "all" || l.agentId === agent));
  return (
    <AppShell title="Logs" subtitle="Live stream · filtered · audit-ready">
      <PageHeader
        eyebrow="System"
        title="Logs"
        description="Last 80 events across all agents. On the VPS this is a virtualized live stream from OpenClaw + Carapace's own audit log."
      />
      <div className="p-6 space-y-4">
        <div className="flex items-center gap-2">
          <select value={level} onChange={(e) => setLevel(e.target.value)} className="surface border border-border rounded-md px-2 py-1 text-xs">
            <option value="all">All levels</option>
            <option value="debug">debug</option>
            <option value="info">info</option>
            <option value="warn">warn</option>
            <option value="error">error</option>
          </select>
          <select value={agent} onChange={(e) => setAgent(e.target.value)} className="surface border border-border rounded-md px-2 py-1 text-xs">
            <option value="all">All agents</option>
            {AGENTS.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <span className="ml-auto text-[10px] text-mono text-muted-foreground">{filtered.length} entries</span>
        </div>
        <div className="panel border border-border rounded-lg overflow-hidden">
          <div className="max-h-[60vh] overflow-y-auto text-mono text-[11px]">
            {filtered.map((l) => (
              <div key={l.id} className="px-4 py-1 flex gap-3 border-b border-border/50 hover:bg-surface">
                <span className="text-muted-foreground w-44 shrink-0">{l.ts.slice(11, 23)}</span>
                <span className={cn("w-12 shrink-0 uppercase", LEVEL_COLOR[l.level])}>{l.level}</span>
                <span className="text-yellow w-20 shrink-0">{l.agentId}</span>
                <span className="text-foreground/85 truncate">{l.message}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
