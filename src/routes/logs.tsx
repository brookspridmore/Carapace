import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { PageHeader } from "@/components/shell/PageHeader";
import { OnboardingHint } from "@/components/shell/OnboardingHint";
import { EmptyState } from "@/components/shell/EmptyState";
import { LOGS, AGENTS } from "@/lib/mock-data";
import { useGatewayStore } from "@/lib/gateway-store";
import { useAgentLabelMap } from "@/lib/agent-registry";
import { useOpenClawStatus } from "@/lib/openclaw-status";
import { cn } from "@/lib/utils";
import { ScrollText, Pin } from "lucide-react";

const LEVEL_COLOR = {
  debug: "text-muted-foreground",
  info: "text-foreground",
  warn: "text-yellow",
  error: "text-coral",
} as const;

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
  const [agentFilter, setAgentFilter] = useState<string>("all");
  const [pinToBottom, setPinToBottom] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const labelMap = useAgentLabelMap();
  const status = useOpenClawStatus();
  const isGateway = status.mode === "gateway";
  const isMock = status.mode === "mock";

  // Live logs from SSE store
  const liveLogs = useGatewayStore((s) => s.logs);
  const liveAgents = useGatewayStore((s) => s.agents);

  // Fallback to mock in mock mode
  const source = isMock
    ? LOGS.map((l) => ({ ...l, ts: l.ts ?? new Date().toISOString() }))
    : liveLogs;

  const filtered = source.filter(
    (l) =>
      (level === "all" || l.level === level) &&
      (agentFilter === "all" || l.agentId === agentFilter),
  );

  // Auto-scroll to bottom when pinned and new logs arrive
  useEffect(() => {
    if (pinToBottom && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [filtered.length, pinToBottom]);

  const agentOptions = isMock
    ? AGENTS.map((a) => ({ id: a.id, name: labelMap[a.id] ?? a.name }))
    : liveAgents.map((a) => ({ id: a.id, name: labelMap[a.id] ?? a.name ?? a.id }));

  return (
    <AppShell title="Logs" subtitle="Live stream · filtered · audit-ready">
      <PageHeader
        eyebrow="System"
        title="Logs"
        description={
          isGateway
            ? "Live event stream from OpenClaw gateway via SSE. Capped at 1,000 lines."
            : "Last 80 events across all agents."
        }
        hint={
          <OnboardingHint id="logs.intro" title="Append-only audit" docsHref="/docs">
            <p>Every state-changing action emits a log entry: config writes, task moves, approvals, snapshot creations, memory writes. Filter by agent or level to narrow down.</p>
          </OnboardingHint>
        }
      />

      <div className="p-6 space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={level}
            onChange={(e) => setLevel(e.target.value)}
            className="surface border border-border rounded-md px-2 py-1 text-xs"
          >
            <option value="all">All levels</option>
            <option value="debug">debug</option>
            <option value="info">info</option>
            <option value="warn">warn</option>
            <option value="error">error</option>
          </select>

          <select
            value={agentFilter}
            onChange={(e) => setAgentFilter(e.target.value)}
            className="surface border border-border rounded-md px-2 py-1 text-xs"
          >
            <option value="all">All agents</option>
            {agentOptions.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>

          <button
            onClick={() => setPinToBottom((v) => !v)}
            className={cn(
              "ml-auto flex items-center gap-1.5 text-xs px-2 py-1 rounded border",
              pinToBottom
                ? "bg-yellow/15 border-yellow/40 text-yellow"
                : "surface border-border text-muted-foreground hover:text-foreground",
            )}
          >
            <Pin className="w-3 h-3" />
            {pinToBottom ? "Pinned" : "Pin to bottom"}
          </button>

          <span className="text-[10px] text-mono text-muted-foreground">{filtered.length} entries</span>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon={<ScrollText className="w-5 h-5 text-muted-foreground" />}
            message={
              isGateway
                ? "No log events yet — waiting for live stream from gateway."
                : isMock
                  ? "No log entries match the current filter."
                  : "Connect to OpenClaw to see logs."
            }
          />
        ) : (
          <div className="panel border border-border rounded-lg overflow-hidden">
            <div
              ref={scrollRef}
              className="max-h-[65vh] overflow-y-auto text-mono text-[11px]"
              onScroll={(e) => {
                const el = e.currentTarget;
                const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 8;
                if (!atBottom && pinToBottom) setPinToBottom(false);
              }}
            >
              {filtered.map((l, i) => (
                <div
                  key={("id" in l ? l.id : null) ?? i}
                  className="px-4 py-1 flex gap-3 border-b border-border/40 hover:bg-surface"
                >
                  <span className="text-muted-foreground w-44 shrink-0">
                    {(l.ts ?? "").slice(11, 23)}
                  </span>
                  <span className={cn("w-12 shrink-0 uppercase", LEVEL_COLOR[l.level as keyof typeof LEVEL_COLOR] ?? "text-foreground")}>
                    {l.level}
                  </span>
                  <span className="text-yellow w-20 shrink-0 truncate">
                    {l.agentId ?? "—"}
                  </span>
                  <span className="text-foreground/85 truncate">{l.message}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
