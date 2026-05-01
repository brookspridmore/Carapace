import { useEffect, useMemo, useState } from "react";
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent, useDroppable,
} from "@dnd-kit/core";
import { useDraggable } from "@dnd-kit/core";
import {
  TASK_STATUSES, AGENTS, type Task, type TaskStatus, type Priority,
} from "@/lib/mock-data";
import { Paperclip, Camera, MessagesSquare, GitBranch, X, Plus, Filter, GitMerge, Play, FilePlus2, Eye, Flame } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { useTaskStore } from "@/lib/task-store";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useAgentLabelMap } from "@/lib/agent-registry";
import { useSnapshotStore, useSnapshotsForTask } from "@/lib/snapshot-store";
import { useMemoryStore } from "@/lib/memory-store";
import { OnboardingHint } from "@/components/shell/OnboardingHint";

const PRIORITY_COLOR: Record<Priority, string> = {
  high: "bg-coral",
  medium: "bg-yellow",
  low: "bg-sky",
};

export function Kanban() {
  const tasks = useTaskStore((s) => s.tasks);
  const labelMap = useAgentLabelMap();
  const updateTask = useTaskStore((s) => s.updateTask);
  const moveTask = useTaskStore((s) => s.moveTask);
  const addTask = useTaskStore((s) => s.addTask);
  const setFocusedTask = useTaskStore((s) => s.setFocusedTask);
  const focusedTaskId = useTaskStore((s) => s.focusedTaskId);
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { task?: string };
  const [active, setActive] = useState<Task | null>(null);
  const [selected, setSelected] = useState<Task | null>(null);
  const [filterAgent, setFilterAgent] = useState<string>("all");
  const [filterPriority, setFilterPriority] = useState<string>("all");
  const [createOpen, setCreateOpen] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // Honor ?task=<id> deep-link from Flow
  useEffect(() => {
    const id = search?.task ?? focusedTaskId;
    if (id) {
      const t = tasks.find((x) => x.id === id);
      if (t) setSelected(t);
    }
  }, [search?.task, focusedTaskId, tasks]);

  const filtered = useMemo(() => tasks.filter((t) =>
    (filterAgent === "all" || t.agentId === filterAgent) &&
    (filterPriority === "all" || t.priority === filterPriority),
  ), [tasks, filterAgent, filterPriority]);

  const grouped = useMemo(() => {
    const map: Record<TaskStatus, Task[]> = {
      inbox: [], planned: [], assigned: [], running: [],
      needs_review: [], blocked: [], done: [], failed: [],
    };
    filtered.forEach((t) => map[t.status].push(t));
    return map;
  }, [filtered]);

  function onDragStart(e: DragStartEvent) {
    const t = tasks.find((x) => x.id === e.active.id);
    if (t) setActive(t);
  }
  function onDragEnd(e: DragEndEvent) {
    setActive(null);
    if (!e.over) return;
    const newStatus = e.over.id as TaskStatus;
    moveTask(e.active.id as string, newStatus);
  }

  function openInFlow(task: Task) {
    setFocusedTask(task.id);
    navigate({ to: "/", search: { task: task.id } as never });
  }

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      {/* Filter bar */}
      <div className="px-4 py-2.5 border-b border-border flex items-center gap-3 panel">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Filter className="w-3.5 h-3.5" />
          <span className="text-mono uppercase tracking-wider text-[10px]">Filters</span>
        </div>
        <select
          value={filterAgent}
          onChange={(e) => setFilterAgent(e.target.value)}
          className="surface border border-border rounded-md px-2 py-1 text-xs"
        >
          <option value="all">All agents</option>
          {AGENTS.map((a) => <option key={a.id} value={a.id}>{labelMap[a.id] ?? a.name}</option>)}
        </select>
        <select
          value={filterPriority}
          onChange={(e) => setFilterPriority(e.target.value)}
          className="surface border border-border rounded-md px-2 py-1 text-xs"
        >
          <option value="all">All priorities</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted-foreground text-mono">{filtered.length} tasks</span>
          <button
            onClick={() => setCreateOpen(true)}
            className="text-xs px-2.5 py-1 rounded-md bg-yellow text-primary-foreground hover:opacity-90 flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" /> Task
          </button>
          <OnboardingHint
            id="kanban.create"
            title="Create structured work, not chat"
            docsHref="/docs"
            side="bottom"
            align="end"
          >
            <p>Click <strong>+ Task</strong> to define work for an agent. Title is required; assigning a subagent is strongly recommended.</p>
            <p>Tasks flow into Flow as nodes the moment they're active, and you can attach a snapshot to make them resumable.</p>
          </OnboardingHint>
        </div>
      </div>

      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <div className="flex-1 overflow-x-auto">
          <div className="flex gap-3 p-4 h-full min-w-max">
            {TASK_STATUSES.map((col) => (
              <Column key={col.id} status={col.id} label={col.label} tasks={grouped[col.id]} onSelect={setSelected} focusedTaskId={focusedTaskId} />
            ))}
          </div>
        </div>
        <DragOverlay>
          {active && <Card task={active} dragging />}
        </DragOverlay>
      </DndContext>

      {selected && (
        <TaskDrawer
          task={selected}
          onClose={() => setSelected(null)}
          onUpdate={(t) => { updateTask(t); setSelected(t); }}
          onOpenInFlow={openInFlow}
        />
      )}

      {createOpen && (
        <CreateTaskModal
          onClose={() => setCreateOpen(false)}
          onCreate={(t) => { addTask(t); setCreateOpen(false); setSelected(t); }}
        />
      )}
    </div>
  );
}

function Column({ status, label, tasks, onSelect, focusedTaskId }: {
  status: TaskStatus; label: string; tasks: Task[]; onSelect: (t: Task) => void; focusedTaskId: string | null;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "w-[280px] flex flex-col rounded-lg panel border border-border shrink-0 transition-colors",
        isOver && "border-yellow/60",
      )}
    >
      <div className="px-3 py-2.5 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold tracking-tight">{label}</span>
          <span className="text-[10px] text-mono text-muted-foreground">{tasks.length}</span>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {tasks.length === 0 && (
          <div className="text-center text-[11px] text-muted-foreground py-6 border border-dashed border-border rounded-md">
            Empty
          </div>
        )}
        {tasks.map((t) => (
          <DraggableCard key={t.id} task={t} onSelect={onSelect} highlighted={t.id === focusedTaskId} />
        ))}
      </div>
    </div>
  );
}

function DraggableCard({ task, onSelect, highlighted }: { task: Task; onSelect: (t: Task) => void; highlighted?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => onSelect(task)}
      className={cn("cursor-grab active:cursor-grabbing", isDragging && "opacity-30")}
    >
      <Card task={task} highlighted={highlighted} />
    </div>
  );
}

function Card({ task, dragging = false, highlighted = false }: { task: Task; dragging?: boolean; highlighted?: boolean }) {
  const agent = AGENTS.find((a) => a.id === task.agentId);
  const labelMap = useAgentLabelMap();
  const agentName = labelMap[task.agentId] ?? agent?.name ?? task.agentId;
  const subDone = task.subtasks.filter((s) => s.done).length;
  const snaps = useSnapshotsForTask(task.id);
  const primary = snaps[0];
  const importance = primary?.importance ?? 0;
  const status = primary?.status ?? "active";
  return (
    <div
      className={cn(
        "surface rounded-md border border-border p-2.5 hover:border-yellow/40 transition-colors",
        dragging && "shadow-2xl border-yellow/60 rotate-1",
        highlighted && "border-yellow ring-1 ring-yellow/40",
      )}
    >
      <div className="flex items-start gap-2">
        <span className={cn("w-1.5 h-1.5 rounded-full mt-1.5 shrink-0", PRIORITY_COLOR[task.priority])} />
        <div className="text-[13px] font-medium leading-tight">{task.title}</div>
      </div>
      <div className="mt-2 flex items-center justify-between text-[10px] text-mono text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-4 rounded-full bg-yellow/20 text-yellow flex items-center justify-center text-[9px] font-semibold uppercase">
            {agentName.slice(0, 1)}
          </div>
          <span>{agentName}</span>
        </div>
        {task.dueDate && (
          <span>{format(new Date(task.dueDate), "MMM d")}</span>
        )}
      </div>
      {(task.subtasks.length > 0 || task.outputs.length > 0 || primary || task.conversationId) && (
        <div className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground">
          {task.subtasks.length > 0 && (
            <span className="flex items-center gap-1"><GitBranch className="w-3 h-3" />{subDone}/{task.subtasks.length}</span>
          )}
          {task.outputs.length > 0 && (
            <span className="flex items-center gap-1"><Paperclip className="w-3 h-3" />{task.outputs.length}</span>
          )}
          {primary && (
            <span className={cn("flex items-center gap-1",
              status === "active" ? "text-sky" :
              status === "stale" ? "text-yellow" :
              "text-muted-foreground")}
              title={`Snapshot ${primary.id} · ${status}`}>
              <Camera className="w-3 h-3" />
              <span className="capitalize">{status}</span>
            </span>
          )}
          {primary && importance >= 0.8 && (
            <span className="flex items-center gap-1 text-coral" title={`Importance ${Math.round(importance * 100)}%`}>
              <Flame className="w-3 h-3" /> {Math.round(importance * 100)}%
            </span>
          )}
          {task.conversationId && <MessagesSquare className="w-3 h-3" />}
        </div>
      )}
    </div>
  );
}

function TaskDrawer({ task, onClose, onUpdate, onOpenInFlow }: {
  task: Task; onClose: () => void; onUpdate: (t: Task) => void; onOpenInFlow: (t: Task) => void;
}) {
  const agent = AGENTS.find((a) => a.id === task.agentId);
  const navigate = useNavigate();
  const snaps = useSnapshotsForTask(task.id);
  const primary = snaps[0];
  const upsert = useSnapshotStore((s) => s.upsert);
  const setFocusedSnapshot = useTaskStore((s) => s.setFocusedSnapshot);
  const recordResume = useMemoryStore((s) => s.recordResume);

  function createSnapshot() {
    const id = `snap_${task.id}_${Date.now().toString(36)}`;
    upsert({
      id,
      title: `Snapshot — ${task.title}`,
      agentId: task.agentId,
      taskId: task.id,
      conversationId: task.conversationId,
      status: "active",
      importance: 0.5,
      confidenceScore: 0.5,
      objective: task.description,
      currentState: task.logTail.slice(-3).join(" / ") || "No recent activity recorded.",
      decisions: [],
      openQuestions: [],
      nextActions: task.subtasks.filter((s) => !s.done).map((s) => s.title),
      blockers: [],
      files: task.outputs,
      memoryRefs: task.memoryRefs ?? [],
      conversationRefs: task.conversationId ? [task.conversationId] : [],
      artifacts: [],
      retrievalKeywords: task.title.toLowerCase().split(/\s+/).filter((w) => w.length > 3),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    onUpdate({ ...task, snapshotId: id });
    navigate({ to: "/snapshots" });
  }

  function resumeSnapshot() {
    if (!primary) return;
    setFocusedSnapshot(primary.id);
    recordResume(primary.id, primary.agentId, primary.taskId);
    navigate({ to: "/", search: { snapshot: primary.id } as never });
  }

  return (
    <div className="fixed inset-0 z-40 pointer-events-none">
      <div className="absolute inset-0 bg-black/40 pointer-events-auto" onClick={onClose} />
      <aside className="absolute top-0 right-0 h-full w-full sm:w-[480px] panel border-l border-border pointer-events-auto overflow-y-auto">
        <div className="px-5 py-4 border-b border-border flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground text-mono mb-1">
              {task.id} · {task.status}
            </div>
            <h3 className="text-base font-semibold leading-tight">{task.title}</h3>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => onOpenInFlow(task)}
              className="px-2 py-1 rounded-md surface border border-border text-[11px] flex items-center gap-1.5 hover:border-yellow/60"
              title="Focus this task in Flow"
            >
              <GitMerge className="w-3 h-3" /> Open in Flow
            </button>
            <button onClick={onClose} className="p-1 rounded-md hover:bg-surface text-muted-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-5 space-y-5">
          <Section title="Description">
            <p className="text-sm text-foreground/90 leading-relaxed">{task.description}</p>
          </Section>

          <Section title={primary ? `Snapshot · ${primary.status ?? "active"}` : "Snapshot"}>
            {primary ? (
              <div className="space-y-2">
                <div className="surface border border-sky/40 rounded-md p-2.5">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="text-mono text-[10px] text-muted-foreground">{primary.id}</div>
                    <div className="text-[10px] text-mono text-yellow">
                      importance {Math.round((primary.importance ?? 0) * 100)}%
                    </div>
                  </div>
                  {primary.title && <div className="text-xs font-medium mb-1">{primary.title}</div>}
                  <div className="text-xs text-foreground/80 line-clamp-2">{primary.objective}</div>
                  {(primary.nextActions ?? []).length > 0 && (
                    <div className="mt-2">
                      <div className="text-[10px] uppercase text-mono text-yellow mb-1">Next actions</div>
                      <ul className="space-y-0.5 text-[12px]">
                        {primary.nextActions.slice(0, 3).map((a, i) => (
                          <li key={i} className="flex gap-1.5"><span className="text-yellow">→</span>{a}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {primary.blockers.length > 0 && (
                    <div className="mt-2">
                      <div className="text-[10px] uppercase text-mono text-coral mb-1">Blockers</div>
                      <ul className="space-y-0.5 text-[12px]">
                        {primary.blockers.map((b, i) => <li key={i} className="flex gap-1.5"><span className="text-coral">!</span>{b}</li>)}
                      </ul>
                    </div>
                  )}
                  {primary.decisions.length > 0 && (
                    <div className="mt-2">
                      <div className="text-[10px] uppercase text-mono text-muted-foreground mb-1">Decisions</div>
                      <ul className="space-y-0.5 text-[12px]">
                        {primary.decisions.slice(0, 3).map((d, i) => <li key={i} className="flex gap-1.5"><span className="text-muted-foreground">·</span>{d}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
                <div className="flex gap-1.5">
                  <button onClick={resumeSnapshot} className="flex-1 px-2 py-1.5 rounded-md bg-yellow text-primary-foreground text-[11px] font-medium flex items-center justify-center gap-1.5 hover:opacity-90">
                    <Play className="w-3 h-3" /> Resume in Flow
                  </button>
                  <button onClick={() => navigate({ to: "/snapshots" })} className="flex-1 px-2 py-1.5 rounded-md surface border border-border text-[11px] flex items-center justify-center gap-1.5 hover:border-yellow/60">
                    <Eye className="w-3 h-3" /> Open snapshot
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="text-xs text-muted-foreground">No snapshot yet. Capture current operational state so this task can be resumed cleanly later.</div>
                <button onClick={createSnapshot} className="px-2 py-1.5 rounded-md bg-yellow text-primary-foreground text-[11px] font-medium flex items-center gap-1.5 hover:opacity-90">
                  <FilePlus2 className="w-3 h-3" /> Create snapshot
                </button>
              </div>
            )}
          </Section>

          <Section title="Agent">
            <select
              value={task.agentId}
              onChange={(e) => onUpdate({ ...task, agentId: e.target.value as Task["agentId"] })}
              className="surface border border-border rounded-md px-2 py-1.5 text-sm w-full"
            >
              {AGENTS.map((a) => <option key={a.id} value={a.id}>{a.name} — {a.role}</option>)}
            </select>
            {agent && (
              <div className="mt-1.5 text-[10px] text-mono text-muted-foreground">
                Currently assigned to <span className="text-yellow">{agent.name}</span> — reassignment is reflected live in Flow.
              </div>
            )}
          </Section>

          <Section title={`Subtasks (${task.subtasks.filter((s) => s.done).length}/${task.subtasks.length})`}>
            {task.subtasks.length === 0 ? (
              <div className="text-xs text-muted-foreground">No subtasks. Use Split task to break this down.</div>
            ) : (
              <ul className="space-y-1.5">
                {task.subtasks.map((s) => (
                  <li key={s.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox" checked={s.done}
                      onChange={(e) => onUpdate({
                        ...task,
                        subtasks: task.subtasks.map((x) => x.id === s.id ? { ...x, done: e.target.checked } : x),
                      })}
                      className="accent-[var(--carapace-yellow)]"
                    />
                    <span className={cn(s.done && "line-through text-muted-foreground")}>{s.title}</span>
                  </li>
                ))}
              </ul>
            )}
            <button className="mt-2 text-xs text-yellow hover:underline">Split task</button>
          </Section>

          <Section title="Linked">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <Link label="Session" value={task.sessionId} />
              <Link label="Conversation" value={task.conversationId} />
              <Link label="Snapshot" value={task.snapshotId} />
              <Link label="Outputs" value={task.outputs.length ? `${task.outputs.length} files` : undefined} />
            </div>
          </Section>

          {task.logTail.length > 0 && (
            <Section title="Log tail">
              <div className="surface rounded-md border border-border p-2 text-mono text-[11px] space-y-0.5 max-h-32 overflow-y-auto">
                {task.logTail.map((l, i) => (
                  <div key={i} className="text-foreground/80">{l}</div>
                ))}
              </div>
            </Section>
          )}

          {task.status === "needs_review" && (
            <div className="flex gap-2 pt-2 border-t border-border">
              <button
                onClick={() => onUpdate({ ...task, status: "done" })}
                className="flex-1 px-3 py-2 rounded-md bg-yellow text-primary-foreground text-sm font-medium hover:opacity-90"
              >Approve</button>
              <button
                onClick={() => onUpdate({ ...task, status: "assigned" })}
                className="flex-1 px-3 py-2 rounded-md surface border border-border text-sm hover:border-coral/60"
              >Request changes</button>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground text-mono mb-2">{title}</div>
      {children}
    </div>
  );
}

function Link({ label, value }: { label: string; value?: string }) {
  return (
    <div className="surface rounded-md border border-border px-2 py-1.5">
      <div className="text-[9px] uppercase text-mono text-muted-foreground tracking-wider">{label}</div>
      <div className={cn("truncate", value ? "text-foreground" : "text-muted-foreground")}>
        {value ?? "—"}
      </div>
    </div>
  );
}

function CreateTaskModal({ onClose, onCreate }: {
  onClose: () => void;
  onCreate: (t: Task) => void;
}) {
  const labelMap = useAgentLabelMap();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [agentId, setAgentId] = useState<string>("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [status, setStatus] = useState<TaskStatus>("inbox");
  const [dueDate, setDueDate] = useState<string>("");
  const [subtaskInput, setSubtaskInput] = useState("");
  const [subtasks, setSubtasks] = useState<{ id: string; title: string; done: boolean }[]>([]);
  const [error, setError] = useState<string | null>(null);

  function addSubtask() {
    const t = subtaskInput.trim();
    if (!t) return;
    setSubtasks((cur) => [...cur, { id: `st_${Date.now().toString(36)}_${cur.length}`, title: t, done: false }]);
    setSubtaskInput("");
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    const finalAgent = (agentId || AGENTS[0]?.id || "chief") as Task["agentId"];
    const task: Task = {
      id: `t_${Date.now().toString(36)}`,
      title: title.trim(),
      description: description.trim(),
      agentId: finalAgent,
      priority,
      status,
      dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
      subtasks,
      outputs: [],
      logTail: [],
      createdAt: new Date().toISOString(),
      toolsUsed: [],
      memoryRefs: [],
    };
    onCreate(task);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <form
        onSubmit={submit}
        className="relative panel border border-border rounded-lg w-full max-w-md mx-4 shadow-2xl"
      >
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <h3 className="text-sm font-semibold tracking-tight">Create task</h3>
          <button type="button" onClick={onClose} className="p-1 rounded-md hover:bg-surface text-muted-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-3 max-h-[70vh] overflow-y-auto">
          <Field label="Title *">
            <input
              autoFocus
              value={title}
              onChange={(e) => { setTitle(e.target.value); if (error) setError(null); }}
              placeholder="Short, action-oriented title"
              className="surface border border-border rounded-md px-2 py-1.5 text-sm w-full"
            />
            {error && <div className="text-[11px] text-coral mt-1">{error}</div>}
          </Field>

          <Field label="Description">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="What needs to happen, context, constraints…"
              className="surface border border-border rounded-md px-2 py-1.5 text-sm w-full resize-none"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Assigned agent">
              <select
                value={agentId}
                onChange={(e) => setAgentId(e.target.value)}
                className="surface border border-border rounded-md px-2 py-1.5 text-sm w-full"
              >
                <option value="">— Unassigned —</option>
                {AGENTS.map((a) => (
                  <option key={a.id} value={a.id}>{labelMap[a.id] ?? a.name}</option>
                ))}
              </select>
            </Field>

            <Field label="Priority">
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as Priority)}
                className="surface border border-border rounded-md px-2 py-1.5 text-sm w-full"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </Field>

            <Field label="Status">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as TaskStatus)}
                className="surface border border-border rounded-md px-2 py-1.5 text-sm w-full"
              >
                {TASK_STATUSES.map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </select>
            </Field>

            <Field label="Due date">
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="surface border border-border rounded-md px-2 py-1.5 text-sm w-full"
              />
            </Field>
          </div>

          <Field label={`Subtasks (${subtasks.length})`}>
            <div className="flex gap-1.5">
              <input
                value={subtaskInput}
                onChange={(e) => setSubtaskInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSubtask(); } }}
                placeholder="Add a subtask and press Enter"
                className="surface border border-border rounded-md px-2 py-1.5 text-sm flex-1"
              />
              <button type="button" onClick={addSubtask} className="px-2 py-1 rounded-md surface border border-border text-xs hover:border-yellow/60">Add</button>
            </div>
            {subtasks.length > 0 && (
              <ul className="mt-2 space-y-1">
                {subtasks.map((s) => (
                  <li key={s.id} className="flex items-center justify-between text-xs surface border border-border rounded-md px-2 py-1">
                    <span>{s.title}</span>
                    <button
                      type="button"
                      onClick={() => setSubtasks((cur) => cur.filter((x) => x.id !== s.id))}
                      className="text-muted-foreground hover:text-coral"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Field>
        </div>

        <div className="px-5 py-3 border-t border-border flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-md surface border border-border text-xs hover:border-border">
            Cancel
          </button>
          <button type="submit" className="px-3 py-1.5 rounded-md bg-yellow text-primary-foreground text-xs font-medium hover:opacity-90">
            Create task
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground text-mono mb-1">{label}</div>
      {children}
    </div>
  );
}
