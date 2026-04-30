import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/shell/AppShell";
import { PageHeader } from "@/components/shell/PageHeader";
import { StatusPill } from "@/components/shell/StatusPill";
import { AGENTS } from "@/lib/mock-data";
import { Cpu, FolderOpen, Brain } from "lucide-react";

export const Route = createFileRoute("/agents")({
  head: () => ({
    meta: [
      { title: "Agents — Carapace" },
      { name: "description", content: "Manage Chief of Staff and subagents — identity, role, model, memory, workspace." },
      { property: "og:title", content: "Agents — Carapace" },
      { property: "og:description", content: "Carapace agent registry." },
    ],
  }),
  component: AgentsPage,
});

function AgentsPage() {
  return (
    <AppShell title="Agents" subtitle="Identity · role · memory · workspace">
      <PageHeader
        eyebrow="Module"
        title="Agent registry"
        description="The Chief of Staff orchestrates four subagents. Click any agent to focus the Flow view on its runtime."
      />
      <div className="p-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {AGENTS.map((a) => (
          <div key={a.id} className="panel border border-border rounded-lg p-4 hover:border-yellow/40 transition-colors">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-md bg-yellow/15 text-yellow flex items-center justify-center text-sm font-semibold uppercase">
                  {a.name.slice(0, 2)}
                </div>
                <div>
                  <div className="text-sm font-semibold">{a.name}</div>
                  <div className="text-[11px] text-muted-foreground">{a.role}</div>
                </div>
              </div>
              <StatusPill status={a.status} />
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-2 text-[11px]">
              <Field icon={<Cpu className="w-3 h-3" />} label="Model" value={`${a.provider} · ${a.model}`} />
              <Field icon={<Brain className="w-3 h-3" />} label="Memory" value={`${(a.memorySizeKb / 1024).toFixed(2)} MB`} />
              <Field icon={<FolderOpen className="w-3 h-3" />} label="Workspace" value={a.workspacePath} className="col-span-2" />
            </dl>
            {a.activeTask && (
              <div className="mt-3 surface rounded-md border border-border px-2.5 py-2 text-[11px]">
                <span className="text-muted-foreground text-mono uppercase mr-1.5">active</span>
                <span>{a.activeTask}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </AppShell>
  );
}

function Field({ icon, label, value, className }: { icon: React.ReactNode; label: string; value: string; className?: string }) {
  return (
    <div className={"surface rounded-md border border-border px-2 py-1.5 " + (className ?? "")}>
      <div className="flex items-center gap-1 text-[9px] uppercase text-mono text-muted-foreground tracking-wider">
        {icon}{label}
      </div>
      <div className="truncate text-foreground">{value}</div>
    </div>
  );
}
