import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/shell/AppShell";
import { PageHeader } from "@/components/shell/PageHeader";
import { StatusPill } from "@/components/shell/StatusPill";
import { EmptyState } from "@/components/shell/EmptyState";
import { AGENTS } from "@/lib/mock-data";
import { useAgentRegistry } from "@/lib/agent-registry";
import { useGatewayStore } from "@/lib/gateway-store";
import { useOpenClawStatus } from "@/lib/openclaw-status";
import {
  ocListGwAgents, ocGetAgentIdentity, ocUpdateGwAgent, ocDeleteGwAgent,
  ocListAgentFiles, ocGetAgentFile, ocSetAgentFile,
  ocGetEffectiveTools,
} from "@/lib/openclaw-client";
import type { GwAgent, GwAgentFile } from "@/server/gateway/protocol-types";
import { Cpu, FolderOpen, Brain, Pencil, Hash, Trash2, FileText, Save, X, ChevronDown, ChevronRight, Wrench, Plus } from "lucide-react";
import { EditAgentDrawer, AgentSourcePill } from "@/components/agents/EditAgentDrawer";
import { OnboardingHint } from "@/components/shell/OnboardingHint";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/agents")({
  head: () => ({
    meta: [
      { title: "Agents — Carapace" },
      { name: "description", content: "Agent registry — full CRUD, file editor, model override." },
      { property: "og:title", content: "Agents — Carapace" },
      { property: "og:description", content: "Carapace agent management." },
    ],
  }),
  component: AgentsPage,
});

function AgentsPage() {
  const aliases = useAgentRegistry((s) => s.aliases);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fileEditorId, setFileEditorId] = useState<string | null>(null);
  const [toolsId, setToolsId] = useState<string | null>(null);

  const status = useOpenClawStatus();
  const isGateway = status.mode === "gateway";
  const isMock = status.mode === "mock";
  const qc = useQueryClient();

  // Live agents from SSE store
  const liveAgents = useGatewayStore((s) => s.agents);

  const { data: polledAgents = liveAgents, isLoading } = useQuery({
    queryKey: ["gw-agents"],
    queryFn: () => isGateway ? ocListGwAgents() : Promise.resolve<GwAgent[]>([]),
    enabled: isGateway,
    staleTime: 15_000,
  });

  const gwAgents: GwAgent[] = isGateway
    ? (liveAgents.length > 0 ? liveAgents : polledAgents)
    : [];

  const deleteMut = useMutation({
    mutationFn: (id: string) => ocDeleteGwAgent({ id }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["gw-agents"] });
      toast.success("Agent deleted");
    },
    onError: (e) => toast.error(String(e)),
  });

  // Merge gateway agents with local alias overlay
  const cards = isGateway
    ? gwAgents.map((a) => {
        const alias = aliases.find((x) => x.rawOpenClawId === a.id);
        return {
          id: a.id,
          name: alias?.friendlyName ?? a.name ?? a.id,
          role: alias?.role ?? a.role ?? "Agent",
          model: a.model,
          provider: a.provider,
          status: a.status,
          workspacePath: a.workspacePath,
          parentId: a.parentId,
          isGw: true as const,
        };
      })
    : aliases.map((a) => {
        const runtime = AGENTS.find((x) => x.id === a.rawOpenClawId);
        return {
          id: a.rawOpenClawId,
          name: a.friendlyName,
          role: a.role ?? "",
          model: a.model,
          provider: a.provider,
          status: runtime?.status,
          workspacePath: a.workspacePath,
          parentId: a.parentRawOpenClawId,
          isGw: false as const,
        };
      });

  return (
    <AppShell title="Agents" subtitle="Registry · create · edit · delete · file editor">
      <PageHeader
        eyebrow="Module"
        title="Agent registry"
        description={isGateway ? "Live agents from OpenClaw gateway. Create, update, delete agents and edit their bootstrap files." : "Friendly names overlay OpenClaw's raw IDs without changing them."}
        hint={
          <OnboardingHint id="agents.registry" title="Full agent control" docsHref="/docs">
            <p>In gateway mode you can create/delete agents and edit their bootstrap files (soul, memory, system prompt) directly here.</p>
          </OnboardingHint>
        }
        actions={isGateway ? (
          <button className="text-xs px-2.5 py-1 rounded-md bg-yellow text-black flex items-center gap-1.5 hover:opacity-90">
            <Plus className="w-3.5 h-3.5" /> New agent
          </button>
        ) : undefined}
      />

      {isLoading && gwAgents.length === 0 ? (
        <div className="p-6 text-xs text-muted-foreground">Loading agents…</div>
      ) : cards.length === 0 ? (
        <EmptyState icon={<Cpu className="w-5 h-5 text-muted-foreground" />} message="No agents found." />
      ) : (
        <div className="p-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {cards.map((a) => (
            <AgentCard
              key={a.id}
              agent={a}
              onEdit={() => setEditingId(a.id)}
              onFiles={isGateway ? () => setFileEditorId(a.id) : undefined}
              onTools={isGateway ? () => setToolsId(a.id) : undefined}
              onDelete={isGateway ? () => {
                if (confirm(`Delete agent ${a.name}?`)) deleteMut.mutate(a.id);
              } : undefined}
            />
          ))}
        </div>
      )}

      {editingId && !isGateway && <EditAgentDrawer rawId={editingId} onClose={() => setEditingId(null)} />}
      {fileEditorId && <AgentFileEditor agentId={fileEditorId} onClose={() => setFileEditorId(null)} />}
      {toolsId && <AgentToolsPanel agentId={toolsId} onClose={() => setToolsId(null)} />}
    </AppShell>
  );
}

// ── Agent card ─────────────────────────────────────────────────────────────────

function AgentCard({ agent, onEdit, onFiles, onTools, onDelete }: {
  agent: { id: string; name: string; role: string; model?: string; provider?: string; status?: string; workspacePath?: string; parentId?: string };
  onEdit: () => void;
  onFiles?: () => void;
  onTools?: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className="panel border border-border rounded-lg p-4 hover:border-yellow/40 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-md bg-yellow/15 text-yellow flex items-center justify-center text-sm font-semibold uppercase shrink-0">
            {agent.name.slice(0, 2)}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate">{agent.name}</div>
            <div className="text-[11px] text-muted-foreground truncate">{agent.role}</div>
            <div className="text-[10px] text-mono text-muted-foreground mt-0.5 flex items-center gap-1">
              <Hash className="w-2.5 h-2.5" />{agent.id}
            </div>
          </div>
        </div>
        {agent.status && <StatusPill status={agent.status} />}
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-2 text-[11px]">
        <Field icon={<Cpu className="w-3 h-3" />} label="Model" value={`${agent.provider ?? "—"} · ${agent.model ?? "—"}`} />
        {agent.workspacePath && (
          <Field icon={<FolderOpen className="w-3 h-3" />} label="Workspace" value={agent.workspacePath} className="col-span-2" />
        )}
        {agent.parentId && (
          <Field icon={<Hash className="w-3 h-3" />} label="Parent" value={agent.parentId} className="col-span-2" />
        )}
      </dl>
      <div className="mt-3 flex items-center gap-1.5 flex-wrap">
        <button onClick={onEdit} className="px-2 py-1 rounded surface border border-border text-[11px] flex items-center gap-1 hover:border-yellow/60">
          <Pencil className="w-3 h-3" /> Edit
        </button>
        {onFiles && (
          <button onClick={onFiles} className="px-2 py-1 rounded surface border border-border text-[11px] flex items-center gap-1 hover:border-yellow/60">
            <FileText className="w-3 h-3" /> Files
          </button>
        )}
        {onTools && (
          <button onClick={onTools} className="px-2 py-1 rounded surface border border-border text-[11px] flex items-center gap-1 hover:border-yellow/60">
            <Wrench className="w-3 h-3" /> Tools
          </button>
        )}
        {onDelete && (
          <button onClick={onDelete} className="ml-auto px-2 py-1 rounded surface border border-border text-[11px] flex items-center gap-1 hover:border-coral/60 text-muted-foreground hover:text-coral">
            <Trash2 className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );
}

// ── Agent file editor ──────────────────────────────────────────────────────────

function AgentFileEditor({ agentId, onClose }: { agentId: string; onClose: () => void }) {
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [saved, setSaved] = useState(false);

  const { data: files = [], isLoading: loadingFiles } = useQuery({
    queryKey: ["agent-files", agentId],
    queryFn: () => ocListAgentFiles({ agentId }),
  });

  const { data: fileContent, isLoading: loadingFile } = useQuery({
    queryKey: ["agent-file", agentId, selectedPath],
    queryFn: () => selectedPath ? ocGetAgentFile({ agentId, path: selectedPath }) : null,
    enabled: !!selectedPath,
  });

  const qc = useQueryClient();
  const saveMut = useMutation({
    mutationFn: () => {
      if (!selectedPath) throw new Error("No file selected");
      return ocSetAgentFile({ agentId, path: selectedPath, content: draft });
    },
    onSuccess: () => {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      void qc.invalidateQueries({ queryKey: ["agent-file", agentId, selectedPath] });
      toast.success("File saved");
    },
    onError: (e) => toast.error(String(e)),
  });

  // Populate draft when file loads
  const contentStr = fileContent?.content ?? "";
  useState(() => { if (contentStr) setDraft(contentStr); });

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-background border border-border rounded-xl w-full max-w-4xl h-[80vh] flex flex-col shadow-2xl">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h2 className="text-sm font-semibold">Agent files — {agentId}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex flex-1 min-h-0">
          {/* File tree */}
          <aside className="w-52 border-r border-border overflow-y-auto p-2 shrink-0">
            {loadingFiles ? (
              <div className="text-xs text-muted-foreground p-2">Loading…</div>
            ) : files.length === 0 ? (
              <div className="text-xs text-muted-foreground p-2">No files.</div>
            ) : files.map((f) => (
              <button
                key={f.path}
                onClick={() => { setSelectedPath(f.path); setDraft(""); }}
                className={cn("w-full text-left px-2 py-1.5 rounded text-xs font-mono hover:bg-surface truncate", selectedPath === f.path && "bg-yellow/15 text-yellow")}
              >
                {f.path}
              </button>
            ))}
          </aside>

          {/* Editor */}
          <div className="flex-1 flex flex-col min-w-0">
            {!selectedPath ? (
              <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground">Select a file</div>
            ) : loadingFile ? (
              <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground">Loading…</div>
            ) : (
              <>
                <textarea
                  value={draft || contentStr}
                  onChange={(e) => setDraft(e.target.value)}
                  className="flex-1 font-mono text-xs bg-transparent p-4 focus:outline-none resize-none"
                  spellCheck={false}
                />
                <div className="px-4 py-2.5 border-t border-border flex gap-2">
                  <button
                    onClick={() => saveMut.mutate()}
                    disabled={saveMut.isPending}
                    className="text-xs px-3 py-1.5 rounded bg-yellow text-black flex items-center gap-1.5 hover:opacity-90 disabled:opacity-50"
                  >
                    <Save className="w-3.5 h-3.5" /> {saved ? "Saved!" : "Save"}
                  </button>
                  <button onClick={() => setDraft(contentStr)} className="text-xs px-2 py-1.5 rounded surface border border-border hover:border-yellow/60">
                    Reset
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Agent tools panel ─────────────────────────────────────────────────────────

function AgentToolsPanel({ agentId, onClose }: { agentId: string; onClose: () => void }) {
  const { data: tools = [], isLoading } = useQuery({
    queryKey: ["agent-tools", agentId],
    queryFn: () => ocGetEffectiveTools({ agentId }),
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-background border border-border rounded-xl w-full max-w-lg max-h-[70vh] flex flex-col shadow-2xl">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h2 className="text-sm font-semibold">Effective tools — {agentId}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>
        <div className="overflow-y-auto p-3 space-y-1.5">
          {isLoading ? (
            <div className="text-xs text-muted-foreground">Loading…</div>
          ) : tools.length === 0 ? (
            <div className="text-xs text-muted-foreground">No tools available.</div>
          ) : tools.map((t) => (
            <div key={t.name} className={cn("surface border rounded-md px-3 py-2", t.denied ? "border-coral/30" : "border-border")}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-medium">{t.name}</span>
                {t.denied && <span className="text-[9px] uppercase text-mono text-coral">denied</span>}
              </div>
              {t.description && <p className="text-[11px] text-muted-foreground mt-0.5">{t.description}</p>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Shared components ──────────────────────────────────────────────────────────

function Field({ icon, label, value, className }: { icon: React.ReactNode; label: string; value: string; className?: string }) {
  return (
    <div className={"surface rounded-md border border-border px-2 py-1.5 " + (className ?? "")}>
      <div className="flex items-center gap-1 text-[9px] uppercase text-mono text-muted-foreground tracking-wider">{icon}{label}</div>
      <div className="truncate text-foreground">{value}</div>
    </div>
  );
}
