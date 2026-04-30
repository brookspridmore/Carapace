// Centralized mock data for Carapace v1.
// This is the single source of truth for the demo state. All adapters
// (mock + future OpenClaw) read/write through the typed shapes defined here.

export type AgentId = "chief" | "researcher" | "marketer" | "builder" | "ops";

export type AgentStatus = "idle" | "thinking" | "executing" | "waiting" | "error";

export interface Agent {
  id: AgentId;
  name: string;
  role: string;
  model: string;
  provider: string;
  status: AgentStatus;
  parentId?: AgentId;
  activeTask?: string;
  tokensUsed: number;
  tokensMax: number;
  contextPressure: number; // 0-1
  workspacePath: string;
  memorySizeKb: number;
}

export const AGENTS: Agent[] = [
  {
    id: "chief",
    name: "Chief of Staff",
    role: "Orchestrator — routes objectives to subagents",
    model: "claude-3.5-sonnet",
    provider: "Anthropic",
    status: "thinking",
    activeTask: "Q4 launch coordination",
    tokensUsed: 142_300,
    tokensMax: 200_000,
    contextPressure: 0.71,
    workspacePath: "/var/openclaw/agents/chief",
    memorySizeKb: 1842,
  },
  {
    id: "researcher",
    name: "Researcher",
    role: "Deep web + competitive intelligence",
    model: "gpt-4o",
    provider: "OpenAI",
    status: "executing",
    parentId: "chief",
    activeTask: "Analyze competitor pricing",
    tokensUsed: 38_120,
    tokensMax: 128_000,
    contextPressure: 0.30,
    workspacePath: "/var/openclaw/agents/researcher",
    memorySizeKb: 612,
  },
  {
    id: "marketer",
    name: "Marketer",
    role: "Content, copy, social orchestration",
    model: "claude-3.5-sonnet",
    provider: "Anthropic",
    status: "waiting",
    parentId: "chief",
    activeTask: "Awaiting brand approval",
    tokensUsed: 12_450,
    tokensMax: 200_000,
    contextPressure: 0.06,
    workspacePath: "/var/openclaw/agents/marketer",
    memorySizeKb: 408,
  },
  {
    id: "builder",
    name: "Builder",
    role: "Code, refactor, ship features",
    model: "claude-3.5-sonnet",
    provider: "Anthropic",
    status: "executing",
    parentId: "chief",
    activeTask: "Implement webhook signer",
    tokensUsed: 88_900,
    tokensMax: 200_000,
    contextPressure: 0.44,
    workspacePath: "/var/openclaw/agents/builder",
    memorySizeKb: 921,
  },
  {
    id: "ops",
    name: "Ops",
    role: "Infra, deploys, monitoring",
    model: "llama-3.3-70b",
    provider: "Groq",
    status: "idle",
    parentId: "chief",
    tokensUsed: 4_210,
    tokensMax: 32_000,
    contextPressure: 0.13,
    workspacePath: "/var/openclaw/agents/ops",
    memorySizeKb: 244,
  },
];

export type TaskStatus =
  | "inbox"
  | "planned"
  | "assigned"
  | "running"
  | "needs_review"
  | "blocked"
  | "done"
  | "failed";

export const TASK_STATUSES: { id: TaskStatus; label: string }[] = [
  { id: "inbox", label: "Inbox" },
  { id: "planned", label: "Planned" },
  { id: "assigned", label: "Assigned" },
  { id: "running", label: "Running" },
  { id: "needs_review", label: "Needs Review" },
  { id: "blocked", label: "Blocked" },
  { id: "done", label: "Done" },
  { id: "failed", label: "Failed" },
];

export type Priority = "high" | "medium" | "low";

export interface Task {
  id: string;
  title: string;
  description: string;
  agentId: AgentId;
  priority: Priority;
  status: TaskStatus;
  dueDate?: string; // ISO
  subtasks: { id: string; title: string; done: boolean }[];
  sessionId?: string;
  conversationId?: string;
  snapshotId?: string;
  outputs: string[];
  logTail: string[];
  createdAt: string;
}

function iso(daysFromNow: number) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString();
}

export const TASKS: Task[] = [
  {
    id: "t-001",
    title: "Coordinate Q4 product launch",
    description: "Plan rollout, marketing collateral, ops checks, and post-launch monitoring across all subagents.",
    agentId: "chief",
    priority: "high",
    status: "running",
    dueDate: iso(7),
    subtasks: [
      { id: "s1", title: "Draft launch brief", done: true },
      { id: "s2", title: "Assign marketing copy", done: true },
      { id: "s3", title: "Stage deploy plan", done: false },
      { id: "s4", title: "Post-launch monitoring window", done: false },
    ],
    sessionId: "sess_8f2a",
    conversationId: "conv_chief_launch",
    snapshotId: "snap_q4_launch",
    outputs: ["launch-brief.md", "rollout-plan.md"],
    logTail: [
      "[12:04:02] chief: delegated copy task to marketer",
      "[12:04:18] chief: requested infra readiness from ops",
    ],
    createdAt: iso(-3),
  },
  {
    id: "t-002",
    title: "Competitor pricing teardown",
    description: "Pull pricing pages for top 5 competitors and produce a comparative table with positioning notes.",
    agentId: "researcher",
    priority: "medium",
    status: "running",
    dueDate: iso(2),
    subtasks: [
      { id: "s1", title: "Identify competitors", done: true },
      { id: "s2", title: "Scrape pricing pages", done: true },
      { id: "s3", title: "Build comparison table", done: false },
    ],
    sessionId: "sess_9b1c",
    conversationId: "conv_research_pricing",
    outputs: ["competitors.csv"],
    logTail: [
      "[11:58:11] researcher: fetched 5 pricing pages",
      "[12:01:44] researcher: parsing tier structures",
    ],
    createdAt: iso(-2),
  },
  {
    id: "t-003",
    title: "Draft launch email sequence",
    description: "Five-email sequence covering announce, deep-dive, social proof, objection handling, last call.",
    agentId: "marketer",
    priority: "high",
    status: "needs_review",
    dueDate: iso(1),
    subtasks: [
      { id: "s1", title: "Outline arc", done: true },
      { id: "s2", title: "Write all 5 drafts", done: true },
      { id: "s3", title: "Operator review", done: false },
    ],
    sessionId: "sess_3a44",
    conversationId: "conv_marketing_launch",
    snapshotId: "snap_email_seq",
    outputs: ["email-1.md", "email-2.md", "email-3.md", "email-4.md", "email-5.md"],
    logTail: ["[10:12:01] marketer: drafts complete, awaiting review"],
    createdAt: iso(-4),
  },
  {
    id: "t-004",
    title: "Implement webhook signer",
    description: "HMAC-SHA256 signing for outbound webhooks with replay protection.",
    agentId: "builder",
    priority: "high",
    status: "running",
    dueDate: iso(3),
    subtasks: [
      { id: "s1", title: "Spec signing scheme", done: true },
      { id: "s2", title: "Implement signer", done: true },
      { id: "s3", title: "Add tests", done: false },
      { id: "s4", title: "Document", done: false },
    ],
    outputs: ["src/server/webhooks/signer.ts"],
    logTail: ["[12:00:05] builder: tests scaffolded"],
    createdAt: iso(-1),
  },
  {
    id: "t-005",
    title: "Provision staging VPS",
    description: "Spin up staging instance, install OpenClaw, configure Tailscale, run smoke tests.",
    agentId: "ops",
    priority: "medium",
    status: "blocked",
    dueDate: iso(5),
    subtasks: [
      { id: "s1", title: "Pick provider", done: true },
      { id: "s2", title: "Wait for budget approval", done: false },
    ],
    outputs: [],
    logTail: ["[09:20:00] ops: blocked — awaiting budget approval"],
    createdAt: iso(-5),
  },
  {
    id: "t-006",
    title: "Research: federated memory backends",
    description: "Compare Postgres FTS, SQLite FTS5, and Tantivy for Carapace's memory layer.",
    agentId: "researcher",
    priority: "low",
    status: "planned",
    dueDate: iso(14),
    subtasks: [],
    outputs: [],
    logTail: [],
    createdAt: iso(-1),
  },
  {
    id: "t-007",
    title: "Refactor logger to structured JSON",
    description: "Move all agent logs to structured JSON with stable field names.",
    agentId: "builder",
    priority: "medium",
    status: "assigned",
    dueDate: iso(10),
    subtasks: [
      { id: "s1", title: "Define schema", done: false },
      { id: "s2", title: "Migrate emitters", done: false },
    ],
    outputs: [],
    logTail: [],
    createdAt: iso(0),
  },
  {
    id: "t-008",
    title: "Triage incoming Telegram threads",
    description: "Sweep last 24h of Telegram messages, route actionable items to the right subagent.",
    agentId: "chief",
    priority: "medium",
    status: "inbox",
    subtasks: [],
    outputs: [],
    logTail: [],
    createdAt: iso(0),
  },
  {
    id: "t-009",
    title: "Old: image OCR experiment",
    description: "Closed — chosen vendor sunset. Archive findings.",
    agentId: "researcher",
    priority: "low",
    status: "done",
    subtasks: [{ id: "s1", title: "Archive notes", done: true }],
    outputs: ["ocr-findings.md"],
    logTail: [],
    createdAt: iso(-30),
  },
  {
    id: "t-010",
    title: "Failed: bulk import from legacy CRM",
    description: "Schema mismatch — needs new approach.",
    agentId: "ops",
    priority: "low",
    status: "failed",
    subtasks: [],
    outputs: [],
    logTail: ["[14:02:11] ops: import failed — schema mismatch"],
    createdAt: iso(-12),
  },
];

export interface Snapshot {
  id: string;
  agentId: AgentId;
  objective: string;
  currentState: string;
  decisions: string[];
  nextActions: string[];
  blockers: string[];
  files: string[];
  memoryRefs: string[];
  createdAt: string;
}

export const SNAPSHOTS: Snapshot[] = [
  {
    id: "snap_q4_launch",
    agentId: "chief",
    objective: "Successfully ship Q4 launch with coordinated comms and zero downtime.",
    currentState: "Marketing copy in review. Builder implementing webhook signer. Ops blocked on budget.",
    decisions: [
      "Launch on Tuesday (low support volume)",
      "Use phased rollout: 10% → 50% → 100%",
      "Marketer owns all outbound copy",
    ],
    nextActions: [
      "Approve marketer's email sequence",
      "Unblock ops budget",
      "Final infra readiness review",
    ],
    blockers: ["Ops budget approval"],
    files: ["launch-brief.md", "rollout-plan.md"],
    memoryRefs: ["MEMORY.md#launch-priors", "DREAMS.md#2026-04-22"],
    createdAt: iso(-1),
  },
  {
    id: "snap_email_seq",
    agentId: "marketer",
    objective: "Five-email launch sequence ready for operator review.",
    currentState: "All five drafts written, voice-checked against brand guide.",
    decisions: ["Open with story not feature", "Email 3 = customer quote"],
    nextActions: ["Operator review", "Schedule sends in marketing platform"],
    blockers: [],
    files: ["email-1.md", "email-2.md", "email-3.md", "email-4.md", "email-5.md"],
    memoryRefs: ["MEMORY.md#brand-voice"],
    createdAt: iso(0),
  },
];

export interface ConversationMessage {
  id: string;
  channel: "telegram" | "ui" | "terminal" | "api";
  author: string;
  body: string;
  timestamp: string;
}

export interface ConversationThread {
  id: string;
  title: string;
  agentId: AgentId;
  channels: ("telegram" | "ui" | "terminal" | "api")[];
  unread: number;
  lastActivity: string;
  messages: ConversationMessage[];
}

export const CONVERSATIONS: ConversationThread[] = [
  {
    id: "conv_chief_launch",
    title: "Q4 launch coordination",
    agentId: "chief",
    channels: ["ui", "telegram"],
    unread: 2,
    lastActivity: iso(0),
    messages: [
      { id: "m1", channel: "ui", author: "Operator", body: "How's launch tracking?", timestamp: iso(0) },
      { id: "m2", channel: "ui", author: "Chief", body: "Marketing in review, builder on signer, ops blocked on budget.", timestamp: iso(0) },
      { id: "m3", channel: "telegram", author: "Operator", body: "Approving budget now.", timestamp: iso(0) },
    ],
  },
  {
    id: "conv_research_pricing",
    title: "Competitor pricing teardown",
    agentId: "researcher",
    channels: ["ui"],
    unread: 0,
    lastActivity: iso(0),
    messages: [
      { id: "m1", channel: "ui", author: "Researcher", body: "Pulled 5 pricing pages, parsing tiers now.", timestamp: iso(0) },
    ],
  },
  {
    id: "conv_marketing_launch",
    title: "Email sequence drafts",
    agentId: "marketer",
    channels: ["ui", "api"],
    unread: 1,
    lastActivity: iso(0),
    messages: [
      { id: "m1", channel: "ui", author: "Marketer", body: "All 5 drafts ready for review.", timestamp: iso(0) },
    ],
  },
  {
    id: "conv_builder_signer",
    title: "Webhook signer implementation",
    agentId: "builder",
    channels: ["terminal", "ui"],
    unread: 0,
    lastActivity: iso(0),
    messages: [
      { id: "m1", channel: "terminal", author: "Builder", body: "$ bun test webhook-signer", timestamp: iso(0) },
      { id: "m2", channel: "terminal", author: "Builder", body: "3 tests pass, 1 failing on replay", timestamp: iso(0) },
    ],
  },
];

export interface ApprovalRequest {
  id: string;
  type: "command" | "file_edit" | "config_change" | "memory_write";
  agentId: AgentId;
  summary: string;
  details: string;
  diff?: string;
  createdAt: string;
  status: "pending" | "approved" | "denied";
}

export const APPROVALS: ApprovalRequest[] = [
  {
    id: "apr_001",
    type: "command",
    agentId: "ops",
    summary: "Run: systemctl restart openclaw",
    details: "Builder finished hot-patch; ops wants to restart OpenClaw to pick up new env.",
    createdAt: iso(0),
    status: "pending",
  },
  {
    id: "apr_002",
    type: "file_edit",
    agentId: "builder",
    summary: "Edit src/server/webhooks/signer.ts",
    details: "Add HMAC verification helper.",
    diff: `@@ src/server/webhooks/signer.ts @@\n+ export function verify(sig: string, body: string, secret: string) {\n+   const expected = createHmac('sha256', secret).update(body).digest('hex');\n+   return timingSafeEqual(Buffer.from(sig), Buffer.from(expected));\n+ }`,
    createdAt: iso(0),
    status: "pending",
  },
  {
    id: "apr_003",
    type: "memory_write",
    agentId: "chief",
    summary: "Promote launch decisions to MEMORY.md",
    details: "Move 3 decisions from snap_q4_launch into long-term memory.",
    createdAt: iso(0),
    status: "pending",
  },
];

export interface ProviderConfig {
  id: string;
  name: string;
  primary: boolean;
  fallbackOrder: number;
  models: string[];
  status: "ok" | "warn" | "error" | "untested";
}

export const PROVIDERS: ProviderConfig[] = [
  { id: "anthropic", name: "Anthropic", primary: true, fallbackOrder: 0, models: ["claude-3.5-sonnet", "claude-3.5-haiku"], status: "ok" },
  { id: "openai", name: "OpenAI", primary: false, fallbackOrder: 1, models: ["gpt-4o", "gpt-4o-mini"], status: "ok" },
  { id: "groq", name: "Groq", primary: false, fallbackOrder: 2, models: ["llama-3.3-70b", "mixtral-8x7b"], status: "ok" },
  { id: "gemini", name: "Gemini", primary: false, fallbackOrder: 3, models: ["gemini-2.0-flash"], status: "untested" },
  { id: "mistral", name: "Mistral", primary: false, fallbackOrder: 4, models: ["mistral-large"], status: "untested" },
  { id: "ollama", name: "Ollama (local)", primary: false, fallbackOrder: 5, models: ["llama3.1:8b"], status: "warn" },
  { id: "custom", name: "Custom", primary: false, fallbackOrder: 6, models: [], status: "untested" },
];

export interface DreamPhase {
  id: string;
  name: string;
  description: string;
  status: "complete" | "running" | "pending";
  startedAt?: string;
  durationMs?: number;
}

export const DREAM_RUN: { lastRunAt: string; phases: DreamPhase[]; pendingChanges: { id: string; kind: "promote" | "remove"; target: string; reason: string }[] } = {
  lastRunAt: iso(0),
  phases: [
    { id: "p1", name: "Replay", description: "Re-read recent sessions", status: "complete", startedAt: iso(0), durationMs: 1240 },
    { id: "p2", name: "Cluster", description: "Group related events", status: "complete", startedAt: iso(0), durationMs: 880 },
    { id: "p3", name: "Score", description: "Importance + recency scoring", status: "complete", startedAt: iso(0), durationMs: 410 },
    { id: "p4", name: "Promote", description: "Move significant items into long-term memory", status: "running", startedAt: iso(0) },
    { id: "p5", name: "Prune", description: "Remove low-value entries", status: "pending" },
  ],
  pendingChanges: [
    { id: "c1", kind: "promote", target: "MEMORY.md#launch-priors", reason: "Referenced 4 times this week" },
    { id: "c2", kind: "promote", target: "MEMORY.md#brand-voice", reason: "Marketer reused across 3 tasks" },
    { id: "c3", kind: "remove", target: "MEMORY.md#legacy-crm-import", reason: "Task failed and archived 12 days ago" },
  ],
};

export interface MemoryEntry {
  id: string;
  source: "MEMORY.md" | "DREAMS.md" | "daily" | "snapshot";
  title: string;
  excerpt: string;
  agentId?: AgentId;
  promotedAt: string;
}

export const MEMORY_ENTRIES: MemoryEntry[] = [
  { id: "me1", source: "MEMORY.md", title: "Launch priors", excerpt: "Tuesday launches consistently outperform Thursday by ~12% in click-through.", promotedAt: iso(-7), agentId: "chief" },
  { id: "me2", source: "MEMORY.md", title: "Brand voice", excerpt: "Confident, direct, no corporate hedging. Avoid 'unleash', 'leverage', 'seamless'.", promotedAt: iso(-21), agentId: "marketer" },
  { id: "me3", source: "DREAMS.md", title: "Cluster: rollback recipes", excerpt: "Pattern: every infra incident this quarter resolved by rolling back, not patching forward.", promotedAt: iso(-14), agentId: "ops" },
  { id: "me4", source: "snapshot", title: "snap_q4_launch", excerpt: "Active snapshot for the Q4 launch coordination task.", promotedAt: iso(-1), agentId: "chief" },
  { id: "me5", source: "daily", title: "2026-04-29", excerpt: "Researcher noticed competitor C deprecated their free tier — pricing implications.", promotedAt: iso(-1), agentId: "researcher" },
];

export interface LogEntry {
  id: string;
  ts: string;
  level: "debug" | "info" | "warn" | "error";
  agentId?: AgentId;
  message: string;
}

export const LOGS: LogEntry[] = Array.from({ length: 60 }, (_, i) => {
  const levels: LogEntry["level"][] = ["debug", "info", "info", "info", "warn", "error"];
  const agents: AgentId[] = ["chief", "researcher", "marketer", "builder", "ops"];
  const msgs = [
    "tool.call exec started",
    "tool.call web.search returned 8 results",
    "memory.read MEMORY.md#brand-voice",
    "session.start",
    "edge.payload sent to subagent",
    "approval.request queued",
    "snapshot.save complete",
    "context.pressure 0.71 — consider compaction",
    "provider.fallback Anthropic → OpenAI",
    "task.transition running → needs_review",
  ];
  const d = new Date(Date.now() - i * 14_000);
  return {
    id: `log_${i}`,
    ts: d.toISOString(),
    level: levels[i % levels.length],
    agentId: agents[i % agents.length],
    message: msgs[i % msgs.length],
  };
});

export interface FileNode {
  name: string;
  type: "file" | "dir";
  path: string;
  children?: FileNode[];
  preview?: string;
}

export const FILE_TREE: FileNode[] = [
  {
    name: "agents", type: "dir", path: "/agents",
    children: [
      { name: "AGENTS.md", type: "file", path: "/agents/AGENTS.md", preview: "# Agents\n\n- chief — Chief of Staff\n- researcher — Researcher\n- marketer — Marketer\n- builder — Builder\n- ops — Ops\n" },
      { name: "SOUL.md", type: "file", path: "/agents/SOUL.md", preview: "# Soul\n\nCarapace agents are operator-aligned. They surface intent, never hide it.\n" },
      { name: "MEMORY.md", type: "file", path: "/agents/MEMORY.md", preview: "# Memory\n\n## Launch priors\nTuesday launches outperform Thursday by ~12%.\n\n## Brand voice\nConfident, direct, no hedging.\n" },
      { name: "USER.md", type: "file", path: "/agents/USER.md", preview: "# User\n\nName: Operator\nTimezone: Europe/Berlin\nPrefers terse status reports.\n" },
      { name: "DREAMS.md", type: "file", path: "/agents/DREAMS.md", preview: "# Dreams\n\nMemory consolidation log. Each run records phases and changes.\n" },
    ],
  },
  {
    name: "openclaw", type: "dir", path: "/openclaw",
    children: [
      { name: "config.toml", type: "file", path: "/openclaw/config.toml", preview: "bind = \"127.0.0.1:18789\"\n" },
      { name: "core", type: "dir", path: "/openclaw/core", children: [
        { name: "loop.rs", type: "file", path: "/openclaw/core/loop.rs", preview: "// OpenClaw core loop — DO NOT EDIT" },
        { name: "session.rs", type: "file", path: "/openclaw/core/session.rs", preview: "// session manager" },
      ]},
      { name: "providers", type: "dir", path: "/openclaw/providers", children: [
        { name: "anthropic.rs", type: "file", path: "/openclaw/providers/anthropic.rs", preview: "// Anthropic adapter" },
        { name: "openai.rs", type: "file", path: "/openclaw/providers/openai.rs", preview: "// OpenAI adapter" },
      ]},
    ],
  },
];

// ---------- Orchestration / Flow extensions ----------

export interface Delegation {
  id: string;
  fromAgentId: AgentId;
  toAgentId: AgentId;
  taskId: string;
  status: "active" | "blocked" | "review" | "done";
  startedAt: string;
}

export const DELEGATIONS: Delegation[] = [
  { id: "d-001", fromAgentId: "chief", toAgentId: "researcher", taskId: "t-002", status: "active", startedAt: iso(-2) },
  { id: "d-002", fromAgentId: "chief", toAgentId: "marketer",   taskId: "t-003", status: "review", startedAt: iso(-4) },
  { id: "d-003", fromAgentId: "chief", toAgentId: "builder",    taskId: "t-004", status: "active", startedAt: iso(-1) },
  { id: "d-004", fromAgentId: "chief", toAgentId: "ops",        taskId: "t-005", status: "blocked", startedAt: iso(-5) },
];

export interface MemoryEvent {
  id: string;
  agentId: AgentId;
  kind: "read" | "write_candidate" | "snapshot" | "dream";
  ref: string;
  note?: string;
  ts: string;
}

export const MEMORY_EVENTS: MemoryEvent[] = [
  { id: "ev-1", agentId: "chief",      kind: "read",            ref: "MEMORY.md#launch-priors", note: "context for Q4 launch", ts: iso(0) },
  { id: "ev-2", agentId: "chief",      kind: "write_candidate", ref: "MEMORY.md (3 decisions)", note: "pending operator approval", ts: iso(0) },
  { id: "ev-3", agentId: "chief",      kind: "snapshot",        ref: "snap_q4_launch", ts: iso(-1) },
  { id: "ev-4", agentId: "marketer",   kind: "read",            ref: "MEMORY.md#brand-voice", ts: iso(0) },
  { id: "ev-5", agentId: "marketer",   kind: "snapshot",        ref: "snap_email_seq", ts: iso(0) },
  { id: "ev-6", agentId: "researcher", kind: "read",            ref: "DREAMS.md#pricing-cluster", ts: iso(0) },
  { id: "ev-7", agentId: "researcher", kind: "write_candidate", ref: "MEMORY.md#competitor-C-free-tier", ts: iso(0) },
  { id: "ev-8", agentId: "builder",    kind: "read",            ref: "MEMORY.md#webhook-conventions", ts: iso(0) },
  { id: "ev-9", agentId: "ops",        kind: "dream",           ref: "DREAMS.md#rollback-recipes", ts: iso(-1) },
];

export function getDelegationForAgent(agentId: AgentId): Delegation | undefined {
  return DELEGATIONS.find((d) => d.toAgentId === agentId);
}

export function getTaskById(id: string): Task | undefined {
  return TASKS.find((t) => t.id === id);
}
