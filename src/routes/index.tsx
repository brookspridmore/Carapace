import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { FlowEngine } from "@/components/flow/FlowEngine";
import { useOpenClawStatus } from "@/lib/openclaw-status";
import { useGatewayStore } from "@/lib/gateway-store";
import { StatusPill } from "@/components/shell/StatusPill";
import { cn } from "@/lib/utils";
import { Activity, Cpu, MessagesSquare, CheckCircle2, Clock, Zap, AlertCircle } from "lucide-react";
import { format } from "date-fns";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Flow — Carapace" },
      { name: "description", content: "Carapace Flow engine — agent-centric runtime graph showing inputs, tools, memory, and infrastructure for the selected agent." },
      { property: "og:title", content: "Flow — Carapace" },
      { property: "og:description", content: "Agent-centric runtime graph for OpenClaw operators." },
    ],
  }),
  component: FlowPage,
});

function FlowPage() {
  const status = useOpenClawStatus();
  const isMock = status.mode === "mock";
  const isGateway = status.mode === "gateway";

  return (
    <AppShell title="Flow" subtitle="Chief of Staff · agent-centric runtime graph">
      {isMock ? (
        <FlowEngine />
      ) : isGateway ? (
        <GatewayDashboard />
      ) : (
        <FlowEngine />
      )}
    </AppShell>
  );
}

// ── Live gateway overview dashboard ───────────────────────────────────────────

function GatewayDashboard() {
  const agents = useGatewayStore((s) => s.agents);
  const sessions = useGatewayStore((s) => s.sessions);
  const execApprovals = useGatewayStore((s) => s.execApprovals);
  const cronJobs = useGatewayStore((s) => s.cronJobs);
  const health = useGatewayStore((s) => s.health);
  const usageCost = useGatewayStore((s) => s.usageCost);
  const usageStatus = useGatewayStore((s) => s.usageStatus);
  const connectionState = useGatewayStore((s) => s.connectionState);
  const logs = useGatewayStore((s) => s.logs);
  const [agentFilter, setAgentFilter] = useState<string>("all");

  const runningAgents = agents.filter((a) => a.status === "running" || a.status === "active");
  const activeSessions = sessions.filter((s) => s.status === "running");
  const pendingApprovals = execApprovals.filter((a) => a.status === "pending");
  const recentLogs = logs.slice(-20).reverse();

  const filteredSessions = agentFilter === "all"
    ? sessions
    : sessions.filter((s) => s.agentId === agentFilter);

  const agentName = (id?: string) => agents.find((a) => a.id === id)?.name ?? id ?? "—";

  return (
    <div className="p-6 space-y-6">

      {/* Summary tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryTile
          icon={<Cpu className="w-4 h-4" />}
          label="Active agents"
          value={String(runningAgents.length)}
          sub={`of ${agents.length} total`}
          accent={runningAgents.length > 0}
        />
        <SummaryTile
          icon={<MessagesSquare className="w-4 h-4" />}
          label="Running sessions"
          value={String(activeSessions.length)}
          sub={`of ${sessions.length} total`}
          accent={activeSessions.length > 0}
        />
        <SummaryTile
          icon={<AlertCircle className="w-4 h-4" />}
          label="Pending approvals"
          value={String(pendingApprovals.length)}
          sub="exec + plugin"
          accent={pendingApprovals.length > 0}
          accentColor="coral"
        />
        <SummaryTile
          icon={<Clock className="w-4 h-4" />}
          label="Cron jobs"
          value={String(cronJobs.length)}
          sub={`${cronJobs.filter((j) => j.enabled).length} enabled`}
        />
      </div>

      {/* Cost overview */}
      {(usageCost || usageStatus) && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <SummaryTile
            icon={<Zap className="w-4 h-4" />}
            label="Cost today"
            value={usageStatus ? `$${usageStatus.dailyCost.toFixed(4)}` : "—"}
            sub={usageStatus?.currency ?? "USD"}
          />
          <SummaryTile
            icon={<Zap className="w-4 h-4" />}
            label="Cost this month"
            value={usageStatus ? `$${usageStatus.monthlyCost.toFixed(4)}` : "—"}
            sub="MTD"
          />
          <SummaryTile
            icon={<CheckCircle2 className="w-4 h-4" />}
            label="Gateway"
            value={health?.ok ? "Healthy" : "Degraded"}
            sub={connectionState}
            accent={health?.ok}
          />
        </div>
      )}

      {/* Agents grid */}
      {agents.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
            <Cpu className="w-3.5 h-3.5" /> Agents
          </h3>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {agents.map((a) => (
              <div key={a.id} className="panel border border-border rounded-lg px-4 py-3 hover:border-yellow/40 transition-colors">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate">{a.name ?? a.id}</div>
                    <div className="text-[11px] text-muted-foreground truncate">{a.role ?? "—"}</div>
                  </div>
                  {a.status && <StatusPill status={a.status} />}
                </div>
                <div className="mt-2 text-[10px] text-mono text-muted-foreground">
                  {a.model ? `${a.provider ?? ""} · ${a.model}` : "—"}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Sessions list */}
      {sessions.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <MessagesSquare className="w-3.5 h-3.5" /> Sessions
            </h3>
            <div className="flex gap-1">
              <button
                onClick={() => setAgentFilter("all")}
                className={cn("text-[11px] px-2 py-0.5 rounded text-mono", agentFilter === "all" ? "bg-yellow/20 text-yellow" : "text-muted-foreground hover:bg-surface")}
              >All</button>
              {agents.slice(0, 4).map((a) => (
                <button
                  key={a.id}
                  onClick={() => setAgentFilter(a.id)}
                  className={cn("text-[11px] px-2 py-0.5 rounded text-mono truncate max-w-[80px]", agentFilter === a.id ? "bg-yellow/20 text-yellow" : "text-muted-foreground hover:bg-surface")}
                >{a.name ?? a.id}</button>
              ))}
            </div>
          </div>
          <div className="panel border border-border rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-surface text-[10px] uppercase tracking-wider text-mono text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-2.5">Session</th>
                  <th className="text-left px-4 py-2.5">Agent</th>
                  <th className="text-left px-4 py-2.5">Channel</th>
                  <th className="text-left px-4 py-2.5">Status</th>
                  <th className="text-right px-4 py-2.5">Updated</th>
                </tr>
              </thead>
              <tbody>
                {filteredSessions.slice(0, 10).map((s) => (
                  <tr key={s.key} className="border-t border-border hover:bg-surface/50">
                    <td className="px-4 py-2.5 font-mono">{s.title ?? s.key}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{agentName(s.agentId)}</td>
                    <td className="px-4 py-2.5 text-muted-foreground uppercase text-[10px]">{s.channel ?? "—"}</td>
                    <td className="px-4 py-2.5">
                      <span className={cn("text-[10px] uppercase text-mono",
                        s.status === "running" ? "text-sky" : s.status === "error" ? "text-coral" : "text-muted-foreground"
                      )}>{s.status}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right text-muted-foreground">
                      {s.updatedAt ? format(new Date(s.updatedAt), "HH:mm") : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Recent logs */}
      {recentLogs.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
            <Activity className="w-3.5 h-3.5" /> Recent log events
          </h3>
          <div className="panel border border-border rounded-lg overflow-hidden font-mono text-[11px]">
            {recentLogs.map((l) => (
              <div
                key={l.id}
                className={cn(
                  "px-4 py-1.5 border-b border-border/50 flex items-start gap-3",
                  l.level === "error" ? "text-coral" : l.level === "warn" ? "text-yellow" : "text-muted-foreground",
                )}
              >
                <span className="shrink-0 text-[10px] uppercase w-10">{l.level}</span>
                <span className="flex-1 truncate">{l.message}</span>
                <span className="shrink-0 text-[10px]">{format(new Date(l.ts), "HH:mm:ss")}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Empty state when no data yet */}
      {agents.length === 0 && sessions.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
          <Activity className="w-8 h-8 text-muted-foreground" />
          <div className="text-sm font-medium">Connecting to OpenClaw gateway…</div>
          <div className="text-xs text-muted-foreground">
            State: <span className="text-mono text-yellow">{connectionState}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryTile({ icon, label, value, sub, accent, accentColor = "yellow" }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  accent?: boolean;
  accentColor?: "yellow" | "coral";
}) {
  return (
    <div className="panel border border-border rounded-lg p-3">
      <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
        {icon}
        <span className="text-[10px] uppercase tracking-wider text-mono">{label}</span>
      </div>
      <div className={cn("text-lg font-semibold", accent
        ? accentColor === "coral" ? "text-coral" : "text-yellow"
        : "text-foreground"
      )}>{value}</div>
      <div className="text-[10px] text-muted-foreground">{sub}</div>
    </div>
  );
}
