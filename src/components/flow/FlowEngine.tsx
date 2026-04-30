import { useEffect, useMemo, useState } from "react";
import {
  ReactFlow, Background, Controls, MiniMap, type Node, type Edge,
  MarkerType, BackgroundVariant, useNodesState, useEdgesState, useReactFlow,
  ReactFlowProvider,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { nodeTypes } from "./nodes";
import {
  AGENTS, MEMORY_EVENTS, type Agent, type AgentId, type Task,
} from "@/lib/mock-data";
import { useTaskStore, isActiveTask } from "@/lib/task-store";
import {
  ChevronUp, ChevronDown, Pause, Play, ArrowLeft,
  RotateCcw, Maximize2, Lock, Unlock, Filter,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useNavigate, useSearch } from "@tanstack/react-router";

// ---------- color tokens ----------
const C = {
  delegation: "var(--carapace-yellow)",
  tool:       "var(--carapace-sky)",
  exec:       "var(--carapace-coral)",
  memory:     "var(--carapace-yellow)",
  output:     "var(--carapace-sky)",
  approval:   "var(--carapace-coral)",
  blocked:    "var(--carapace-coral)",
  running:    "var(--carapace-sky)",
  review:     "var(--carapace-yellow)",
  muted:      "var(--color-border)",
};

const INPUT_DEFS: { kind: "human" | "telegram" | "terminal" | "api" | "cron" | "parent"; label: string; rate?: string }[] = [
  { kind: "human", label: "Human", rate: "2 msg/min" },
  { kind: "telegram", label: "Telegram", rate: "1 msg/min" },
  { kind: "terminal", label: "Terminal", rate: "idle" },
  { kind: "api", label: "API", rate: "0.4 req/s" },
  { kind: "cron", label: "Cron", rate: "next 14m" },
];

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

// Edge color/style derived from task status
function taskEdgeStyle(t: Task) {
  if (t.status === "blocked") return { stroke: C.blocked, dashed: true, animated: false, label: "blocked" };
  if (t.status === "needs_review") return { stroke: C.review, dashed: false, animated: true, label: "needs review" };
  if (t.status === "running") return { stroke: C.running, dashed: false, animated: true, label: "running" };
  if (t.status === "failed") return { stroke: C.muted, dashed: true, animated: false, label: "failed" };
  if (t.status === "done") return { stroke: C.muted, dashed: true, animated: false, label: "done" };
  return { stroke: C.delegation, dashed: false, animated: true, label: "delegated" };
}

function taskNodeData(t: Task, focused: boolean) {
  return {
    id: t.id,
    title: t.title,
    status: t.status,
    priority: t.priority,
    agentName: AGENTS.find((a) => a.id === t.agentId)?.name,
    hasSnapshot: !!t.snapshotId,
    hasConversation: !!t.conversationId,
    needsReview: t.status === "needs_review",
    blocked: t.status === "blocked",
    done: t.status === "done",
    focused,
  } as unknown as Record<string, unknown>;
}

// ====================================================================
// Orchestration graph — driven by live tasks
// ====================================================================

function buildOrchestrationGraph(
  chief: Agent,
  tasks: Task[],
  opts: { showCompleted: boolean; focusedTaskId: string | null; filterToFocused: boolean },
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const cx = 700, cy = 240;

  nodes.push({
    id: `agent-${chief.id}`,
    type: "agent",
    position: { x: cx, y: cy - 160 },
    data: { ...chief } as unknown as Record<string, unknown>,
  });

  // Inputs feeding chief
  INPUT_DEFS.forEach((inp, i) => {
    const id = `input-${inp.kind}`;
    nodes.push({
      id, type: "input",
      position: { x: 40, y: 40 + i * 80 },
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

  const subs = AGENTS.filter((a) => a.parentId === chief.id);
  const baseX = 220;
  const stepX = 340;
  const subY = cy + 460;

  subs.forEach((sub, i) => {
    const sx = baseX + i * stepX;
    const stagger = (i % 2) * 70;
    const subNodeId = `agent-${sub.id}`;

    // Tasks belonging to this subagent
    const agentTasks = tasks
      .filter((t) => t.agentId === sub.id)
      .filter((t) => opts.showCompleted ? true : t.status !== "done")
      .filter((t) => opts.filterToFocused && opts.focusedTaskId
        ? t.id === opts.focusedTaskId
        : isActiveTask(t) || (opts.showCompleted && (t.status === "done" || t.status === "failed"))
      );

    // Render subagent (faded if no active work)
    const hasWork = agentTasks.some(isActiveTask);
    nodes.push({
      id: subNodeId, type: "agent",
      position: { x: sx, y: subY + stagger },
      data: { ...sub, compact: true, dim: !hasWork } as unknown as Record<string, unknown>,
    });

    if (agentTasks.length === 0) {
      // Idle — thin dotted link to chief
      edges.push({
        id: `e-chief-${subNodeId}`,
        source: `agent-${chief.id}`, target: subNodeId,
        style: { stroke: C.muted, strokeWidth: 1, strokeDasharray: "3 5" },
        markerEnd: { type: MarkerType.ArrowClosed, color: C.muted },
      });
      return;
    }

    // Stack tasks vertically between chief and subagent
    const taskBaseY = cy + 100 + stagger / 2;
    const taskStepY = 110;

    agentTasks.forEach((task, ti) => {
      const taskId = `task-${task.id}`;
      const focused = task.id === opts.focusedTaskId;
      const tx = sx + (ti - (agentTasks.length - 1) / 2) * 30;
      const ty = taskBaseY + ti * taskStepY;

      nodes.push({
        id: taskId, type: "task",
        position: { x: tx - 10, y: ty },
        data: taskNodeData(task, focused),
        className: focused ? "ring-2 ring-yellow rounded-md" : undefined,
      });

      const es = taskEdgeStyle(task);
      edges.push({
        id: `e-chief-${taskId}`,
        source: `agent-${chief.id}`, target: taskId,
        animated: es.animated && !task.status.startsWith("don"),
        style: {
          stroke: es.stroke,
          strokeWidth: focused ? 2.5 : 1.5,
          strokeDasharray: es.dashed ? "4 4" : undefined,
          opacity: task.status === "done" ? 0.4 : 1,
        },
        label: es.label,
        labelStyle: { fill: "var(--color-muted-foreground)", fontSize: 10, fontFamily: "JetBrains Mono" },
        labelBgStyle: { fill: "var(--carapace-panel)" },
        markerEnd: { type: MarkerType.ArrowClosed, color: es.stroke },
      });
      edges.push({
        id: `e-${taskId}-${subNodeId}`,
        source: taskId, target: subNodeId,
        animated: es.animated,
        style: {
          stroke: es.stroke,
          strokeWidth: focused ? 2.5 : 1.5,
          strokeDasharray: es.dashed ? "4 4" : undefined,
          opacity: task.status === "done" ? 0.4 : 1,
        },
        markerEnd: { type: MarkerType.ArrowClosed, color: es.stroke },
      });

      // Side artifacts off the task: snapshot / output / approval / blocked
      const sideX = tx + 220;
      let sideY = ty - 30;

      if (task.snapshotId) {
        const sid = `snap-${task.id}`;
        nodes.push({
          id: sid, type: "memory",
          position: { x: sideX, y: sideY },
          data: { kind: "snapshot", ref: task.snapshotId, note: "linked snapshot" } as unknown as Record<string, unknown>,
        });
        edges.push({
          id: `e-${taskId}-${sid}`, source: taskId, target: sid,
          style: { stroke: C.memory, strokeWidth: 1.2, strokeDasharray: "4 4" },
          markerEnd: { type: MarkerType.ArrowClosed, color: C.memory },
        });
        sideY += 70;
      }

      if (task.outputs.length > 0) {
        const oid = `out-${task.id}`;
        nodes.push({
          id: oid, type: "output",
          position: { x: sideX, y: sideY },
          data: { kind: "artifact", label: `${task.outputs.length} output${task.outputs.length === 1 ? "" : "s"}`, meta: task.outputs[0] } as unknown as Record<string, unknown>,
        });
        edges.push({
          id: `e-${taskId}-${oid}`, source: taskId, target: oid,
          animated: task.status === "running",
          style: { stroke: C.output, strokeWidth: 1.2, strokeDasharray: "4 4" },
          markerEnd: { type: MarkerType.ArrowClosed, color: C.output },
        });
        sideY += 70;
      }

      if (task.status === "needs_review") {
        const aid = `appr-${task.id}`;
        nodes.push({
          id: aid, type: "approval",
          position: { x: sideX, y: sideY },
          data: { label: "Needs Review", reason: "operator action" } as unknown as Record<string, unknown>,
        });
        edges.push({
          id: `e-${taskId}-${aid}`, source: taskId, target: aid,
          animated: true,
          style: { stroke: C.approval, strokeWidth: 1.5 },
          markerEnd: { type: MarkerType.ArrowClosed, color: C.approval },
        });
      }

      if (task.status === "blocked") {
        const bid = `block-${task.id}`;
        nodes.push({
          id: bid, type: "approval",
          position: { x: sideX, y: sideY },
          data: { label: "Blocked", reason: task.logTail[0] ?? "blocker" } as unknown as Record<string, unknown>,
        });
        edges.push({
          id: `e-${taskId}-${bid}`, source: taskId, target: bid,
          style: { stroke: C.blocked, strokeWidth: 1.5, strokeDasharray: "4 4" },
          markerEnd: { type: MarkerType.ArrowClosed, color: C.blocked },
        });
      }
    });
  });

  return { nodes, edges };
}

// ====================================================================
// Focus graph — single agent, with all (or one) of their tasks
// ====================================================================

function buildFocusGraph(
  agent: Agent,
  chief: Agent,
  tasks: Task[],
  opts: { showCompleted: boolean; focusedTaskId: string | null; filterToFocused: boolean },
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const cx = 560, cy = 280;

  // Chief (compact, top-left)
  nodes.push({
    id: `agent-${chief.id}`, type: "agent",
    position: { x: 60, y: 40 },
    data: { ...chief, compact: true, dim: true } as unknown as Record<string, unknown>,
  });

  // Focused agent at center
  nodes.push({
    id: `agent-${agent.id}`, type: "agent",
    position: { x: cx, y: cy },
    data: { ...agent } as unknown as Record<string, unknown>,
  });

  // Tasks for this agent
  const agentTasks = tasks
    .filter((t) => t.agentId === agent.id)
    .filter((t) => opts.showCompleted ? true : t.status !== "done")
    .filter((t) => opts.filterToFocused && opts.focusedTaskId
      ? t.id === opts.focusedTaskId
      : isActiveTask(t) || (opts.showCompleted && t.status === "done")
    );

  // Lay tasks in a column between chief and focused agent
  const taskColX = 280;
  agentTasks.forEach((task, i) => {
    const taskId = `task-${task.id}`;
    const ty = 80 + i * 110;
    const focused = task.id === opts.focusedTaskId;
    nodes.push({
      id: taskId, type: "task",
      position: { x: taskColX, y: ty },
      data: taskNodeData(task, focused),
    });
    const es = taskEdgeStyle(task);
    edges.push({
      id: `e-chief-${taskId}`, source: `agent-${chief.id}`, target: taskId,
      animated: es.animated, style: {
        stroke: es.stroke, strokeWidth: focused ? 2.5 : 1.5,
        strokeDasharray: es.dashed ? "4 4" : undefined,
      },
      label: es.label,
      labelStyle: { fill: "var(--color-muted-foreground)", fontSize: 10, fontFamily: "JetBrains Mono" },
      labelBgStyle: { fill: "var(--carapace-panel)" },
      markerEnd: { type: MarkerType.ArrowClosed, color: es.stroke },
    });
    edges.push({
      id: `e-${taskId}-agent`, source: taskId, target: `agent-${agent.id}`,
      animated: es.animated, style: {
        stroke: es.stroke, strokeWidth: focused ? 2.5 : 1.5,
        strokeDasharray: es.dashed ? "4 4" : undefined,
      },
      markerEnd: { type: MarkerType.ArrowClosed, color: es.stroke },
    });

    // Side artifacts (snapshot / output / approval / blocked) off the focused task only,
    // to keep the focus view clean
    if (focused || agentTasks.length === 1) {
      let sideY = ty - 20;
      const sideX = cx + 280;
      if (task.snapshotId) {
        const sid = `snap-${task.id}`;
        nodes.push({
          id: sid, type: "memory",
          position: { x: sideX, y: sideY },
          data: { kind: "snapshot", ref: task.snapshotId, note: "snapshot" } as unknown as Record<string, unknown>,
        });
        edges.push({
          id: `e-agent-${sid}`, source: `agent-${agent.id}`, target: sid,
          style: { stroke: C.memory, strokeWidth: 1.2, strokeDasharray: "4 4" },
          markerEnd: { type: MarkerType.ArrowClosed, color: C.memory },
        });
        sideY += 80;
      }
      if (task.outputs.length > 0) {
        const oid = `out-${task.id}`;
        nodes.push({
          id: oid, type: "output",
          position: { x: sideX, y: sideY },
          data: { kind: "artifact", label: "Output", meta: task.outputs[0] } as unknown as Record<string, unknown>,
        });
        edges.push({
          id: `e-agent-${oid}`, source: `agent-${agent.id}`, target: oid,
          animated: task.status === "running",
          style: { stroke: C.output, strokeWidth: 1.2, strokeDasharray: "4 4" },
          markerEnd: { type: MarkerType.ArrowClosed, color: C.output },
        });
        sideY += 80;
      }
      if (task.status === "needs_review") {
        const aid = `appr-${task.id}`;
        nodes.push({
          id: aid, type: "approval",
          position: { x: sideX, y: sideY },
          data: { label: "Needs Review", reason: "operator action" } as unknown as Record<string, unknown>,
        });
        edges.push({
          id: `e-agent-${aid}`, source: `agent-${agent.id}`, target: aid,
          animated: true, style: { stroke: C.approval, strokeWidth: 1.5 },
          markerEnd: { type: MarkerType.ArrowClosed, color: C.approval },
        });
      }
      if (task.status === "blocked") {
        const bid = `block-${task.id}`;
        nodes.push({
          id: bid, type: "approval",
          position: { x: sideX, y: sideY },
          data: { label: "Blocked", reason: task.logTail[0] ?? "blocker" } as unknown as Record<string, unknown>,
        });
        edges.push({
          id: `e-agent-${bid}`, source: `agent-${agent.id}`, target: bid,
          style: { stroke: C.blocked, strokeWidth: 1.5, strokeDasharray: "4 4" },
          markerEnd: { type: MarkerType.ArrowClosed, color: C.blocked },
        });
      }
    }
  });

  // Inputs (left, below chief)
  INPUT_DEFS.slice(0, 4).forEach((inp, i) => {
    const id = `input-${inp.kind}`;
    nodes.push({
      id, type: "input",
      position: { x: 60, y: 280 + i * 70 },
      data: { ...inp } as unknown as Record<string, unknown>,
    });
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
      position: { x: cx + 480, y: cy + 200 + i * 80 },
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
      markerEnd: { type: MarkerType.ArrowClosed, color: active ? stroke : C.muted },
    });
    if (tool.risky) {
      const gateId = `approval-${tool.kind}`;
      nodes.push({
        id: gateId, type: "approval",
        position: { x: cx + 280, y: cy + 200 + i * 80 + 20 },
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

  // Memory cluster (bottom-right)
  const events = MEMORY_EVENTS.filter((e) => e.agentId === agent.id);
  events.forEach((ev, i) => {
    const id = `mem-${ev.id}`;
    const x = cx + 320 + (i % 2) * 200;
    const y = cy + 580 + Math.floor(i / 2) * 80;
    nodes.push({
      id, type: "memory",
      position: { x, y },
      data: { kind: ev.kind, ref: ev.ref, note: ev.note } as unknown as Record<string, unknown>,
    });
    edges.push({
      id: `e-${id}-agent`, source: id, target: `agent-${agent.id}`,
      animated: true,
      style: { stroke: C.memory, strokeWidth: 1.2, strokeDasharray: "4 4" },
      markerEnd: { type: MarkerType.ArrowClosed, color: C.memory },
    });
  });

  // Infra row (very bottom)
  INFRA_DEFS.forEach((infra, i) => {
    const id = `infra-${infra.kind}`;
    nodes.push({
      id, type: "infra",
      position: { x: 160 + i * 240, y: cy + 820 },
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
  return (
    <ReactFlowProvider>
      <FlowEngineInner />
    </ReactFlowProvider>
  );
}

function FlowEngineInner() {
  const tasks = useTaskStore((s) => s.tasks);
  const focusedTaskId = useTaskStore((s) => s.focusedTaskId);
  const setFocusedTask = useTaskStore((s) => s.setFocusedTask);
  const flowFilterMode = useTaskStore((s) => s.flowFilterMode);
  const setFlowFilterMode = useTaskStore((s) => s.setFlowFilterMode);
  const showCompleted = useTaskStore((s) => s.showCompleted);
  const setShowCompleted = useTaskStore((s) => s.setShowCompleted);

  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { task?: string };

  const [selectedId, setSelectedId] = useState<AgentId>("chief");
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [paused, setPaused] = useState(false);
  const [tick, setTick] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [layoutLocked, setLayoutLocked] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, Record<string, { x: number; y: number }>>>({});
  const { fitView } = useReactFlow();

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => {
    if (paused || !mounted) return;
    const t = setInterval(() => setTick((x) => x + 1), 2000);
    return () => clearInterval(t);
  }, [paused, mounted]);

  // Honor ?task=<id> deep-link from Kanban: focus the task + jump to its agent
  useEffect(() => {
    const id = search?.task;
    if (!id) return;
    const t = tasks.find((x) => x.id === id);
    if (!t) return;
    setFocusedTask(id);
    setSelectedId(t.agentId);
    setTimeout(() => fitView({ padding: 0.2, duration: 500 }), 80);
  }, [search?.task, tasks, setFocusedTask, fitView]);

  const chief = AGENTS.find((a) => a.id === "chief")!;
  const selected = AGENTS.find((a) => a.id === selectedId)!;
  const isOrchestration = selectedId === "chief";
  const viewKey = isOrchestration ? "orchestration" : `focus:${selectedId}`;

  const liveAgent: Agent = useMemo(() => ({
    ...selected,
    tokensUsed: Math.min(selected.tokensMax, selected.tokensUsed + (paused ? 0 : tick * 47)),
    contextPressure: Math.min(0.95, selected.contextPressure + (paused ? 0 : tick * 0.002)),
  }), [selected, tick, paused]);

  const filterToFocused = flowFilterMode === "selected" && !!focusedTaskId;

  const baseGraph = useMemo(
    () => isOrchestration
      ? buildOrchestrationGraph(liveAgent, tasks, { showCompleted, focusedTaskId, filterToFocused })
      : buildFocusGraph(liveAgent, chief, tasks, { showCompleted, focusedTaskId, filterToFocused }),
    [isOrchestration, liveAgent, chief, tasks, showCompleted, focusedTaskId, filterToFocused],
  );

  const decoratedNodes = useMemo<Node[]>(() => {
    const ov = overrides[viewKey] ?? {};
    return baseGraph.nodes.map((n) => ({
      ...n,
      draggable: !layoutLocked,
      position: ov[n.id] ?? n.position,
    }));
  }, [baseGraph.nodes, overrides, viewKey, layoutLocked]);

  const [nodes, setNodes, onNodesChange] = useNodesState(decoratedNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(baseGraph.edges);

  useEffect(() => { setNodes(decoratedNodes); }, [decoratedNodes, setNodes]);
  useEffect(() => { setEdges(baseGraph.edges); }, [baseGraph.edges, setEdges]);

  const handleResetLayout = () => {
    setOverrides((o) => { const n = { ...o }; delete n[viewKey]; return n; });
    setTimeout(() => fitView({ padding: 0.15, duration: 300 }), 50);
  };
  const handleFitView = () => fitView({ padding: 0.15, duration: 300 });

  const activeTaskCount = tasks.filter(isActiveTask).length;

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      <MetricsStrip agentId={selectedId} tick={tick} mounted={mounted} activeTasks={activeTaskCount} />

      {/* Breadcrumb / mode bar */}
      <div className="panel border-b border-border px-4 py-2 flex items-center gap-2 text-xs flex-wrap">
        {isOrchestration ? (
          <>
            <span className="text-mono uppercase text-[10px] text-muted-foreground">Mode</span>
            <span className="text-yellow text-mono">Orchestration</span>
            <span className="text-muted-foreground">— Chief delegating {activeTaskCount} active task{activeTaskCount === 1 ? "" : "s"}</span>
          </>
        ) : (
          <>
            <button onClick={() => setSelectedId("chief")} className="flex items-center gap-1 text-muted-foreground hover:text-yellow transition-colors">
              <ArrowLeft className="w-3 h-3" /> Return to Chief
            </button>
            <span className="text-muted-foreground mx-1">·</span>
            <span className="text-mono">Chief of Staff</span>
            <span className="text-muted-foreground">→</span>
            <span className="text-mono text-yellow">{selected.name}</span>
            <span className="ml-auto text-mono uppercase text-[10px] text-muted-foreground">Agent Focus</span>
          </>
        )}

        {/* Filter controls */}
        <div className="ml-auto flex items-center gap-2">
          <Filter className="w-3 h-3 text-muted-foreground" />
          <button
            onClick={() => setFlowFilterMode("all")}
            className={cn("px-2 py-0.5 rounded text-[11px] text-mono", flowFilterMode === "all" ? "bg-yellow/20 text-yellow" : "text-muted-foreground hover:text-foreground")}
          >Show all tasks</button>
          <button
            onClick={() => setFlowFilterMode("selected")}
            disabled={!focusedTaskId}
            className={cn("px-2 py-0.5 rounded text-[11px] text-mono",
              flowFilterMode === "selected" ? "bg-yellow/20 text-yellow" : "text-muted-foreground hover:text-foreground",
              !focusedTaskId && "opacity-40 cursor-not-allowed",
            )}
          >Selected only</button>
          <label className="flex items-center gap-1 text-[11px] text-muted-foreground text-mono cursor-pointer select-none">
            <input type="checkbox" checked={showCompleted} onChange={(e) => setShowCompleted(e.target.checked)} className="accent-[var(--carapace-yellow)]" />
            show completed
          </label>
          {focusedTaskId && (
            <button onClick={() => setFocusedTask(null)} className="text-[11px] text-coral hover:underline text-mono">
              clear focus
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 grid grid-cols-[200px_1fr] min-h-0">
        {/* Agent rail */}
        <aside className="panel border-r border-border p-3 overflow-y-auto">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground text-mono mb-2 px-1">Hierarchy</div>
          {AGENTS.map((a) => {
            const active = a.id === selectedId;
            const isChild = !!a.parentId;
            const taskCount = tasks.filter((t) => t.agentId === a.id && isActiveTask(t)).length;
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
                <span className={cn("w-1.5 h-1.5 rounded-full",
                  a.status === "executing" ? "bg-sky" :
                  a.status === "thinking" ? "bg-yellow" :
                  a.status === "error" ? "bg-coral" : "bg-muted-foreground",
                )}/>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium truncate">{a.name}</div>
                  <div className="text-[10px] text-muted-foreground truncate text-mono">{a.model}</div>
                </div>
                {taskCount > 0 && (
                  <span className="text-[9px] text-mono px-1.5 py-0.5 rounded bg-yellow/20 text-yellow">{taskCount}</span>
                )}
              </button>
            );
          })}
        </aside>

        {/* Graph */}
        <div className="relative min-w-0">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeDragStop={(_, node) => {
              setOverrides((o) => ({
                ...o,
                [viewKey]: { ...(o[viewKey] ?? {}), [node.id]: { x: node.position.x, y: node.position.y } },
              }));
            }}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.15 }}
            proOptions={{ hideAttribution: true }}
            nodesDraggable={!layoutLocked}
            nodesConnectable={false}
            elementsSelectable
            onNodeClick={(_, node) => {
              if (node.type === "agent") {
                const id = node.id.replace("agent-", "") as AgentId;
                if (AGENTS.some((a) => a.id === id)) setSelectedId(id);
                return;
              }
              if (node.type === "task") {
                // Open the task in Kanban
                const data = node.data as { id?: string };
                const taskId = data.id;
                if (taskId) {
                  setFocusedTask(taskId);
                  navigate({ to: "/kanban", search: { task: taskId } as never });
                }
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

          <div className="absolute top-3 right-3 flex items-center gap-2">
            <button onClick={handleFitView} className="px-2.5 py-1 rounded-md panel border border-border text-xs flex items-center gap-1.5 hover:border-yellow/60" title="Fit all nodes in view">
              <Maximize2 className="w-3 h-3" /> Fit View
            </button>
            <button onClick={handleResetLayout} className="px-2.5 py-1 rounded-md panel border border-border text-xs flex items-center gap-1.5 hover:border-yellow/60" title="Restore default layout">
              <RotateCcw className="w-3 h-3" /> Reset Layout
            </button>
            <button
              onClick={() => setLayoutLocked((l) => !l)}
              className={cn("px-2.5 py-1 rounded-md panel border text-xs flex items-center gap-1.5",
                layoutLocked ? "border-coral/60 text-coral" : "border-border hover:border-yellow/60")}
              title={layoutLocked ? "Unlock to drag nodes" : "Lock to prevent dragging"}
            >
              {layoutLocked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
              {layoutLocked ? "Locked" : "Unlocked"}
            </button>
            <button onClick={() => setPaused((p) => !p)} className="px-2.5 py-1 rounded-md panel border border-border text-xs flex items-center gap-1.5 hover:border-yellow/60">
              {paused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
              {paused ? "Resume" : "Pause"} simulation
            </button>
          </div>

          <div className="absolute bottom-3 left-3 text-[10px] text-mono text-muted-foreground bg-[var(--carapace-panel)]/80 border border-border rounded-md px-2 py-1 backdrop-blur-sm pointer-events-none">
            Drag nodes to rearrange · Click a task to open it in Kanban · Reset layout anytime
          </div>
        </div>
      </div>

      {/* Bottom log drawer */}
      <div className={cn("panel border-t border-border transition-[height]", drawerOpen ? "h-[160px]" : "h-[36px]")}>
        <button onClick={() => setDrawerOpen((o) => !o)} className="w-full h-9 px-4 flex items-center justify-between text-xs text-muted-foreground hover:text-foreground">
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
            ) : <div className="text-muted-foreground">connecting…</div>}
          </div>
        )}
      </div>
    </div>
  );
}

function MetricsStrip({ agentId, tick, mounted, activeTasks }: { agentId: AgentId; tick: number; mounted: boolean; activeTasks: number }) {
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
      <Metric label="active tasks" value={activeTasks.toString()} />
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
