import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/shell/AppShell";
import { PageHeader } from "@/components/shell/PageHeader";
import { OnboardingHint } from "@/components/shell/OnboardingHint";
import { EmptyState } from "@/components/shell/EmptyState";
import { useGatewayStore } from "@/lib/gateway-store";
import { useOpenClawStatus } from "@/lib/openclaw-status";
import {
  ocListExecApprovals, ocResolveExecApproval,
  ocListPluginApprovals, ocResolvePluginApproval,
  ocGetApprovalPolicy, ocSetApprovalPolicy,
  ocListApprovals, ocResolveApproval,
} from "@/lib/openclaw-client";
import type { GwExecApproval } from "@/server/gateway/protocol-types";
import type { ApprovalRequest } from "@/lib/mock-data";
import { Check, X, Terminal, FileText, Settings, Brain, ShieldCheck, RefreshCw, Plug } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const TYPE_ICON = {
  command: Terminal, exec: Terminal,
  file_edit: FileText, file: FileText,
  config_change: Settings, config: Settings,
  memory_write: Brain, memory: Brain,
} as const;

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
  const status = useOpenClawStatus();
  const isGateway = status.mode === "gateway";
  const isMock = status.mode === "mock";
  const qc = useQueryClient();

  // Live approvals from SSE store (gateway mode)
  const liveExecApprovals = useGatewayStore((s) => s.execApprovals);

  // Polled approvals as fallback / initial load
  const { data: polledExec = [], isLoading: loadingExec, refetch: refetchExec } = useQuery({
    queryKey: ["exec-approvals"],
    queryFn: () => isGateway ? ocListExecApprovals() : ocListApprovals(),
    refetchInterval: isGateway ? false : 10_000, // gateway uses SSE push
    staleTime: 5_000,
  });

  const { data: pluginApprovals = [] } = useQuery({
    queryKey: ["plugin-approvals"],
    queryFn: () => isGateway ? ocListPluginApprovals() : Promise.resolve([]),
    enabled: isGateway,
    refetchInterval: false,
  });

  const { data: policy } = useQuery({
    queryKey: ["approval-policy"],
    queryFn: () => isGateway ? ocGetApprovalPolicy() : Promise.resolve(null),
    enabled: isGateway,
  });

  // Merge: SSE-live takes precedence, fall back to polled
  const execApprovals: (GwExecApproval | ApprovalRequest)[] =
    isGateway && liveExecApprovals.length > 0
      ? liveExecApprovals
      : (polledExec as (GwExecApproval | ApprovalRequest)[]);

  const pending = execApprovals.filter((a) => a.status === "pending");
  const decided = execApprovals.filter((a) => a.status !== "pending");

  const resolveExecMut = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: "approve" | "deny" }) =>
      isGateway ? ocResolveExecApproval({ id, decision }) : ocResolveApproval({ id, decision }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["exec-approvals"] });
      toast.success("Decision recorded");
    },
    onError: (e) => toast.error(String(e)),
  });

  const resolvePluginMut = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: "approve" | "deny" }) =>
      ocResolvePluginApproval({ id, decision }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["plugin-approvals"] });
      toast.success("Plugin decision recorded");
    },
    onError: (e) => toast.error(String(e)),
  });

  function decide(id: string, decision: "approve" | "deny") {
    resolveExecMut.mutate({ id, decision });
  }

  return (
    <AppShell title="Approvals" subtitle="Operator gate · risky actions only">
      <PageHeader
        eyebrow="System"
        title="Approval queue"
        description="Carapace blocks risky agent actions until you approve. Every decision is logged."
        hint={
          <OnboardingHint id="approvals.intro" title="You are the gate" docsHref="/docs">
            <p>Destructive, expensive, or external operations (file writes, API calls, config writes, memory writes) land here first.</p>
            <p>Carapace never auto-approves. The badge in the top bar shows how many are waiting.</p>
          </OnboardingHint>
        }
      />

      {/* Approval policy banner */}
      {policy && (
        <div className="mx-6 mb-4 p-3 surface border border-border rounded-lg flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="w-3.5 h-3.5 text-yellow shrink-0" />
          <span>
            Policy: auto-approve [{(policy.autoApprove ?? []).join(", ") || "none"}] · auto-deny [{(policy.autoDeny ?? []).join(", ") || "none"}] · require [{(policy.requireApproval ?? []).join(", ") || "all"}]
          </span>
        </div>
      )}

      <div className="p-6 space-y-6 max-w-3xl">

        {/* Exec approvals */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Pending ({pending.length})
            </h3>
            <button onClick={() => refetchExec()} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
              <RefreshCw className="w-3 h-3" /> Refresh
            </button>
          </div>

          {loadingExec ? (
            <div className="text-xs text-muted-foreground">Loading approvals…</div>
          ) : pending.length === 0 ? (
            <EmptyState
              icon={<ShieldCheck className="w-5 h-5 text-muted-foreground" />}
              message={isMock ? "No approvals pending (mock mode)." : isGateway ? "No pending approvals." : "Connect to OpenClaw to see approvals."}
            />
          ) : (
            <div className="space-y-3">
              {pending.map((a) => <ApprovalCard key={a.id} item={a} onDecide={decide} deciding={resolveExecMut.isPending} />)}
            </div>
          )}
        </section>

        {/* Plugin approvals */}
        {pluginApprovals.length > 0 && (
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
              <Plug className="w-3 h-3" /> Plugin approvals ({pluginApprovals.length})
            </h3>
            <div className="space-y-3">
              {pluginApprovals.map((a) => (
                <article key={a.id} className="panel border border-border rounded-lg px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs text-muted-foreground mb-0.5">{a.plugin} · {a.action}</div>
                      <pre className="text-xs text-mono text-muted-foreground overflow-x-auto">{JSON.stringify(a.params, null, 2)}</pre>
                    </div>
                    {a.status === "pending" && (
                      <div className="flex gap-1 shrink-0">
                        <button onClick={() => resolvePluginMut.mutate({ id: a.id, decision: "approve" })} className="px-2.5 py-1 rounded-md bg-sky/15 border border-sky/40 text-sky text-xs flex items-center gap-1 hover:bg-sky/25">
                          <Check className="w-3 h-3" /> Approve
                        </button>
                        <button onClick={() => resolvePluginMut.mutate({ id: a.id, decision: "deny" })} className="px-2.5 py-1 rounded-md bg-coral/15 border border-coral/40 text-coral text-xs flex items-center gap-1 hover:bg-coral/25">
                          <X className="w-3 h-3" /> Deny
                        </button>
                      </div>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {/* Decided log */}
        {decided.length > 0 && (
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Recent decisions ({decided.length})
            </h3>
            <div className="space-y-2 opacity-60">
              {decided.slice(0, 10).map((a) => <ApprovalCard key={a.id} item={a} onDecide={decide} deciding={false} />)}
            </div>
          </section>
        )}
      </div>
    </AppShell>
  );
}

// ── Approval card ─────────────────────────────────────────────────────────────

type AnyApproval = GwExecApproval | ApprovalRequest;

function isGwApproval(a: AnyApproval): a is GwExecApproval {
  return "tool" in a;
}

function ApprovalCard({ item, onDecide, deciding }: {
  item: AnyApproval;
  onDecide: (id: string, d: "approve" | "deny") => void;
  deciding: boolean;
}) {
  const decided = item.status !== "pending";
  const typeKey = isGwApproval(item) ? "exec" : item.type;
  const Icon = TYPE_ICON[typeKey as keyof typeof TYPE_ICON] ?? Terminal;

  const title = isGwApproval(item)
    ? `Tool: ${item.tool}`
    : "title" in item ? (item as ApprovalRequest).title ?? "" : "";

  const description = isGwApproval(item)
    ? JSON.stringify(item.input ?? {}, null, 2)
    : "description" in item ? (item as ApprovalRequest).description ?? "" : "";

  const agentLabel = isGwApproval(item) ? item.agentId : (item as ApprovalRequest).agentId;

  return (
    <article className={cn("panel border rounded-lg overflow-hidden", decided ? "border-border" : "border-yellow/30 bg-yellow/5")}>
      <div className="px-4 py-3 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-8 h-8 rounded-md surface border border-border flex items-center justify-center shrink-0">
            <Icon className="w-4 h-4 text-yellow" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-[10px] uppercase text-mono text-muted-foreground tracking-wider">{typeKey.replace("_", " ")}</span>
              {agentLabel && <>
                <span className="text-[10px] text-mono text-muted-foreground">·</span>
                <span className="text-[10px] text-mono text-muted-foreground">{agentLabel}</span>
              </>}
            </div>
            <div className="text-sm font-medium truncate">{title}</div>
            {description && (
              <div className="text-xs text-muted-foreground mt-1 max-h-20 overflow-y-auto whitespace-pre-wrap">{description}</div>
            )}
          </div>
        </div>
        {!decided ? (
          <div className="flex gap-1 shrink-0">
            <button disabled={deciding} onClick={() => onDecide(item.id, "approve")} className="px-2.5 py-1 rounded-md bg-sky/15 border border-sky/40 text-sky text-xs flex items-center gap-1 hover:bg-sky/25 disabled:opacity-50">
              <Check className="w-3 h-3" /> Approve
            </button>
            <button disabled={deciding} onClick={() => onDecide(item.id, "deny")} className="px-2.5 py-1 rounded-md bg-coral/15 border border-coral/40 text-coral text-xs flex items-center gap-1 hover:bg-coral/25 disabled:opacity-50">
              <X className="w-3 h-3" /> Deny
            </button>
          </div>
        ) : (
          <span className={cn(
            "text-[11px] text-mono uppercase shrink-0",
            item.status === "approved" ? "text-sky" : "text-coral",
          )}>{item.status}</span>
        )}
      </div>
    </article>
  );
}
