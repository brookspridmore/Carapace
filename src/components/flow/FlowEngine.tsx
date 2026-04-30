import { useEffect, useMemo, useState } from "react";
import {
  ReactFlow, Background, Controls, MiniMap, type Node, type Edge,
  MarkerType, BackgroundVariant, useNodesState, useEdgesState, useReactFlow,
  ReactFlowProvider,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { nodeTypes } from "./nodes";
import {
  AGENTS, SNAPSHOTS, getSnapshotById, type Agent, type AgentId, type Task, type ToolKind, type Snapshot,
} from "@/lib/mock-data";
import { useTaskStore, isActiveTask } from "@/lib/task-store";
import {
  ChevronUp, ChevronDown, Pause, Play, ArrowLeft,
  RotateCcw, Maximize2, Lock, Unlock, Filter, Layers, Sparkles,
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
// Deterministic LANE-BASED layout.
//
// Each visible task gets its own horizontal LANE. Within a lane, nodes flow
// strictly left → right at fixed columns:
//
//   COL_CHIEF → COL_TASK → COL_SUB → COL_FANOUT (tools / memory / outputs / approvals)
//
// Lane Y is computed deterministically from a stable index so layout never
// jumps between renders. Side nodes inside the fan-out column are stacked
// within the lane height so two lanes never collide.

// ---------- layout constants ----------
const COL = {
  inputs:   60,
  chief:    320,
  task:     560,
  sub:      820,
  fanoutA: 1080,  // tools / approvals (top half of fan-out)
  fanoutB: 1340,  // memory / snapshot / next-actions (right of A)
  output:  1080,  // outputs share fan-out A column but stack below tools
};
const LANE_HEIGHT = {
  low:    140,
  medium: 180,
  high:   240,
} as const;
const CHIEF_Y_OFFSET = 40;       // chief sits visually centered relative to lanes
const FAN_ROW_GAP   = 64;        // vertical gap between stacked side nodes inside a lane

type BuildOpts = {
  showCompleted: boolean;
  focusedTaskId: string | null;
  filterToFocused: boolean;
  mode: "orchestration" | "focus";
  focusAgentId: AgentId; // only meaningful in focus mode
  density: "low" | "medium" | "high";
  focusedSnapshot: Snapshot | null;
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

  // ---- Stable lane ordering ----
  // Sort tasks deterministically so layout never jumps. Sort by:
  //   1) subagent column order (chief's children, then chief's own tasks)
  //   2) status priority (running > needs_review > assigned > blocked > done/failed)
  //   3) task id
  const subs = AGENTS.filter((a) => a.parentId === chief.id);
  const subOrder: AgentId[] = [chief.id, ...subs.map((s) => s.id)];
  const subRank = (id: AgentId) => {
    const idx = subOrder.indexOf(id);
    return idx === -1 ? 999 : idx;
  };
  const statusRank: Record<string, number> = {
    running: 0, needs_review: 1, assigned: 2, blocked: 3, done: 4, failed: 5,
  };
  const sortedTasks = [...visible].sort((a, b) => {
    const sa = subRank(a.agentId) - subRank(b.agentId);
    if (sa !== 0) return sa;
    const st = (statusRank[a.status] ?? 9) - (statusRank[b.status] ?? 9);
    if (st !== 0) return st;
    return a.id.localeCompare(b.id);
  });

  const laneH = LANE_HEIGHT[opts.density];
  const laneCount = Math.max(1, sortedTasks.length);
  const totalH = laneCount * laneH;

  // ---- Chief anchor (vertically centered against the stack of lanes) ----
  const chiefX = opts.mode === "orchestration" ? COL.chief : COL.chief;
  const chiefY = CHIEF_Y_OFFSET + Math.max(0, (totalH - 80) / 2);
  pushNode({
    id: `agent-${chief.id}`, type: "agent",
    position: { x: chiefX, y: chiefY },
    data: opts.mode === "orchestration"
      ? ({ ...chief } as unknown as Record<string, unknown>)
      : ({ ...chief, compact: true, dim: true } as unknown as Record<string, unknown>),
  });

  // ---- Inputs feed Chief (orchestration) or focused agent (focus) ----
  INPUT_DEFS.slice(0, 2).forEach((inp, i) => {
    const id = `input-${inp.kind}`;
    pushNode({
      id, type: "input",
      position: { x: COL.inputs, y: chiefY - 60 + i * 90 },
      data: { ...inp } as unknown as Record<string, unknown>,
    });
    const target = opts.mode === "orchestration"
      ? `agent-${chief.id}`
      : `agent-${opts.focusAgentId}`;
    edges.push({
      id: `e-${id}-${target}`, source: id, target,
      animated: true,
      style: { stroke: C.tool, strokeWidth: 1.2 },
      markerEnd: { type: MarkerType.ArrowClosed, color: C.tool },
    });
  });

  // ---- Subagent nodes: one per subagent, vertically positioned at the
  //      MEAN of all its lanes (so the node "anchors" its task group). ----
  const subToLanes = new Map<AgentId, number[]>();
  sortedTasks.forEach((t, i) => {
    const arr = subToLanes.get(t.agentId) ?? [];
    arr.push(i);
    subToLanes.set(t.agentId, arr);
  });

  const renderedAgentIds = new Set<AgentId>();

  if (opts.mode === "orchestration") {
    subs.forEach((sub) => {
      const lanes = subToLanes.get(sub.id) ?? [];
      const hasWork = lanes.length > 0;
      const yMean = hasWork
        ? (lanes.reduce((a, b) => a + b, 0) / lanes.length) * laneH + laneH / 2
        : chiefY + 200; // park empty subagents below the chief
      pushNode({
        id: `agent-${sub.id}`, type: "agent",
        position: { x: COL.sub, y: yMean - 30 },
        data: { ...sub, compact: true, dim: !hasWork } as unknown as Record<string, unknown>,
      });
      renderedAgentIds.add(sub.id);

      if (!hasWork) {
        // Faint routing line so hierarchy is still visible.
        edges.push({
          id: `e-chief-agent-${sub.id}`,
          source: `agent-${chief.id}`, target: `agent-${sub.id}`,
          style: { stroke: C.muted, strokeWidth: 1, strokeDasharray: "3 5" },
          markerEnd: { type: MarkerType.ArrowClosed, color: C.muted },
        });
      }
    });
  } else {
    // Focus mode: render the focused agent in the subagent column.
    const agent = AGENTS.find((a) => a.id === opts.focusAgentId)!;
    pushNode({
      id: `agent-${agent.id}`, type: "agent",
      position: { x: COL.sub, y: chiefY - 30 },
      data: { ...agent } as unknown as Record<string, unknown>,
    });
    renderedAgentIds.add(agent.id);
  }

  // ---- One lane per task ----
  sortedTasks.forEach((task, laneIdx) => {
    const laneY = laneIdx * laneH + laneH / 2 - 28; // task node visual height ~56
    renderTaskPath({
      task,
      chiefId: chief.id,
      subAgentId: opts.mode === "orchestration" ? task.agentId : opts.focusAgentId,
      taskPos: { x: COL.task, y: laneY },
      fanoutAX: COL.fanoutA,
      fanoutBX: COL.fanoutB,
      laneTopY: laneIdx * laneH + 20,
      laneBottomY: (laneIdx + 1) * laneH - 20,
      focusedTaskId: opts.focusedTaskId,
      density: opts.density,
      focusedSnapshot: opts.focusedSnapshot,
      pushNode, edges,
    });
  });

  // ---- OpenClaw runtime: single shared node, far right of all lanes ----
  const infraId = `infra-openclaw`;
  pushNode({
    id: infraId, type: "infra",
    position: { x: COL.fanoutB + 320, y: chiefY },
    data: { kind: "openclaw", label: "OpenClaw runtime", meta: "127.0.0.1:18789" } as unknown as Record<string, unknown>,
  });
  // Connect any rendered subagent that has work to OpenClaw
  renderedAgentIds.forEach((aid) => {
    if (aid === chief.id) return;
    if ((subToLanes.get(aid)?.length ?? 0) === 0) return;
    edges.push({
      id: `e-${aid}-infra`, source: `agent-${aid}`, target: infraId,
      style: { stroke: C.muted, strokeWidth: 1, strokeDasharray: "2 4" },
      markerEnd: { type: MarkerType.ArrowClosed, color: C.muted },
    });
  });

  return { nodes, edges };
}

// Render one task LANE.
// Chief → Task → Subagent on a single horizontal line.
// Tools/approvals stack downward in fan-out column A (within lane bounds).
// Memory/snapshot/next-actions stack in fan-out column B.
function renderTaskPath(args: {
  task: Task;
  chiefId: AgentId;
  subAgentId: AgentId;
  taskPos: { x: number; y: number };
  fanoutAX: number;
  fanoutBX: number;
  laneTopY: number;
  laneBottomY: number;
  focusedTaskId: string | null;
  density: "low" | "medium" | "high";
  focusedSnapshot: Snapshot | null;
  pushNode: (n: Node) => void;
  edges: Edge[];
}) {
  const {
    task, chiefId, subAgentId, taskPos, fanoutAX, fanoutBX,
    laneTopY, laneBottomY, focusedTaskId, density, focusedSnapshot, pushNode, edges,
  } = args;
  const taskId = `task-${task.id}`;
  const snapTaskFocus = focusedSnapshot?.taskId === task.id;
  const focused = task.id === focusedTaskId || snapTaskFocus;
  const dim = task.status === "done" || task.status === "failed";

  // Snapshot-related task gets a slight emphasis even if not the primary focus
  const snapshotRelated = !!focusedSnapshot && (
    focusedSnapshot.taskId === task.id ||
    (task.snapshotId && task.snapshotId === focusedSnapshot.id)
  );

  pushNode({
    id: taskId, type: "task",
    position: taskPos,
    data: { ...taskNodeData(task, focused), snapshotRelated } as unknown as Record<string, unknown>,
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

  // Fan-out columns: stack within the lane to prevent collision with neighbors.
  // Column A (tools / approvals / outputs) and column B (memory / snapshots).
  let aY = laneTopY;
  let bY = laneTopY;
  const toolsToRender =
    density === "low" ? [] :
    density === "medium" ? (task.toolsUsed ?? []).filter((t) => t.risky) :
    (task.toolsUsed ?? []);
  toolsToRender.forEach((tool) => {
    const toolId = `tool-${task.id}-${tool.kind}`;
    pushNode({
      id: toolId, type: "tool",
      position: { x: fanoutAX, y: aY },
      data: { kind: tool.kind, label: tool.kind, calls: tool.calls } as unknown as Record<string, unknown>,
    });
    const stroke = toolStroke(tool.kind);
    const active = task.status === "running" && (tool.calls ?? 0) > 0;

    if (tool.risky) {
      // Approval gate sits to the LEFT of the risky tool, still inside the lane.
      const gateId = `apprtool-${task.id}-${tool.kind}`;
      pushNode({
        id: gateId, type: "approval",
        position: { x: fanoutAX - 220, y: aY + 10 },
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
    aY += FAN_ROW_GAP;
  });

  // ---- Outputs produced by this task (task → output) ----
  if (task.outputs.length > 0 && density !== "low") {
    const oid = `out-${task.id}`;
    // Place output below tools but clamp inside lane bounds.
    const oy = Math.min(aY, laneBottomY - 40);
    pushNode({
      id: oid, type: "output",
      position: { x: fanoutAX, y: oy },
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
    aY = oy + FAN_ROW_GAP;
  }

  // ---- Approval / blocked (task-level operator gates) ----
  if (task.status === "needs_review") {
    const aid = `appr-${task.id}`;
    pushNode({
      id: aid, type: "approval",
      position: { x: fanoutAX, y: Math.min(aY, laneBottomY - 40) },
      data: { label: "Needs Review", reason: "operator action" } as unknown as Record<string, unknown>,
    });
    edges.push({
      id: `e-${taskId}-${aid}`, source: taskId, target: aid,
      animated: true, style: { stroke: C.approval, strokeWidth: 1.5 },
      markerEnd: { type: MarkerType.ArrowClosed, color: C.approval },
    });
    aY += FAN_ROW_GAP;
  }
  if (task.status === "blocked") {
    const bid = `block-${task.id}`;
    pushNode({
      id: bid, type: "approval",
      position: { x: fanoutAX, y: Math.min(aY, laneBottomY - 40) },
      data: { label: "Blocked", reason: task.logTail[0] ?? "blocker" } as unknown as Record<string, unknown>,
    });
    edges.push({
      id: `e-${taskId}-${bid}`, source: taskId, target: bid,
      style: { stroke: C.blocked, strokeWidth: 1.5, strokeDasharray: "4 4" },
      markerEnd: { type: MarkerType.ArrowClosed, color: C.blocked },
    });
    aY += FAN_ROW_GAP;
  }

  // ---- Memory refs used by this task (task → memory) ----
  const memRefsToRender = density === "high" ? (task.memoryRefs ?? []) : [];
  memRefsToRender.forEach((ref, i) => {
    const mid = `mem-${task.id}-${i}`;
    const isSnapshotRef = ref.startsWith("snap_");
    pushNode({
      id: mid, type: "memory",
      position: { x: fanoutBX, y: bY },
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
    bY += FAN_ROW_GAP;
  });

  // ---- Snapshot (task-level) — always shown if linked, regardless of density.
  if (task.snapshotId && density !== "low") {
    const snap = SNAPSHOTS.find((s) => s.id === task.snapshotId);
    const sid = `snap-${task.id}`;
    const snapFocused = !!focusedSnapshot && focusedSnapshot.id === task.snapshotId;
    pushNode({
      id: sid, type: "memory",
      position: { x: fanoutBX, y: Math.min(bY, laneBottomY - 50) },
      data: {
        kind: "snapshot", ref: task.snapshotId,
        note: snap?.objective ? snap.objective.slice(0, 40) + (snap.objective.length > 40 ? "…" : "") : "linked snapshot",
        status: snap?.status,
        importance: snap?.importance,
        updatedAt: snap?.updatedAt,
        focused: snapFocused,
      } as unknown as Record<string, unknown>,
    });
    const snapStroke = snapFocused ? "var(--carapace-yellow)" : C.memory;
    edges.push({
      id: `e-${taskId}-${sid}`, source: taskId, target: sid,
      animated: snapFocused,
      style: { stroke: snapStroke, strokeWidth: snapFocused ? 2 : 1.2, strokeDasharray: snapFocused ? undefined : "4 4" },
      markerEnd: { type: MarkerType.ArrowClosed, color: snapStroke },
    });
    bY += FAN_ROW_GAP + 20;

    // Render snapshot's next_actions as primary path when this snapshot is focused
    if (snapFocused && snap) {
      snap.nextActions.slice(0, 3).forEach((action, idx) => {
        const naId = `na-${snap.id}-${idx}`;
        pushNode({
          id: naId, type: "output",
          position: { x: fanoutBX + 280, y: laneTopY + 20 + idx * FAN_ROW_GAP },
          data: { kind: "next_action", label: action, meta: `from ${snap.id}`, emphasized: true } as unknown as Record<string, unknown>,
        });
        edges.push({
          id: `e-${sid}-${naId}`, source: sid, target: naId,
          animated: true,
          style: { stroke: "var(--carapace-yellow)", strokeWidth: 2 },
          label: idx === 0 ? "next" : undefined,
          labelStyle: { fill: "var(--carapace-yellow)", fontSize: 10, fontFamily: "JetBrains Mono" },
          labelBgStyle: { fill: "var(--carapace-panel)" },
          markerEnd: { type: MarkerType.ArrowClosed, color: "var(--carapace-yellow)" },
        });
      });
    }
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
  const focusedSnapshotId = useTaskStore((s) => s.focusedSnapshotId);
  const setFocusedSnapshot = useTaskStore((s) => s.setFocusedSnapshot);
  const densityMode = useTaskStore((s) => s.densityMode);
  const setDensityMode = useTaskStore((s) => s.setDensityMode);
  const flowFilterMode = useTaskStore((s) => s.flowFilterMode);
  const setFlowFilterMode = useTaskStore((s) => s.setFlowFilterMode);
  const showCompleted = useTaskStore((s) => s.showCompleted);
  const setShowCompleted = useTaskStore((s) => s.setShowCompleted);
  const autoLayout = useTaskStore((s) => s.autoLayout);
  const setAutoLayout = useTaskStore((s) => s.setAutoLayout);

  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { task?: string; snapshot?: string };

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

  // Snapshot deep-link / Resume from Snapshot
  useEffect(() => {
    const sid = search?.snapshot;
    if (!sid) return;
    const snap = getSnapshotById(sid);
    if (!snap) return;
    setFocusedSnapshot(sid);
    if (snap.taskId) {
      setFocusedTask(snap.taskId);
      const t = tasks.find((x) => x.id === snap.taskId);
      if (t) setSelectedId(t.agentId);
    } else {
      setSelectedId(snap.agentId);
    }
    // Snapshot resume implies high detail so next_actions read clearly
    setDensityMode("high");
    setTimeout(() => fitView({ padding: 0.2, duration: 500 }), 100);
  }, [search?.snapshot, tasks, setFocusedSnapshot, setFocusedTask, setDensityMode, fitView]);
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
  const focusedSnapshot = focusedSnapshotId ? getSnapshotById(focusedSnapshotId) ?? null : null;

  const baseGraph = useMemo(
    () => buildTaskDrivenGraph(chief, tasks, {
      mode: isOrchestration ? "orchestration" : "focus",
      focusAgentId: isOrchestration ? chief.id : liveAgent.id,
      showCompleted,
      focusedTaskId,
      filterToFocused,
      density: densityMode,
      focusedSnapshot,
    }),
    [chief, tasks, isOrchestration, liveAgent.id, showCompleted, focusedTaskId, filterToFocused, densityMode, focusedSnapshot],
  );

  const decoratedNodes = useMemo<Node[]>(() => {
    // Auto Layout ON → ignore manual overrides, always use deterministic layout.
    // Auto Layout OFF → respect user-dragged positions for this view.
    const ov = autoLayout ? {} : (overrides[viewKey] ?? {});
    return baseGraph.nodes.map((n) => ({
      ...n,
      draggable: !layoutLocked,
      position: ov[n.id] ?? n.position,
    }));
  }, [baseGraph.nodes, overrides, viewKey, layoutLocked, autoLayout]);

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

          <span className="mx-1 h-4 w-px bg-border" />
          <Layers className="w-3 h-3 text-muted-foreground" />
          {(["low", "medium", "high"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setDensityMode(m)}
              className={cn("px-2 py-0.5 rounded text-[11px] text-mono capitalize",
                densityMode === m ? "bg-yellow/20 text-yellow" : "text-muted-foreground hover:text-foreground")}
            >{m}</button>
          ))}

          {focusedSnapshot && (
            <>
              <span className="mx-1 h-4 w-px bg-border" />
              <span className="text-[11px] text-mono text-yellow flex items-center gap-1">
                snapshot · {focusedSnapshot.id}
              </span>
              <button onClick={() => setFocusedSnapshot(null)} className="text-[11px] text-coral hover:underline text-mono">
                clear snapshot
              </button>
            </>
          )}

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
              // Manual drag implies the operator wants to override layout.
              if (autoLayout) setAutoLayout(false);
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
