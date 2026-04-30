import { create } from "zustand";
import { TASKS, type Task, type TaskStatus, type AgentId } from "./mock-data";

export type FlowFilterMode = "all" | "selected";

export type DensityMode = "low" | "medium" | "high";

interface TaskStore {
  tasks: Task[];
  focusedTaskId: string | null;
  focusedSnapshotId: string | null;
  flowFilterMode: FlowFilterMode;
  showCompleted: boolean;
  densityMode: DensityMode;
  // Actions
  setTasks: (tasks: Task[]) => void;
  updateTask: (task: Task) => void;
  patchTask: (id: string, patch: Partial<Task>) => void;
  moveTask: (id: string, status: TaskStatus) => void;
  removeTask: (id: string) => void;
  addTask: (task: Task) => void;
  setFocusedTask: (id: string | null) => void;
  setFocusedSnapshot: (id: string | null) => void;
  setFlowFilterMode: (m: FlowFilterMode) => void;
  setShowCompleted: (v: boolean) => void;
  setDensityMode: (m: DensityMode) => void;
}

export const useTaskStore = create<TaskStore>((set) => ({
  tasks: TASKS.map((t) => ({ ...t })),
  focusedTaskId: null,
  focusedSnapshotId: null,
  flowFilterMode: "all",
  showCompleted: false,
  densityMode: "medium",
  setTasks: (tasks) => set({ tasks }),
  updateTask: (task) => set((s) => ({ tasks: s.tasks.map((t) => t.id === task.id ? task : t) })),
  patchTask: (id, patch) => set((s) => ({ tasks: s.tasks.map((t) => t.id === id ? { ...t, ...patch } : t) })),
  moveTask: (id, status) => set((s) => ({ tasks: s.tasks.map((t) => t.id === id ? { ...t, status } : t) })),
  removeTask: (id) => set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) })),
  addTask: (task) => set((s) => ({ tasks: [...s.tasks, task] })),
  setFocusedTask: (id) => set({ focusedTaskId: id }),
  setFocusedSnapshot: (id) => set({ focusedSnapshotId: id }),
  setFlowFilterMode: (m) => set({ flowFilterMode: m }),
  setShowCompleted: (v) => set({ showCompleted: v }),
  setDensityMode: (m) => set({ densityMode: m }),
}));

// ---- Derived selectors ----

// Task statuses that are "active" — they show up in the Flow graph
export const ACTIVE_TASK_STATUSES: TaskStatus[] = [
  "assigned", "running", "needs_review", "blocked",
];

export function isActiveTask(t: Task): boolean {
  return ACTIVE_TASK_STATUSES.includes(t.status);
}

export function tasksForAgent(tasks: Task[], agentId: AgentId): Task[] {
  return tasks.filter((t) => t.agentId === agentId && isActiveTask(t));
}
