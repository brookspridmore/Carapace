import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { PageHeader } from "@/components/shell/PageHeader";
import { StatusPill } from "@/components/shell/StatusPill";
import { AGENTS } from "@/lib/mock-data";
import { useAgentRegistry } from "@/lib/agent-registry";
import { Cpu, FolderOpen, Brain, Pencil, Hash } from "lucide-react";
import { EditAgentDrawer, AgentSourcePill } from "@/components/agents/EditAgentDrawer";
import { OnboardingHint } from "@/components/shell/OnboardingHint";

export const Route = createFileRoute("/agents")({
  head: () => ({
    meta: [
      { title: "Agents — Carapace" },
      { name: "description", content: "Agent registry — friendly names, roles, hierarchy, OpenClaw config bridge." },
      { property: "og:title", content: "Agents — Carapace" },
      { property: "og:description", content: "Carapace agent registry." },
    ],
  }),
  component: AgentsPage,
});

function AgentsPage() {
  const aliases = useAgentRegistry((s) => s.aliases);
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <AppShell title="Agents" subtitle="Registry · friendly names · OpenClaw config bridge">
      <PageHeader
        eyebrow="Module"
        title="Agent registry"
        description="Friendly names overlay OpenClaw's raw IDs without losing them. Edit any agent to update the alias locally — push to OpenClaw config when you're ready."
        hint={
          <OnboardingHint
            id="agents.registry"
            title="Name your Chief and subagents first"
            docsHref="/docs"
          >
            <p>OpenClaw uses raw IDs like <code className="text-mono">agt_a8f3</code>. Carapace overlays a friendly name on top — raw IDs never change.</p>
            <p>Click <strong>Edit</strong> on any card to rename, set a parent, or attach a workspace. Edits stay local until you push them to the OpenClaw config.</p>
          </OnboardingHint>
        }
      />
      <div className="p-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {aliases.map((a) => {
          const runtime = AGENTS.find((x) => x.id === a.rawOpenClawId);
          return (
            <div key={a.rawOpenClawId} className="panel border border-border rounded-lg p-4 hover:border-yellow/40 transition-colors">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-md bg-yellow/15 text-yellow flex items-center justify-center text-sm font-semibold uppercase shrink-0">
                    {a.friendlyName.slice(0, 2)}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate">{a.friendlyName}</div>
                    <div className="text-[11px] text-muted-foreground truncate">{a.role}</div>
                    <div className="text-[10px] text-mono text-muted-foreground mt-0.5 flex items-center gap-1">
                      <Hash className="w-2.5 h-2.5" />{a.rawOpenClawId}
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  {runtime && <StatusPill status={runtime.status} />}
                  <AgentSourcePill source={a.source} />
                </div>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-2 text-[11px]">
                <Field icon={<Cpu className="w-3 h-3" />} label="Model" value={`${a.provider ?? "—"} · ${a.model ?? "—"}`} />
                <Field icon={<Brain className="w-3 h-3" />} label="Memory" value={a.memoryPath ?? "—"} />
                <Field icon={<FolderOpen className="w-3 h-3" />} label="Workspace" value={a.workspacePath ?? "—"} className="col-span-2" />
              </dl>
              {a.tags && a.tags.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1">
                  {a.tags.map((t) => (
                    <span key={t} className="text-[9px] text-mono px-1.5 py-0.5 rounded border border-border surface">{t}</span>
                  ))}
                </div>
              )}
              {runtime?.activeTask && (
                <div className="mt-3 surface rounded-md border border-border px-2.5 py-2 text-[11px]">
                  <span className="text-muted-foreground text-mono uppercase mr-1.5">active</span>
                  <span>{runtime.activeTask}</span>
                </div>
              )}
              <div className="mt-3 flex items-center gap-2">
                <button
                  onClick={() => setEditingId(a.rawOpenClawId)}
                  className="px-2.5 py-1 rounded-md surface border border-border text-[11px] flex items-center gap-1.5 hover:border-yellow/60"
                >
                  <Pencil className="w-3 h-3" /> Edit
                </button>
                {a.dirty && (
                  <span className="text-[10px] text-mono text-yellow">unsynced changes</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {editingId && <EditAgentDrawer rawId={editingId} onClose={() => setEditingId(null)} />}
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
