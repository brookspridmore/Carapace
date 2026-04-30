import {
  AGENTS,
  TASKS,
  SNAPSHOTS,
  CONVERSATIONS,
  APPROVALS,
  PROVIDERS,
  LOGS,
  type Task,
  type TaskStatus,
} from "@/lib/mock-data";
import type { OpenClawAdapter } from "./types";

const tasks: Task[] = TASKS.map((t) => ({ ...t }));
const approvals = APPROVALS.map((a) => ({ ...a }));

export const mockAdapter: OpenClawAdapter = {
  async health() {
    return { ok: true, baseUrl: "mock://carapace", latencyMs: 4 };
  },
  async listAgents() {
    return AGENTS;
  },
  async getAgent(id) {
    return AGENTS.find((a) => a.id === id) ?? null;
  },
  async listTasks() {
    return tasks;
  },
  async updateTaskStatus(id, status: TaskStatus) {
    const t = tasks.find((x) => x.id === id);
    if (!t) return null;
    t.status = status;
    return t;
  },
  async listSnapshots() {
    return SNAPSHOTS;
  },
  async listConversations() {
    return CONVERSATIONS;
  },
  async listApprovals() {
    return approvals;
  },
  async resolveApproval(id, decision) {
    const a = approvals.find((x) => x.id === id);
    if (!a) return null;
    a.status = decision === "approve" ? "approved" : "denied";
    return a;
  },
  async listProviders() {
    return PROVIDERS;
  },
  async recentLogs(limit = 60) {
    return LOGS.slice(0, limit);
  },
};
