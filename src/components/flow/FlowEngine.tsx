import { useEffect, useMemo, useState } from "react";
import {
  ReactFlow, Background, Controls, MiniMap, type Node, type Edge,
  MarkerType, BackgroundVariant,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { nodeTypes } from "./nodes";
import { AGENTS, type Agent, type AgentId } from "@/lib/mock-data";
import { ChevronUp, ChevronDown, Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";

const INPUT_DEFS: { kind: "human" | "telegram" | "terminal" | "api" | "cron" | "parent"; label: string; rate?: string }[] = [
  { kind: "human", label: "Human", rate: "2 msg/min" },
  { kind: "telegram", label: "Telegram", rate: "1 msg/min" },
  { kind: "terminal", label: "Terminal", rate: "idle" },
  { kind: "api", label: "API", rate: "0.4 req/s" },
  { kind: "cron", label: "Cron", rate: "next 14m" },
  { kind: "parent", label: "Parent agent" },
];

const TOOL_DEFS: { kind: "exec" | "web" | "search" | "memory" | "file" | "tts"; label: string; calls?: number }[] = [
  { kind: "exec", label: "exec", calls: 4 },
  { kind: "web", label: "web", calls: 12 },
  { kind: "search", label: "search", calls: 7 },
  { kind: "memory", label: "memory", calls: 18 },
  { kind: "file", label: "file", calls: 3 },
  { kind: "tts", label: "tts", calls: 0 },
];

const INFRA_DEFS: { kind: "db" | "fts" | "snapshots" | "openclaw"; label: string; meta?: string }[] = [
  { kind: "openclaw", label: "OpenClaw", meta: "127.0.0.1:18789" },
  { kind: "db", label: "Postgres", meta: "agents · tasks" },
  { kind: "fts", label: "FTS index", meta: "memory · logs" },
  { kind: "snapshots", label: "Snapshot store", meta: "12 snapshots" },
];

function buildGraph(agent: Agent): { nodes: Node[]; edges: Edge[] } {
  const cx = 480, cy = 260;
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  // Center agent
  nodes.push({
    id: `agent-${agent.id}`,
    type: "agent",
    position: { x: cx, y: cy },
    data: { ...agent } as unknown as Record<string, unknown>,
    draggable: true,
  });

  // Inputs (left column)
  INPUT_DEFS.forEach((inp, i) => {
    const id = `input-${inp.kind}`;
    nodes.push({
      id, type: "input",
      position: { x: 60, y: 60 + i * 70 },
      data: { ...inp } as unknown as Record<string, unknown>,
    });
    const active = agent.status !== "idle" && (i === 0 || i === 3);
    edges.push({
      id: `e-${id}-agent`, source: id, target: `agent-${agent.id}`,
      animated: active,
      style: { stroke: active ? "var(--carapace-sky)" : "var(--color-border)", strokeWidth: active ? 1.5 : 1 },
      label: active ? `${20 + i * 5}ms · $0.0${i + 1}` : undefined,
      labelStyle: { fill: "var(--color-muted-foreground)", fontSize: 10, fontFamily: "JetBrains Mono" },
      labelBgStyle: { fill: "var(--carapace-panel)" },
      markerEnd: { type: MarkerType.ArrowClosed, color: active ? "var(--carapace-sky)" : "var(--color-border)" },
    });
  });

  // Tools (right column)
  TOOL_DEFS.forEach((tool, i) => {
    const id = `tool-${tool.kind}`;
    nodes.push({
      id, type: "tool",
      position: { x: cx + 380, y: 60 + i * 70 },
      data: { ...tool } as unknown as Record<string, unknown>,
    });
    const active = (tool.calls ?? 0) > 0 && agent.status === "executing";
    const stroke = tool.kind === "exec" ? "var(--carapace-coral)" :
                   tool.kind === "memory" ? "var(--carapace-yellow)" :
                   (tool.kind === "web" || tool.kind === "search") ? "var(--carapace-sky)" :
                   "var(--color-border)";
    edges.push({
      id: `e-agent-${id}`, source: `agent-${agent.id}`, target: id,
      animated: active,
      style: { stroke: active ? stroke : "var(--color-border)", strokeWidth: active ? 1.5 : 1, strokeDasharray: active ? "4 4" : undefined },
      label: active ? `${tool.calls} · ${tool.kind === "exec" ? "$0.04" : "$0.01"}` : undefined,
      labelStyle: { fill: "var(--color-muted-foreground)", fontSize: 10, fontFamily: "JetBrains Mono" },
      labelBgStyle: { fill: "var(--carapace-panel)" },
      markerEnd: { type: MarkerType.ArrowClosed, color: active ? stroke : "var(--color-border)" },
    });
  });

  // Infra (bottom row)
  INFRA_DEFS.forEach((infra, i) => {
    const id = `infra-${infra.kind}`;
    nodes.push({
      id, type: "infra",
      position: { x: 200 + i * 200, y: cy + 280 },
      data: { ...infra } as unknown as Record<string, unknown>,
    });
    edges.push({
      id: `e-agent-${id}`, source: `agent-${agent.id}`, target: id,
      style: { stroke: "var(--color-border)", strokeWidth: 1, strokeDasharray: "2 4" },
      markerEnd: { type: MarkerType.ArrowClosed, color: "var(--color-border)" },
    });
  });

  return { nodes, edges };
}

export function FlowEngine() {
  const [selectedId, setSelectedId] = useState<AgentId>("chief");
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [paused, setPaused] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => setTick((x) => x + 1), 2000);
    return () => clearInterval(t);
  }, [paused]);

  const selected = AGENTS.find((a) => a.id === selectedId)!;
  const liveAgent: Agent = useMemo(() => ({
    ...selected,
    tokensUsed: Math.min(selected.tokensMax, selected.tokensUsed + (paused ? 0 : tick * 47)),
    contextPressure: Math.min(0.95, selected.contextPressure + (paused ? 0 : tick * 0.002)),
  }), [selected, tick, paused]);

  const graph = useMemo(() => buildGraph(liveAgent), [liveAgent]);

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      <MetricsStrip agentId={selectedId} tick={tick} />

      <div className="flex-1 grid grid-cols-[200px_1fr] min-h-0">
        {/* Agent rail */}
        <aside className="panel border-r border-border p-3 overflow-y-auto">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground text-mono mb-2 px-1">
            Hierarchy
          </div>
          {AGENTS.map((a) => {
            const active = a.id === selectedId;
            const isChild = !!a.parentId;
            return (
              <button
                key={a.id}
                onClick={() => setSelectedId(a.id)}
                className={cn(
                  "w-full text-left px-2 py-2 rounded-md mb-1 transition-colors flex items-center gap-2",
                  isChild && "ml-3",
                  active ? "bg-surface border-l-2 border-yellow" : "hover:bg-surface border-l-2 border-transparent",
                )}
              >
                <span
                  className={cn(
                    "w-1.5 h-1.5 rounded-full",
                    a.status === "executing" ? "bg-sky" :
                    a.status === "thinking" ? "bg-yellow" :
                    a.status === "error" ? "bg-coral" : "bg-muted-foreground",
                  )}
                />
                <div className="min-w-0">
                  <div className="text-xs font-medium truncate">{a.name}</div>
                  <div className="text-[10px] text-muted-foreground truncate text-mono">{a.model}</div>
                </div>
              </button>
            );
          })}
        </aside>

        {/* Graph */}
        <div className="relative min-w-0">
          <ReactFlow
            nodes={graph.nodes}
            edges={graph.edges}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.15 }}
            proOptions={{ hideAttribution: true }}
            nodesDraggable
            nodesConnectable={false}
            elementsSelectable
            onNodeClick={(_, node) => {
              if (node.type === "agent") {
                const id = node.id.replace("agent-", "") as AgentId;
                if (AGENTS.some((a) => a.id === id)) setSelectedId(id);
              }
            }}
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="oklch(1 0 0 / 0.06)" />
            <Controls className="!bg-[var(--carapace-panel)] !border-[var(--color-border)] !rounded-md [&_button]:!bg-transparent [&_button]:!border-[var(--color-border)] [&_button]:!text-[var(--color-foreground)]" />
            <MiniMap
              pannable zoomable
              className="!bg-[var(--carapace-panel)] !border !border-[var(--color-border)] !rounded-md"
              nodeColor={(n) => n.type === "agent" ? "#F4E27A" : n.type === "tool" ? "#7FD1E8" : "#A0A0A8"}
              maskColor="oklch(0 0 0 / 0.5)"
            />
          </ReactFlow>

          <button
            onClick={() => setPaused((p) => !p)}
            className="absolute top-3 right-3 px-2.5 py-1 rounded-md panel border border-border text-xs flex items-center gap-1.5 hover:border-yellow/60"
          >
            {paused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
            {paused ? "Resume" : "Pause"} simulation
          </button>
        </div>
      </div>

      {/* Bottom log drawer */}
      <div className={cn("panel border-t border-border transition-[height]", drawerOpen ? "h-[160px]" : "h-[36px]")}>
        <button
          onClick={() => setDrawerOpen((o) => !o)}
          className="w-full h-9 px-4 flex items-center justify-between text-xs text-muted-foreground hover:text-foreground"
        >
          <span className="text-mono uppercase tracking-wider">Live log — {selected.name}</span>
          {drawerOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
        </button>
        {drawerOpen && (
          <div className="px-4 pb-3 h-[120px] overflow-y-auto text-mono text-[11px] space-y-0.5">
            {Array.from({ length: 14 }).map((_, i) => {
              const t = new Date(Date.now() - i * 3000).toISOString().slice(11, 19);
              const msgs = [
                "tool.call exec started",
                "memory.read MEMORY.md#brand-voice",
                "edge.payload sent → tool:web",
                "session.heartbeat ok",
                "snapshot.write progress",
                "context.window 71%",
              ];
              return (
                <div key={i} className="flex gap-3">
                  <span className="text-muted-foreground">{t}</span>
                  <span className="text-yellow">{selected.id}</span>
                  <span className="text-foreground/80">{msgs[(i + tick) % msgs.length]}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function MetricsStrip({ agentId, tick }: { agentId: AgentId; tick: number }) {
  const base = { msgs: 14, tokens: 142_300, cost: 1.42, errors: 0 };
  const v = {
    msgs: base.msgs + (tick % 7),
    tokens: base.tokens + tick * 47,
    cost: base.cost + tick * 0.002,
    errors: base.errors,
  };
  return (
    <div className="panel border-b border-border px-4 py-2.5 flex items-center gap-6 text-xs">
      <div className="text-mono uppercase text-[10px] text-muted-foreground">scope: <span className="text-yellow">{agentId}</span></div>
      <Metric label="msgs/min" value={v.msgs.toString()} />
      <Metric label="tokens" value={v.tokens.toLocaleString()} />
      <Metric label="cost" value={`$${v.cost.toFixed(2)}`} />
      <Metric label="errors" value={v.errors.toString()} tone={v.errors ? "coral" : "muted"} />
      <div className="ml-auto text-[10px] text-mono text-muted-foreground">tick {tick}</div>
    </div>
  );
}

function Metric({ label, value, tone = "muted" }: { label: string; value: string; tone?: "muted" | "coral" }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-mono uppercase text-[10px] text-muted-foreground">{label}</span>
      <span className={cn("text-mono font-medium", tone === "coral" ? "text-coral" : "text-foreground")}>{value}</span>
    </div>
  );
}
