import { useMemo, useState } from "react";
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent, useDroppable,
} from "@dnd-kit/core";
import { useDraggable } from "@dnd-kit/core";
import {
  TASKS, TASK_STATUSES, AGENTS, type Task, type TaskStatus, type Priority,
} from "@/lib/mock-data";
import { Paperclip, Camera, MessagesSquare, GitBranch, X, Plus, Filter } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

const PRIORITY_COLOR: Record<Priority, string> = {
  high: "bg-coral",
  medium: "bg-yellow",
  low: "bg-sky",
};

export function Kanban() {
  const [tasks, setTasks] = useState<Task[]>(() => TASKS.map((t) => ({ ...t })));
  const [active, setActive] = useState<Task | null>(null);
  const [selected, setSelected] = useState<Task | null>(null);
  const [filterAgent, setFilterAgent] = useState<string>("all");
  const [filterPriority, setFilterPriority] = useState<string>("all");

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

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
    setTasks((prev) => prev.map((t) => t.id === e.active.id ? { ...t, status: newStatus } : t));
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
          {AGENTS.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
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
          <button className="text-xs px-2.5 py-1 rounded-md bg-yellow text-primary-foreground hover:opacity-90 flex items-center gap-1.5">
            <Plus className="w-3.5 h-3.5" /> Task
          </button>
        </div>
      </div>

      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <div className="flex-1 overflow-x-auto">
          <div className="flex gap-3 p-4 h-full min-w-max">
            {TASK_STATUSES.map((col) => (
              <Column key={col.id} status={col.id} label={col.label} tasks={grouped[col.id]} onSelect={setSelected} />
            ))}
          </div>
        </div>
        <DragOverlay>
          {active && <Card task={active} dragging />}
        </DragOverlay>
      </DndContext>

      {selected && <TaskDrawer task={selected} onClose={() => setSelected(null)} onUpdate={(t) => {
        setTasks((prev) => prev.map((x) => x.id === t.id ? t : x));
        setSelected(t);
      }} />}
    </div>
  );
}

function Column({ status, label, tasks, onSelect }: {
  status: TaskStatus; label: string; tasks: Task[]; onSelect: (t: Task) => void;
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
          <DraggableCard key={t.id} task={t} onSelect={onSelect} />
        ))}
      </div>
    </div>
  );
}

function DraggableCard({ task, onSelect }: { task: Task; onSelect: (t: Task) => void }) {
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
      <Card task={task} />
    </div>
  );
}

function Card({ task, dragging = false }: { task: Task; dragging?: boolean }) {
  const agent = AGENTS.find((a) => a.id === task.agentId);
  const subDone = task.subtasks.filter((s) => s.done).length;
  return (
    <div
      className={cn(
        "surface rounded-md border border-border p-2.5 hover:border-yellow/40 transition-colors",
        dragging && "shadow-2xl border-yellow/60 rotate-1",
      )}
    >
      <div className="flex items-start gap-2">
        <span className={cn("w-1.5 h-1.5 rounded-full mt-1.5 shrink-0", PRIORITY_COLOR[task.priority])} />
        <div className="text-[13px] font-medium leading-tight">{task.title}</div>
      </div>
      <div className="mt-2 flex items-center justify-between text-[10px] text-mono text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-4 rounded-full bg-yellow/20 text-yellow flex items-center justify-center text-[9px] font-semibold uppercase">
            {agent?.name.slice(0, 1)}
          </div>
          <span>{agent?.name}</span>
        </div>
        {task.dueDate && (
          <span>{format(new Date(task.dueDate), "MMM d")}</span>
        )}
      </div>
      {(task.subtasks.length > 0 || task.outputs.length > 0 || task.snapshotId || task.conversationId) && (
        <div className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground">
          {task.subtasks.length > 0 && (
            <span className="flex items-center gap-1"><GitBranch className="w-3 h-3" />{subDone}/{task.subtasks.length}</span>
          )}
          {task.outputs.length > 0 && (
            <span className="flex items-center gap-1"><Paperclip className="w-3 h-3" />{task.outputs.length}</span>
          )}
          {task.snapshotId && <Camera className="w-3 h-3" />}
          {task.conversationId && <MessagesSquare className="w-3 h-3" />}
        </div>
      )}
    </div>
  );
}

function TaskDrawer({ task, onClose, onUpdate }: {
  task: Task; onClose: () => void; onUpdate: (t: Task) => void;
}) {
  const agent = AGENTS.find((a) => a.id === task.agentId);
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
          <button onClick={onClose} className="p-1 rounded-md hover:bg-surface text-muted-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          <Section title="Description">
            <p className="text-sm text-foreground/90 leading-relaxed">{task.description}</p>
          </Section>

          <Section title="Agent">
            <select
              value={task.agentId}
              onChange={(e) => onUpdate({ ...task, agentId: e.target.value as Task["agentId"] })}
              className="surface border border-border rounded-md px-2 py-1.5 text-sm w-full"
            >
              {AGENTS.map((a) => <option key={a.id} value={a.id}>{a.name} — {a.role}</option>)}
            </select>
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
