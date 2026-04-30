import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { PageHeader } from "@/components/shell/PageHeader";
import { APPROVALS, AGENTS, type ApprovalRequest } from "@/lib/mock-data";
import { useAgentLabelMap } from "@/lib/agent-registry";
import { Check, X, Terminal, FileText, Settings, Brain } from "lucide-react";
import { cn } from "@/lib/utils";

const TYPE_ICON = { command: Terminal, file_edit: FileText, config_change: Settings, memory_write: Brain } as const;

export const Route = createFileRoute("/approvals")({
  head: () => ({
    meta: [
      { title: "Approvals — Carapace" },
      { name: "description", content: "Approve or deny risky agent actions: commands, file edits, config changes, and memory writes." },
      { property: "og:title", content: "Approvals — Carapace" },
      { property: "og:description", content: "Operator approval queue for agent actions." },
    ],
  }),
  component: ApprovalsPage,
});

function ApprovalsPage() {
  const [items, setItems] = useState<ApprovalRequest[]>(APPROVALS);
  const labelMap = useAgentLabelMap();
  function decide(id: string, decision: "approve" | "deny") {
    setItems((prev) => prev.map((a) => a.id === id ? { ...a, status: decision === "approve" ? "approved" : "denied" } : a));
  }
  return (
    <AppShell title="Approvals" subtitle="Operator gate · risky actions only">
      <PageHeader
        eyebrow="System"
        title="Approval queue"
        description="Carapace blocks risky agent actions until you approve. Every decision is logged in the audit trail."
      />
      <div className="p-6 space-y-3 max-w-3xl">
        {items.map((a) => {
          const Icon = TYPE_ICON[a.type];
          const agentName = labelMap[a.agentId] ?? AGENTS.find((x) => x.id === a.agentId)?.name ?? a.agentId;
          const decided = a.status !== "pending";
          return (
            <article key={a.id} className={cn("panel border rounded-lg overflow-hidden", decided ? "border-border opacity-60" : "border-border")}>
              <div className="px-4 py-3 flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-md surface border border-border flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4 text-yellow" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-[10px] uppercase text-mono text-muted-foreground tracking-wider">{a.type.replace("_", " ")}</span>
                      <span className="text-[10px] text-mono text-muted-foreground">·</span>
                      <span className="text-[10px] text-mono text-muted-foreground">{agentName}</span>
                    </div>
                    <div className="text-sm font-medium">{a.summary}</div>
                    <div className="text-xs text-muted-foreground mt-1">{a.details}</div>
                  </div>
                </div>
                {!decided ? (
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => decide(a.id, "approve")} className="px-2.5 py-1 rounded-md bg-sky/15 border border-sky/40 text-sky text-xs flex items-center gap-1 hover:bg-sky/25">
                      <Check className="w-3 h-3" /> Approve
                    </button>
                    <button onClick={() => decide(a.id, "deny")} className="px-2.5 py-1 rounded-md bg-coral/15 border border-coral/40 text-coral text-xs flex items-center gap-1 hover:bg-coral/25">
                      <X className="w-3 h-3" /> Deny
                    </button>
                  </div>
                ) : (
                  <span className="text-[11px] text-mono text-muted-foreground uppercase">{a.status}</span>
                )}
              </div>
              {a.diff && (
                <pre className="mx-4 mb-4 surface border border-border rounded-md p-2.5 text-mono text-[11px] overflow-x-auto">
{a.diff}
                </pre>
              )}
            </article>
          );
        })}
      </div>
    </AppShell>
  );
}
