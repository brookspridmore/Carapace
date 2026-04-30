import { useEffect, useMemo, useState } from "react";
import {
  ReactFlow, Background, Controls, MiniMap, type Node, type Edge,
  MarkerType, BackgroundVariant, useNodesState, useEdgesState, useReactFlow,
  ReactFlowProvider,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { nodeTypes } from "./nodes";
import {
  AGENTS, DELEGATIONS, MEMORY_EVENTS, getTaskById,
  type Agent, type AgentId,
} from "@/lib/mock-data";
import { ChevronUp, ChevronDown, Pause, Play, ArrowLeft, RotateCcw, Maximize2, Lock, Unlock } from "lucide-react";
import { cn } from "@/lib/utils";

// ---------- color tokens ----------
const C = {
  delegation: "var(--carapace-yellow)",
  tool:       "var(--carapace-sky)",
  exec:       "var(--carapace-coral)",
  memory:     "var(--carapace-yellow)",
  output:     "var(--carapace-sky)",
  approval:   "var(--carapace-coral)",
  muted:      "var(--color-border)",
};

const INPUT_DEFS: { kind: "human" | "telegram" | "terminal" | "api" | "cron" | "parent"; label: string; rate?: string }[] = [
  { kind: "human", label: "Human", rate: "2 msg/min" },
  { kind: "telegram", label: "Telegram", rate: "1 msg/min" },
  { kind: "terminal", label: "Terminal", rate: "idle" },
  { kind: "api", label: "API", rate: "0.4 req/s" },
  { kind: "cron", label: "Cron", rate: "next 14m" },
];

// Per-agent tool palettes (kept small per agent so the focus view stays clean)
const AGENT_TOOLS: Record<AgentId, { kind: "exec" | "web" | "search" | "memory" | "file" | "tts"; label: string; calls?: number; risky?: boolean }[]> = {
  chief:      [{ kind: "memory", label: "memory", calls: 18 }, { kind: "file", label: "file", calls: 3 }],
  researcher: [{ kind: "web", label: "web", calls: 12 }, { kind: "search", label: "search", calls: 7 }, { kind: "memory", label: "memory", calls: 5 }],
  marketer:   [{ kind: "file", label: "file", calls: 6 }, { kind: "memory", label: "memory", calls: 4 }, { kind: "tts", label: "tts", calls: 0 }],
  builder:    [{ kind: "exec", label: "exec", calls: 4, risky: true }, { kind: "file", label: "file", calls: 9 }, { kind: "search", label: "search", calls: 3 }],
  ops:        [{ kind: "exec", label: "exec", calls: 2, risky: true }, { kind: "file", label: "file", calls: 1 }],
};

const INFRA_DEFS: { kind: "db" | "fts" | "snapshots" | "openclaw"; label: string; meta?: string }[] = [
  { kind: "openclaw", label: "OpenClaw runtime", meta: "127.0.0.1:18789" },
  { kind: "db", label: "Postgres", meta: "agents · tasks" },
  { kind: "fts", label: "FTS index", meta: "memory · logs" },
  { kind: "snapshots", label: "Snapshot store", meta: "12 snapshots" },
];

const toolStroke = (kind: string) =>
  kind === "exec" ? C.exec :
  kind === "memory" ? C.memory :
  (kind === "web" || kind === "search") ? C.tool :
  C.muted;

// ====================================================================
// Build graphs
// ====================================================================

function buildOrchestrationGraph(chief: Agent): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const cx = 540, cy = 280;

  nodes.push({
    id: `agent-${chief.id}`,
    type: "agent",
    position: { x: cx, y: cy - 110 },
    data: { ...chief } as unknown as Record<string, unknown>,
    draggable: true,
  });

  // Inputs feeding chief (left column)
  INPUT_DEFS.forEach((inp, i) => {
    const id = `input-${inp.kind}`;
    nodes.push({
      id, type: "input",
      position: { x: 60, y: 60 + i * 70 },
      data: { ...inp } as unknown as Record<string, unknown>,
    });
    const active = i === 0 || i === 1;
    edges.push({
      id: `e-${id}-chief`, source: id, target: `agent-${chief.id}`,
      animated: active,
      style: { stroke: active ? C.tool : C.muted, strokeWidth: active ? 1.5 : 1 },
      markerEnd: { type: MarkerType.ArrowClosed, color: active ? C.tool : C.muted },
    });
  });

  // Subagents arranged in an arc below the chief, with task nodes between
  const subs = AGENTS.filter((a) => a.parentId === chief.id);
  const baseX = 140;
  const stepX = (1100 - baseX) / Math.max(1, subs.length - 1);
  const subY = cy + 280;
  const taskY = cy + 110;

  subs.forEach((sub, i) => {
    const sx = baseX + i * stepX;
    const subNodeId = `agent-${sub.id}`;
    nodes.push({
      id: subNodeId, type: "agent",
      position: { x: sx, y: subY },
      data: { ...sub, compact: true } as unknown as Record<string, unknown>,
    });

    const deleg = DELEGATIONS.find((d) => d.toAgentId === sub.id);
    if (deleg) {
      const task = getTaskById(deleg.taskId);
      if (task) {
        const taskId = `task-${task.id}`;
        nodes.push({
          id: taskId, type: "task",
          position: { x: sx - 10, y: taskY },
          data: {
            title: task.title,
            status: task.status,
            priority: task.priority,
            hasSnapshot: !!task.snapshotId,
            hasConversation: !!task.conversationId,
            needsReview: task.status === "needs_review",
          } as unknown as Record<string, unknown>,
        });

        const reviewing = deleg.status === "review";
        const blocked = deleg.status === "blocked";
        const stroke = reviewing ? C.approval : blocked ? C.muted : C.delegation;
        edges.push({
          id: `e-chief-${taskId}`,
          source: `agent-${chief.id}`, target: taskId,
          animated: !blocked,
          style: { stroke, strokeWidth: 1.5 },
          label: reviewing ? "needs review" : blocked ? "blocked" : "delegated",
          labelStyle: { fill: "var(--color-muted-foreground)", fontSize: 10, fontFamily: "JetBrains Mono" },
          labelBgStyle: { fill: "var(--carapace-panel)" },
          markerEnd: { type: MarkerType.ArrowClosed, color: stroke },
        });
        edges.push({
          id: `e-${taskId}-${subNodeId}`,
          source: taskId, target: subNodeId,
          animated: !blocked,
          style: { stroke, strokeWidth: 1.5 },
          markerEnd: { type: MarkerType.ArrowClosed, color: stroke },
        });
      }
    } else {
      // Idle subagent — thin dotted connection to chief
      edges.push({
        id: `e-chief-${subNodeId}`,
        source: `agent-${chief.id}`, target: subNodeId,
        style: { stroke: C.muted, strokeWidth: 1, strokeDasharray: "3 5" },
        markerEnd: { type: MarkerType.ArrowClosed, color: C.muted },
      });
    }
  });

  return { nodes, edges };
}

function buildFocusGraph(agent: Agent, chief: Agent): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const cx = 520, cy = 280;

  // Chief (compact, upper-left)
  nodes.push({
    id: `agent-${chief.id}`, type: "agent",
    position: { x: 60, y: 40 },
    data: { ...chief, compact: true, dim: true } as unknown as Record<string, unknown>,
  });

  // Delegated task between chief and focused agent
  const deleg = DELEGATIONS.find((d) => d.toAgentId === agent.id);
  const task = deleg ? getTaskById(deleg.taskId) : undefined;
  if (task) {
    const taskId = `task-${task.id}`;
    nodes.push({
      id: taskId, type: "task",
      position: { x: 280, y: 110 },
      data: {
        title: task.title, status: task.status, priority: task.priority,
        hasSnapshot: !!task.snapshotId, hasConversation: !!task.conversationId,
        needsReview: task.status === "needs_review",
      } as unknown as Record<string, unknown>,
    });
    const stroke = task.status === "needs_review" ? C.approval : C.delegation;
    edges.push({
      id: `e-chief-task`, source: `agent-${chief.id}`, target: taskId,
      animated: true, style: { stroke, strokeWidth: 1.5 },
      markerEnd: { type: MarkerType.ArrowClosed, color: stroke },
      label: "delegated",
      labelStyle: { fill: "var(--color-muted-foreground)", fontSize: 10, fontFamily: "JetBrains Mono" },
      labelBgStyle: { fill: "var(--carapace-panel)" },
    });
    edges.push({
      id: `e-task-agent`, source: taskId, target: `agent-${agent.id}`,
      animated: true, style: { stroke, strokeWidth: 1.5 },
      markerEnd: { type: MarkerType.ArrowClosed, color: stroke },
    });
  }

  // Focused agent at center
  nodes.push({
    id: `agent-${agent.id}`, type: "agent",
    position: { x: cx, y: cy },
    data: { ...agent } as unknown as Record<string, unknown>,
    draggable: true,
  });

  // Inputs (left)
  INPUT_DEFS.slice(0, 4).forEach((inp, i) => {
    const id = `input-${inp.kind}`;
    nodes.push({ id, type: "input", position: { x: 60, y: 260 + i * 70 }, data: { ...inp } as unknown as Record<string, unknown> });
    const active = i === 0 && agent.status !== "idle";
    edges.push({
      id: `e-${id}-agent`, source: id, target: `agent-${agent.id}`,
      animated: active,
      style: { stroke: active ? C.tool : C.muted, strokeWidth: active ? 1.5 : 1 },
      markerEnd: { type: MarkerType.ArrowClosed, color: active ? C.tool : C.muted },
    });
  });

  // Tools (right column)
  const tools = AGENT_TOOLS[agent.id] ?? [];
  tools.forEach((tool, i) => {
    const id = `tool-${tool.kind}`;
    nodes.push({
      id, type: "tool",
      position: { x: cx + 360, y: cy - 60 + i * 80 },
      data: { ...tool } as unknown as Record<string, unknown>,
    });
    const active = (tool.calls ?? 0) > 0 && agent.status === "executing";
    const stroke = toolStroke(tool.kind);
    edges.push({
      id: `e-agent-${id}`, source: `agent-${agent.id}`, target: id,
      animated: active,
      style: {
        stroke: active ? stroke : C.muted,
        strokeWidth: active ? 1.5 : 1,
        strokeDasharray: active && tool.kind !== "exec" ? "4 4" : undefined,
      },
      label: active ? `${tool.calls} · ${tool.kind === "exec" ? "$0.04" : "$0.01"}` : undefined,
      labelStyle: { fill: "var(--color-muted-foreground)", fontSize: 10, fontFamily: "JetBrains Mono" },
      labelBgStyle: { fill: "var(--carapace-panel)" },
      markerEnd: { type: MarkerType.ArrowClosed, color: active ? stroke : C.muted },
    });

    // Approval gate sits between agent and risky tool
    if (tool.risky) {
      const gateId = `approval-${tool.kind}`;
      nodes.push({
        id: gateId, type: "approval",
        position: { x: cx + 180, y: cy - 60 + i * 80 + 20 },
        data: { label: `Approve ${tool.label}`, reason: "exec / risky action" } as unknown as Record<string, unknown>,
      });
      edges.push({
        id: `e-agent-${gateId}`, source: `agent-${agent.id}`, target: gateId,
        animated: true, style: { stroke: C.approval, strokeWidth: 1.5 },
        markerEnd: { type: MarkerType.ArrowClosed, color: C.approval },
      });
      edges.push({
        id: `e-${gateId}-${id}`, source: gateId, target: id,
        style: { stroke: C.approval, strokeWidth: 1.5, strokeDasharray: "4 4" },
        markerEnd: { type: MarkerType.ArrowClosed, color: C.approval },
      });
    }
  });

  // Memory nodes (top-right cluster)
  const events = MEMORY_EVENTS.filter((e) => e.agentId === agent.id);
  events.forEach((ev, i) => {
    const id = `mem-${ev.id}`;
    const x = cx + 60 + (i % 2) * 200;
    const y = cy - 240 + Math.floor(i / 2) * 70;
    nodes.push({
      id, type: "memory",
      position: { x, y },
      data: { kind: ev.kind, ref: ev.ref, note: ev.note } as unknown as Record<string, unknown>,
    });
    if (ev.kind === "read" || ev.kind === "dream") {
      edges.push({
        id: `e-${id}-agent`, source: id, target: `agent-${agent.id}`,
        animated: true,
        style: { stroke: C.memory, strokeWidth: 1.2, strokeDasharray: "4 4" },
        markerEnd: { type: MarkerType.ArrowClosed, color: C.memory },
      });
    } else {
      edges.push({
        id: `e-agent-${id}`, source: `agent-${agent.id}`, target: id,
        animated: true,
        style: { stroke: C.memory, strokeWidth: 1.2, strokeDasharray: "4 4" },
        markerEnd: { type: MarkerType.ArrowClosed, color: C.memory },
      });
    }
  });

  // Output / review nodes (bottom-right)
  if (task) {
    if (task.outputs.length > 0) {
      const id = "output-artifact";
      nodes.push({
        id, type: "output",
        position: { x: cx + 200, y: cy + 220 },
        data: { kind: "artifact", label: "Output Artifact", meta: task.outputs[0] } as unknown as Record<string, unknown>,
      });
      edges.push({
        id: `e-agent-${id}`, source: `agent-${agent.id}`, target: id,
        animated: true,
        style: { stroke: C.output, strokeWidth: 1.2, strokeDasharray: "4 4" },
        markerEnd: { type: MarkerType.ArrowClosed, color: C.output },
      });
    }
    if (task.status === "needs_review") {
      const id = "output-review";
      nodes.push({
        id, type: "output",
        position: { x: cx + 420, y: cy + 220 },
        data: { kind: "review", label: "Needs Review", meta: "operator action" } as unknown as Record<string, unknown>,
      });
      edges.push({
        id: `e-agent-${id}`, source: `agent-${agent.id}`, target: id,
        animated: true,
        style: { stroke: C.approval, strokeWidth: 1.5 },
        markerEnd: { type: MarkerType.ArrowClosed, color: C.approval },
      });
    }
  }

  // Infra row at the bottom — agent connects only to the systems it touches
  INFRA_DEFS.forEach((infra, i) => {
    const id = `infra-${infra.kind}`;
    nodes.push({
      id, type: "infra",
      position: { x: 160 + i * 220, y: cy + 380 },
      data: { ...infra } as unknown as Record<string, unknown>,
    });
    edges.push({
      id: `e-agent-${id}`, source: `agent-${agent.id}`, target: id,
      style: { stroke: C.muted, strokeWidth: 1, strokeDasharray: "2 4" },
      markerEnd: { type: MarkerType.ArrowClosed, color: C.muted },
    });
  });

  return { nodes, edges };
}

// ====================================================================
// Component
// ====================================================================

export function FlowEngine() {
  const [selectedId, setSelectedId] = useState<AgentId>("chief");
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [paused, setPaused] = useState(false);
  const [tick, setTick] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => {
    if (paused || !mounted) return;
    const t = setInterval(() => setTick((x) => x + 1), 2000);
    return () => clearInterval(t);
  }, [paused, mounted]);

  const chief = AGENTS.find((a) => a.id === "chief")!;
  const selected = AGENTS.find((a) => a.id === selectedId)!;
  const isOrchestration = selectedId === "chief";

  const liveAgent: Agent = useMemo(() => ({
    ...selected,
    tokensUsed: Math.min(selected.tokensMax, selected.tokensUsed + (paused ? 0 : tick * 47)),
    contextPressure: Math.min(0.95, selected.contextPressure + (paused ? 0 : tick * 0.002)),
  }), [selected, tick, paused]);

  const graph = useMemo(
    () => isOrchestration ? buildOrchestrationGraph(liveAgent) : buildFocusGraph(liveAgent, chief),
    [isOrchestration, liveAgent, chief],
  );

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      <MetricsStrip agentId={selectedId} tick={tick} mounted={mounted} />

      {/* Breadcrumb / mode bar */}
      <div className="panel border-b border-border px-4 py-2 flex items-center gap-2 text-xs">
        {isOrchestration ? (
          <>
            <span className="text-mono uppercase text-[10px] text-muted-foreground">Mode</span>
            <span className="text-yellow text-mono">Orchestration</span>
            <span className="text-muted-foreground">— Chief of Staff delegating to {AGENTS.filter(a => a.parentId === "chief").length} subagents</span>
          </>
        ) : (
          <>
            <button
              onClick={() => setSelectedId("chief")}
              className="flex items-center gap-1 text-muted-foreground hover:text-yellow transition-colors"
            >
              <ArrowLeft className="w-3 h-3" /> Return to Chief
            </button>
            <span className="text-muted-foreground mx-1">·</span>
            <span className="text-mono">Chief of Staff</span>
            <span className="text-muted-foreground">→</span>
            <span className="text-mono text-yellow">{selected.name}</span>
            <span className="ml-auto text-mono uppercase text-[10px] text-muted-foreground">Agent Focus</span>
          </>
        )}
      </div>

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
              nodeColor={(n) =>
                n.type === "agent" ? "#F4E27A" :
                n.type === "task" ? "#F4E27A" :
                n.type === "approval" ? "#F47C7C" :
                n.type === "tool" ? "#7FD1E8" :
                n.type === "memory" ? "#F4E27A" :
                n.type === "output" ? "#7FD1E8" : "#A0A0A8"}
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
            {mounted ? (
              Array.from({ length: 14 }).map((_, i) => {
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
              })
            ) : (
              <div className="text-muted-foreground">connecting…</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function MetricsStrip({ agentId, tick, mounted }: { agentId: AgentId; tick: number; mounted: boolean }) {
  const base = { msgs: 14, tokens: 142_300, cost: 1.42, errors: 0 };
  const v = mounted ? {
    msgs: base.msgs + (tick % 7),
    tokens: base.tokens + tick * 47,
    cost: base.cost + tick * 0.002,
    errors: base.errors,
  } : base;
  return (
    <div className="panel border-b border-border px-4 py-2.5 flex items-center gap-6 text-xs">
      <div className="text-mono uppercase text-[10px] text-muted-foreground">scope: <span className="text-yellow">{agentId}</span></div>
      <Metric label="msgs/min" value={v.msgs.toString()} />
      <Metric label="tokens" value={v.tokens.toLocaleString()} />
      <Metric label="cost" value={`$${v.cost.toFixed(2)}`} />
      <Metric label="errors" value={v.errors.toString()} tone={v.errors ? "coral" : "muted"} />
      <div className="ml-auto text-[10px] text-mono text-muted-foreground">{mounted ? `tick ${tick}` : "tick 0"}</div>
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
