import { useEffect, useMemo, useState } from "react";
import {
  ReactFlow, Background, Controls, MiniMap, type Node, type Edge,
  MarkerType, BackgroundVariant, useNodesState, useEdgesState, useReactFlow,
  ReactFlowProvider,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { nodeTypes } from "./nodes";
import {
  AGENTS, type Agent, type AgentId, type Task, type ToolKind,
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

const INPUT_DEFS: { kind: "human" | "telegram" | "terminal" | "api" | "cron"; label: string; rate?: string }[] = [
  { kind: "human", label: "Human", rate: "2 msg/min" },
  { kind: "telegram", label: "Telegram", rate: "1 msg/min" },
  { kind: "api", label: "API", rate: "0.4 req/s" },
  { kind: "cron", label: "Cron", rate: "next 14m" },
];

const INFRA_DEFS: { kind: "openclaw"; label: string; meta?: string }[] = [
  { kind: "openclaw", label: "OpenClaw runtime", meta: "127.0.0.1:18789" },
];

const toolStroke = (kind: ToolKind) =>
  kind === "exec" ? C.exec :
  kind === "memory" ? C.memory :
  (kind === "web" || kind === "search") ? C.tool :
  C.muted;

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
// Task-driven graph builder
// ====================================================================
//
// The graph is assembled FROM tasks. Each active task contributes a
// self-contained execution path:
//
//   Chief → Task → Subagent → (tools used) / (memory refs) / (outputs) / (approvals)
//
// Agent nodes are pure routing. Tools/memory/outputs only appear when an
// active task actually uses them. A subagent with no active tasks is
// rendered dim and unconnected — it represents available capacity, not
// active execution.

type BuildOpts = {
  showCompleted: boolean;
  focusedTaskId: string | null;
  filterToFocused: boolean;
  mode: "orchestration" | "focus";
  focusAgentId: AgentId; // only meaningful in focus mode
};

function selectVisibleTasks(tasks: Task[], opts: BuildOpts): Task[] {
  let list = tasks.filter((t) => isActiveTask(t) || (opts.showCompleted && (t.status === "done" || t.status === "failed")));
  if (opts.filterToFocused && opts.focusedTaskId) {
    list = list.filter((t) => t.id === opts.focusedTaskId);
  }
  if (opts.mode === "focus") {
    list = list.filter((t) => t.agentId === opts.focusAgentId);
  }
  return list;
}

function buildTaskDrivenGraph(
  chief: Agent,
  tasks: Task[],
  opts: BuildOpts,
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const seen = new Set<string>();
  const pushNode = (n: Node) => { if (!seen.has(n.id)) { seen.add(n.id); nodes.push(n); } };

  const visible = selectVisibleTasks(tasks, opts);

  // --- 1. Chief always present at the top center (orchestrator routing node)
  const chiefX = opts.mode === "orchestration" ? 720 : 80;
  const chiefY = opts.mode === "orchestration" ? 80 : 40;
  pushNode({
    id: `agent-${chief.id}`, type: "agent",
    position: { x: chiefX, y: chiefY },
    data: opts.mode === "orchestration"
      ? ({ ...chief } as unknown as Record<string, unknown>)
      : ({ ...chief, compact: true, dim: true } as unknown as Record<string, unknown>),
  });

  // --- 2. Inputs feed Chief (orchestration) or focused agent (focus)
  // These are part of the runtime, not a task — but we only show 2 by default
  // to avoid implying capability where none is in use.
  if (opts.mode === "orchestration") {
    INPUT_DEFS.slice(0, 2).forEach((inp, i) => {
      const id = `input-${inp.kind}`;
      pushNode({
        id, type: "input",
        position: { x: 60, y: 40 + i * 80 },
        data: { ...inp } as unknown as Record<string, unknown>,
      });
      edges.push({
        id: `e-${id}-chief`, source: id, target: `agent-${chief.id}`,
        animated: true,
        style: { stroke: C.tool, strokeWidth: 1.2 },
        markerEnd: { type: MarkerType.ArrowClosed, color: C.tool },
      });
    });
  }

  // --- 3. Group visible tasks by their owning subagent
  const subs = AGENTS.filter((a) => a.parentId === chief.id);
  const subOrder: AgentId[] = subs.map((s) => s.id);
  const tasksByAgent = new Map<AgentId, Task[]>();
  subOrder.forEach((id) => tasksByAgent.set(id, []));
  visible
    .filter((t) => t.agentId !== chief.id)
    .forEach((t) => {
      const list = tasksByAgent.get(t.agentId);
      if (list) list.push(t);
    });

  // Lay subagents in columns; only render a subagent if it has visible work
  // OR (in orchestration view) we always show the org so operators understand routing.
  const colBaseX = 220;
  const colStepX = 360;
  const subY = opts.mode === "orchestration" ? 720 : 0; // unused in focus mode
  const taskRowY = opts.mode === "orchestration" ? 280 : 100;
  const taskRowStepY = 180;

  if (opts.mode === "orchestration") {
    subs.forEach((sub, i) => {
      const subTasks = tasksByAgent.get(sub.id) ?? [];
      const sx = colBaseX + i * colStepX;
      const stagger = (i % 2) * 60;
      const hasWork = subTasks.some(isActiveTask);
      pushNode({
        id: `agent-${sub.id}`, type: "agent",
        position: { x: sx, y: subY + stagger },
        data: { ...sub, compact: true, dim: !hasWork } as unknown as Record<string, unknown>,
      });

      if (subTasks.length === 0) {
        // No active task → no execution path. Show a faint routing line so
        // hierarchy is still visible, but no tools/memory/outputs.
        edges.push({
          id: `e-chief-agent-${sub.id}`,
          source: `agent-${chief.id}`, target: `agent-${sub.id}`,
          style: { stroke: C.muted, strokeWidth: 1, strokeDasharray: "3 5" },
          markerEnd: { type: MarkerType.ArrowClosed, color: C.muted },
        });
      }

      // For each task, render its execution path
      subTasks.forEach((task, ti) => {
        renderTaskPath({
          task,
          chiefId: chief.id,
          subAgentId: sub.id,
          taskPos: { x: sx - 10, y: taskRowY + ti * taskRowStepY + stagger / 2 },
          sidePos: { x: sx + 220, yStart: taskRowY + ti * taskRowStepY + stagger / 2 - 30 },
          memoryPos: { x: sx + 220, yStart: taskRowY + ti * taskRowStepY + stagger / 2 + 90 },
          focusedTaskId: opts.focusedTaskId,
          pushNode, edges,
        });
      });
    });
  } else {
    // ----- Focus mode -----
    // Center the focused agent. Only render that agent + its visible tasks.
    const agent = AGENTS.find((a) => a.id === opts.focusAgentId)!;
    const cx = 600, cy = 260;
    pushNode({
      id: `agent-${agent.id}`, type: "agent",
      position: { x: cx, y: cy },
      data: { ...agent } as unknown as Record<string, unknown>,
    });

    // Inputs (slim, to the left of the focused agent — only 2)
    INPUT_DEFS.slice(0, 2).forEach((inp, i) => {
      const id = `input-${inp.kind}`;
      pushNode({
        id, type: "input",
        position: { x: 60, y: 220 + i * 80 },
        data: { ...inp } as unknown as Record<string, unknown>,
      });
      edges.push({
        id: `e-${id}-agent`, source: id, target: `agent-${agent.id}`,
        animated: agent.status !== "idle",
        style: { stroke: agent.status !== "idle" ? C.tool : C.muted, strokeWidth: 1.2 },
        markerEnd: { type: MarkerType.ArrowClosed, color: agent.status !== "idle" ? C.tool : C.muted },
      });
    });

    // Tasks stack between chief and focused agent
    const taskColX = 320;
    visible.forEach((task, i) => {
      const ty = 80 + i * 130;
      renderTaskPath({
        task,
        chiefId: chief.id,
        subAgentId: agent.id,
        taskPos: { x: taskColX, y: ty },
        sidePos: { x: cx + 280, yStart: ty - 20 },
        memoryPos: { x: cx + 280, yStart: ty + 110 },
        focusedTaskId: opts.focusedTaskId,
        pushNode, edges,
      });
    });

    // OpenClaw runtime sits at the bottom — agent connects to it because all
    // execution flows through OpenClaw.
    INFRA_DEFS.forEach((infra, i) => {
      const id = `infra-${infra.kind}`;
      pushNode({
        id, type: "infra",
        position: { x: cx - 80 + i * 240, y: cy + Math.max(400, visible.length * 130 + 200) },
        data: { ...infra } as unknown as Record<string, unknown>,
      });
      edges.push({
        id: `e-agent-${id}`, source: `agent-${agent.id}`, target: id,
        style: { stroke: C.muted, strokeWidth: 1, strokeDasharray: "2 4" },
        markerEnd: { type: MarkerType.ArrowClosed, color: C.muted },
      });
    });
  }

  // --- Orchestration mode: bottom OpenClaw runtime, single shared node
  if (opts.mode === "orchestration") {
    const id = `infra-openclaw`;
    pushNode({
      id, type: "infra",
      position: { x: 720, y: subY + 200 },
      data: { kind: "openclaw", label: "OpenClaw runtime", meta: "127.0.0.1:18789" } as unknown as Record<string, unknown>,
    });
    // Only connect from subagents that have visible work
    subs.forEach((sub) => {
      if ((tasksByAgent.get(sub.id)?.length ?? 0) === 0) return;
      edges.push({
        id: `e-${sub.id}-infra`, source: `agent-${sub.id}`, target: id,
        style: { stroke: C.muted, strokeWidth: 1, strokeDasharray: "2 4" },
        markerEnd: { type: MarkerType.ArrowClosed, color: C.muted },
      });
    });
  }

  return { nodes, edges };
}

// Render the per-task execution path:
//   Chief → Task → Subagent  +  (tools / memory / outputs / approvals branching off task)
function renderTaskPath(args: {
  task: Task;
  chiefId: AgentId;
  subAgentId: AgentId;
  taskPos: { x: number; y: number };
  sidePos: { x: number; yStart: number };
  memoryPos: { x: number; yStart: number };
  focusedTaskId: string | null;
  pushNode: (n: Node) => void;
  edges: Edge[];
}) {
  const { task, chiefId, subAgentId, taskPos, sidePos, memoryPos, focusedTaskId, pushNode, edges } = args;
  const taskId = `task-${task.id}`;
  const focused = task.id === focusedTaskId;
  const dim = task.status === "done" || task.status === "failed";

  pushNode({
    id: taskId, type: "task",
    position: taskPos,
    data: taskNodeData(task, focused),
  });

  const es = taskEdgeStyle(task);
  const baseEdgeStyle = {
    stroke: es.stroke,
    strokeWidth: focused ? 2.5 : 1.5,
    strokeDasharray: es.dashed ? "4 4" : undefined,
    opacity: dim ? 0.45 : 1,
  };

  // Chief → Task
  edges.push({
    id: `e-chief-${taskId}`,
    source: `agent-${chiefId}`, target: taskId,
    animated: es.animated && !dim,
    style: baseEdgeStyle,
    label: es.label,
    labelStyle: { fill: "var(--color-muted-foreground)", fontSize: 10, fontFamily: "JetBrains Mono" },
    labelBgStyle: { fill: "var(--carapace-panel)" },
    markerEnd: { type: MarkerType.ArrowClosed, color: es.stroke },
  });
  // Task → Subagent
  edges.push({
    id: `e-${taskId}-sub-${subAgentId}`,
    source: taskId, target: `agent-${subAgentId}`,
    animated: es.animated && !dim,
    style: baseEdgeStyle,
    markerEnd: { type: MarkerType.ArrowClosed, color: es.stroke },
  });

  // ---- Tools used by THIS task (subagent → tool) ----
  // Tool nodes are namespaced per task so two tasks using the same tool
  // don't share state, which would imply false coupling.
  let sideY = sidePos.yStart;
  (task.toolsUsed ?? []).forEach((tool) => {
    const toolId = `tool-${task.id}-${tool.kind}`;
    pushNode({
      id: toolId, type: "tool",
      position: { x: sidePos.x, y: sideY },
      data: { kind: tool.kind, label: tool.kind, calls: tool.calls } as unknown as Record<string, unknown>,
    });
    const stroke = toolStroke(tool.kind);
    const active = task.status === "running" && (tool.calls ?? 0) > 0;

    if (tool.risky) {
      // Approval gate between subagent and risky tool
      const gateId = `apprtool-${task.id}-${tool.kind}`;
      pushNode({
        id: gateId, type: "approval",
        position: { x: sidePos.x - 200, y: sideY + 20 },
        data: { label: `Approve ${tool.kind}`, reason: "exec / risky action" } as unknown as Record<string, unknown>,
      });
      edges.push({
        id: `e-sub-${gateId}`, source: `agent-${subAgentId}`, target: gateId,
        animated: true, style: { stroke: C.approval, strokeWidth: 1.5 },
        markerEnd: { type: MarkerType.ArrowClosed, color: C.approval },
      });
      edges.push({
        id: `e-${gateId}-${toolId}`, source: gateId, target: toolId,
        style: { stroke: C.approval, strokeWidth: 1.5, strokeDasharray: "4 4" },
        markerEnd: { type: MarkerType.ArrowClosed, color: C.approval },
      });
    } else {
      edges.push({
        id: `e-sub-${toolId}`, source: `agent-${subAgentId}`, target: toolId,
        animated: active,
        style: {
          stroke: active ? stroke : C.muted,
          strokeWidth: active ? 1.5 : 1,
          strokeDasharray: active && tool.kind !== "exec" ? "4 4" : undefined,
        },
        markerEnd: { type: MarkerType.ArrowClosed, color: active ? stroke : C.muted },
      });
    }
    sideY += 80;
  });

  // ---- Outputs produced by this task (task → output) ----
  if (task.outputs.length > 0) {
    const oid = `out-${task.id}`;
    pushNode({
      id: oid, type: "output",
      position: { x: sidePos.x, y: sideY },
      data: {
        kind: "artifact",
        label: `${task.outputs.length} output${task.outputs.length === 1 ? "" : "s"}`,
        meta: task.outputs[0],
      } as unknown as Record<string, unknown>,
    });
    edges.push({
      id: `e-${taskId}-${oid}`, source: taskId, target: oid,
      animated: task.status === "running",
      style: { stroke: C.output, strokeWidth: 1.2, strokeDasharray: "4 4" },
      markerEnd: { type: MarkerType.ArrowClosed, color: C.output },
    });
    sideY += 70;
  }

  // ---- Approval / blocked (task-level operator gates) ----
  if (task.status === "needs_review") {
    const aid = `appr-${task.id}`;
    pushNode({
      id: aid, type: "approval",
      position: { x: sidePos.x, y: sideY },
      data: { label: "Needs Review", reason: "operator action" } as unknown as Record<string, unknown>,
    });
    edges.push({
      id: `e-${taskId}-${aid}`, source: taskId, target: aid,
      animated: true, style: { stroke: C.approval, strokeWidth: 1.5 },
      markerEnd: { type: MarkerType.ArrowClosed, color: C.approval },
    });
    sideY += 70;
  }
  if (task.status === "blocked") {
    const bid = `block-${task.id}`;
    pushNode({
      id: bid, type: "approval",
      position: { x: sidePos.x, y: sideY },
      data: { label: "Blocked", reason: task.logTail[0] ?? "blocker" } as unknown as Record<string, unknown>,
    });
    edges.push({
      id: `e-${taskId}-${bid}`, source: taskId, target: bid,
      style: { stroke: C.blocked, strokeWidth: 1.5, strokeDasharray: "4 4" },
      markerEnd: { type: MarkerType.ArrowClosed, color: C.blocked },
    });
    sideY += 70;
  }

  // ---- Memory refs used by this task (task → memory) ----
  let memY = memoryPos.yStart;
  (task.memoryRefs ?? []).forEach((ref, i) => {
    const mid = `mem-${task.id}-${i}`;
    const isSnapshotRef = ref.startsWith("snap_");
    pushNode({
      id: mid, type: "memory",
      position: { x: memoryPos.x + 200, y: memY },
      data: {
        kind: isSnapshotRef ? "snapshot" : "read",
        ref,
        note: isSnapshotRef ? "linked snapshot" : "context retrieval",
      } as unknown as Record<string, unknown>,
    });
    edges.push({
      id: `e-${mid}-${taskId}`, source: mid, target: taskId,
      animated: task.status === "running",
      style: { stroke: C.memory, strokeWidth: 1.2, strokeDasharray: "4 4" },
      markerEnd: { type: MarkerType.ArrowClosed, color: C.memory },
    });
    memY += 70;
  });

  // ---- Snapshot (task-level) ----
  if (task.snapshotId) {
    const sid = `snap-${task.id}`;
    pushNode({
      id: sid, type: "memory",
      position: { x: memoryPos.x + 200, y: memY },
      data: { kind: "snapshot", ref: task.snapshotId, note: "linked snapshot" } as unknown as Record<string, unknown>,
    });
    edges.push({
      id: `e-${taskId}-${sid}`, source: taskId, target: sid,
      style: { stroke: C.memory, strokeWidth: 1.2, strokeDasharray: "4 4" },
      markerEnd: { type: MarkerType.ArrowClosed, color: C.memory },
    });
  }
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
    () => buildTaskDrivenGraph(chief, tasks, {
      mode: isOrchestration ? "orchestration" : "focus",
      focusAgentId: isOrchestration ? chief.id : liveAgent.id,
      showCompleted,
      focusedTaskId,
      filterToFocused,
    }),
    [chief, tasks, isOrchestration, liveAgent.id, showCompleted, focusedTaskId, filterToFocused],
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

      <div className="panel border-b border-border px-4 py-2 flex items-center gap-2 text-xs flex-wrap">
        {isOrchestration ? (
          <>
            <span className="text-mono uppercase text-[10px] text-muted-foreground">Mode</span>
            <span className="text-yellow text-mono">Orchestration</span>
            <span className="text-muted-foreground">— {activeTaskCount} active task{activeTaskCount === 1 ? "" : "s"} drive the graph</span>
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
            Tasks drive the graph · Tools and memory only appear when actively used · Click a task to open it in Kanban
          </div>
        </div>
      </div>

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
