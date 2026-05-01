import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { PageHeader } from "@/components/shell/PageHeader";
import { resetOnboardingHints } from "@/components/shell/OnboardingHint";
import {
  Activity, KanbanSquare, Users, FolderTree, MessagesSquare, Sparkles,
  Brain, Camera, Plug, ShieldCheck, ScrollText, Settings, BookOpen,
  Compass, Workflow, GitBranch, RefreshCw, ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/docs")({
  head: () => ({
    meta: [
      { title: "Docs — Carapace" },
      { name: "description", content: "Operator handbook for Carapace — how every page, feature, and data flow connects to control a Chief of Staff agent and its subagents." },
      { property: "og:title", content: "Docs — Carapace" },
      { property: "og:description", content: "Operator handbook for the Carapace control plane." },
    ],
  }),
  component: DocsPage,
});

type Section = {
  id: string;
  label: string;
  icon: typeof Activity;
  group: "start" | "primary" | "modules" | "system" | "playbook";
};

const SECTIONS: Section[] = [
  { id: "overview", label: "Overview", icon: Compass, group: "start" },
  { id: "mental-model", label: "Mental model", icon: Workflow, group: "start" },
  { id: "quickstart", label: "Quick start", icon: ArrowRight, group: "start" },

  { id: "flow", label: "Flow", icon: Activity, group: "primary" },
  { id: "kanban", label: "Kanban", icon: KanbanSquare, group: "primary" },

  { id: "agents", label: "Agents", icon: Users, group: "modules" },
  { id: "files", label: "Files", icon: FolderTree, group: "modules" },
  { id: "conversations", label: "Conversations", icon: MessagesSquare, group: "modules" },
  { id: "dreams", label: "Dreams", icon: Sparkles, group: "modules" },
  { id: "memory", label: "Memory", icon: Brain, group: "modules" },
  { id: "snapshots", label: "Snapshots", icon: Camera, group: "modules" },
  { id: "providers", label: "Providers", icon: Plug, group: "modules" },

  { id: "approvals", label: "Approvals", icon: ShieldCheck, group: "system" },
  { id: "logs", label: "Logs", icon: ScrollText, group: "system" },
  { id: "settings", label: "Settings", icon: Settings, group: "system" },

  { id: "playbook", label: "Daily playbook", icon: GitBranch, group: "playbook" },
  { id: "data-flow", label: "How data flows", icon: Workflow, group: "playbook" },
  { id: "glossary", label: "Glossary", icon: BookOpen, group: "playbook" },
];

function DocsPage() {
  const [activeId, setActiveId] = useState<string>("overview");

  const grouped = useMemo(() => {
    const map: Record<Section["group"], Section[]> = { start: [], primary: [], modules: [], system: [], playbook: [] };
    for (const s of SECTIONS) map[s.group].push(s);
    return map;
  }, []);

  return (
    <AppShell title="Docs" subtitle="Operator handbook · how the control plane fits together">
      <PageHeader
        eyebrow="System"
        title="Carapace operator handbook"
        description="A guided tour through every page, every feature, and how they fit together to let one operator control a Chief of Staff agent and its subagents."
        actions={
          <button
            onClick={resetOnboardingHints}
            className="px-2.5 py-1.5 rounded-md surface border border-border text-[11px] flex items-center gap-1.5 hover:border-yellow/60"
            title="Re-show all onboarding tooltips on every page"
          >
            <RefreshCw className="w-3 h-3" /> Reset onboarding hints
          </button>
        }
      />

      <div className="flex min-h-0">
        {/* TOC */}
        <nav className="w-60 shrink-0 border-r border-border p-4 space-y-4 overflow-y-auto">
          {(["start", "primary", "modules", "system", "playbook"] as const).map((g) => (
            <div key={g}>
              <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground text-mono">
                {g === "start" ? "Start here"
                  : g === "primary" ? "Primary surfaces"
                  : g === "modules" ? "Modules"
                  : g === "system" ? "System"
                  : "Playbook"}
              </div>
              <ul className="space-y-0.5">
                {grouped[g].map((s) => {
                  const Icon = s.icon;
                  const active = activeId === s.id;
                  return (
                    <li key={s.id}>
                      <a
                        href={`#${s.id}`}
                        onClick={() => setActiveId(s.id)}
                        className={cn(
                          "flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors border-l-2",
                          active
                            ? "bg-surface text-foreground border-yellow"
                            : "text-muted-foreground border-transparent hover:bg-surface hover:text-foreground",
                        )}
                      >
                        <Icon className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">{s.label}</span>
                      </a>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* Content */}
        <div className="flex-1 min-w-0 overflow-y-auto">
          <article className="max-w-3xl mx-auto px-8 py-8 space-y-12 text-sm leading-relaxed">
            <Overview />
            <MentalModel />
            <QuickStart />

            <FlowDoc />
            <KanbanDoc />

            <AgentsDoc />
            <FilesDoc />
            <ConversationsDoc />
            <DreamsDoc />
            <MemoryDoc />
            <SnapshotsDoc />
            <ProvidersDoc />

            <ApprovalsDoc />
            <LogsDoc />
            <SettingsDoc />

            <Playbook />
            <DataFlow />
            <Glossary />
          </article>
        </div>
      </div>
    </AppShell>
  );
}

/* ------------------------------------------------------------------ */
/* Section helpers                                                    */
/* ------------------------------------------------------------------ */

function H({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h3 id={id} className="text-xl font-semibold tracking-tight scroll-mt-6 flex items-center gap-2">
      {children}
    </h3>
  );
}
function H4({ children }: { children: React.ReactNode }) {
  return <h4 className="text-sm font-semibold tracking-tight mt-4">{children}</h4>;
}
function P({ children }: { children: React.ReactNode }) {
  return <p className="text-muted-foreground">{children}</p>;
}
function UL({ children }: { children: React.ReactNode }) {
  return <ul className="list-disc pl-5 space-y-1.5 text-muted-foreground marker:text-yellow/70">{children}</ul>;
}
function Callout({ kind = "info", children }: { kind?: "info" | "warn" | "tip"; children: React.ReactNode }) {
  const tone = kind === "warn"
    ? "border-yellow/40 bg-yellow/5 text-yellow"
    : kind === "tip"
    ? "border-sky/40 bg-sky/5"
    : "border-border surface";
  return (
    <div className={cn("rounded-md border px-3 py-2 text-xs", tone)}>{children}</div>
  );
}
function PageLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link to={to} className="text-yellow hover:underline text-mono">
      {children}
    </Link>
  );
}
function Section({ id, icon: Icon, title, children }: {
  id: string; icon: typeof Activity; title: string; children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <H id={id}><Icon className="w-5 h-5 text-yellow" /> {title}</H>
      {children}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Content                                                            */
/* ------------------------------------------------------------------ */

function Overview() {
  return (
    <Section id="overview" icon={Compass} title="What Carapace is">
      <P>
        Carapace is the <strong className="text-foreground">operator interface</strong> for OpenClaw.
        OpenClaw is the execution engine that actually runs your agents; Carapace is the cockpit you
        sit in to watch them, steer them, and approve risky actions.
      </P>
      <P>
        Everything you do here ultimately maps to one of four verbs:
      </P>
      <UL>
        <li><strong className="text-foreground">See</strong> — Flow + Logs + Conversations show what agents are doing.</li>
        <li><strong className="text-foreground">Direct</strong> — Kanban + Agents define what they should be doing.</li>
        <li><strong className="text-foreground">Remember</strong> — Memory + Snapshots + Dreams control what they keep.</li>
        <li><strong className="text-foreground">Gate</strong> — Approvals + Providers + Settings control what they're allowed to do.</li>
      </UL>
      <Callout kind="tip">
        New here? Read <a href="#mental-model" className="underline">Mental model</a> next — most
        confusion goes away once you understand the Chief / Subagent split.
      </Callout>
    </Section>
  );
}

function MentalModel() {
  return (
    <Section id="mental-model" icon={Workflow} title="Mental model: Chief of Staff and subagents">
      <P>
        Carapace assumes <strong className="text-foreground">one main agent</strong> — the Chief of
        Staff — and several <strong className="text-foreground">subagents</strong> specialised by
        domain (research, marketing, building, operations, …). The Chief delegates; subagents execute.
      </P>
      <H4>Why this shape matters</H4>
      <UL>
        <li>The Chief holds context across all your work; subagents stay focused.</li>
        <li>Snapshots and memory live <em>per agent</em>, so a subagent can be paused and resumed without polluting the Chief's context.</li>
        <li>Approvals route to <em>you</em>, never agent-to-agent — the operator is always the gate.</li>
      </UL>
      <H4>Identifiers</H4>
      <P>
        OpenClaw stores agents by raw IDs (e.g. <code className="text-mono">agt_a8f3</code>). Carapace
        overlays a <strong className="text-foreground">friendly name</strong> via the agent registry
        — raw IDs stay stable, friendly names are for humans. See <PageLink to="/agents">Agents</PageLink>.
      </P>
    </Section>
  );
}

function QuickStart() {
  return (
    <Section id="quickstart" icon={ArrowRight} title="Quick start (5 minutes)">
      <ol className="list-decimal pl-5 space-y-2 text-muted-foreground marker:text-yellow">
        <li>
          Open <PageLink to="/agents">Agents</PageLink> and rename the Chief and at least one subagent
          to friendly names you'll recognise. Save — these are local until you push them to OpenClaw config.
        </li>
        <li>
          Go to <PageLink to="/kanban">Kanban</PageLink> and create your first task with the{" "}
          <code className="text-mono">+ Task</code> button. Assign it to a subagent.
        </li>
        <li>
          Switch to <PageLink to="/">Flow</PageLink>. Select the agent you just assigned — you'll see
          their inputs, tools, memory, and active task as a graph.
        </li>
        <li>
          When the agent stops mid-task, open <PageLink to="/snapshots">Snapshots</PageLink> and
          create a snapshot so the work is resumable.
        </li>
        <li>
          Anything risky an agent wants to do (write a file, hit an external API, spend money) lands
          in <PageLink to="/approvals">Approvals</PageLink>. Approve or deny — nothing else happens
          without you.
        </li>
      </ol>
    </Section>
  );
}

function FlowDoc() {
  return (
    <Section id="flow" icon={Activity} title="Flow — the runtime graph">
      <P>
        Flow is the primary surface. It's a live graph of one agent at a time showing every input it
        consumes and every effect it produces: prompts, tools, memory reads, files touched, logs emitted.
      </P>
      <H4>Reading the graph</H4>
      <UL>
        <li><strong className="text-foreground">Left rail</strong> — agent hierarchy. Click an agent to focus the graph on them.</li>
        <li><strong className="text-foreground">Centre</strong> — the agent's current execution path, laid out by ELK.</li>
        <li><strong className="text-foreground">Priority filter</strong> — Low / Medium / High narrows the graph to relevant nodes.</li>
        <li><strong className="text-foreground">Auto-layout toggle</strong> — turn off if you've dragged nodes into a layout you want to keep.</li>
      </UL>
      <H4>How Flow connects to other pages</H4>
      <UL>
        <li>Clicking a memory/snapshot node jumps to <PageLink to="/snapshots">Snapshots</PageLink> or <PageLink to="/memory">Memory</PageLink>.</li>
        <li>Active task badges come from the same store that powers <PageLink to="/kanban">Kanban</PageLink> — moving a card there updates the graph here.</li>
        <li>Risky tool calls render as approval-pending nodes; act on them in <PageLink to="/approvals">Approvals</PageLink>.</li>
      </UL>
      <Callout kind="tip">Treat Flow as a "what is this agent thinking right now?" view. If it looks crowded, switch to a single subagent.</Callout>
    </Section>
  );
}

function KanbanDoc() {
  return (
    <Section id="kanban" icon={KanbanSquare} title="Kanban — mission control">
      <P>
        Kanban is where work is <em>defined</em>. Every task is structured (title, description, agent,
        priority, subtasks, due date) instead of buried in a chat thread.
      </P>
      <H4>Lanes</H4>
      <UL>
        <li><strong className="text-foreground">Inbox</strong> — newly created, unassigned-to-status work.</li>
        <li><strong className="text-foreground">Planned → Active → Review → Done</strong> — the normal lifecycle.</li>
        <li><strong className="text-foreground">Blocked / Paused / Archived</strong> — exception lanes.</li>
      </UL>
      <H4>Creating tasks</H4>
      <P>
        Click <code className="text-mono">+ Task</code>. Title is required; everything else is
        optional but assigning an agent is strongly recommended — unassigned tasks default to the Chief
        of Staff.
      </P>
      <H4>Connections</H4>
      <UL>
        <li>Tasks appear on <PageLink to="/">Flow</PageLink> as soon as they're active.</li>
        <li>Each task can have a <PageLink to="/snapshots">snapshot</PageLink> attached — the snapshot summary surfaces in the task drawer with a "Resume in Flow" action.</li>
        <li>Importance (flame icon) feeds the <PageLink to="/dreams">Dreams</PageLink> consolidation pass.</li>
      </UL>
    </Section>
  );
}

function AgentsDoc() {
  return (
    <Section id="agents" icon={Users} title="Agents — the registry">
      <P>
        The agent registry overlays human-friendly names onto OpenClaw's raw IDs. Raw IDs never change;
        friendly names are yours to edit and can be pushed back to the OpenClaw config when you're ready.
      </P>
      <H4>Source pill</H4>
      <UL>
        <li><strong className="text-foreground">Mock</strong> — seeded for the preview, not real.</li>
        <li><strong className="text-foreground">Carapace</strong> — saved locally, not yet pushed.</li>
        <li><strong className="text-foreground">OpenClaw</strong> — read straight from OpenClaw config, authoritative.</li>
      </UL>
      <H4>Editing</H4>
      <P>
        Click <strong>Edit</strong> on any card. You can change friendly name, role, parent, workspace,
        memory path, tags, and notes. Saving marks the alias <em>dirty</em>. Pushing to OpenClaw
        config takes a backup first and writes an audit entry — no destructive write happens silently.
      </P>
      <Callout kind="warn">Friendly names are for you. Raw IDs are for OpenClaw. Never edit raw IDs from Carapace.</Callout>
    </Section>
  );
}

function FilesDoc() {
  return (
    <Section id="files" icon={FolderTree} title="Files — agent and codebase explorer">
      <P>
        Files lets you browse and edit the OpenClaw codebase and per-agent files (workspaces,
        MEMORY.md, DREAMS.md). It's safe-by-default: edits create a backup before writing, and any
        write that affects a tracked agent file shows up in <PageLink to="/logs">Logs</PageLink>.
      </P>
      <UL>
        <li>Use it to inspect an agent's workspace path defined in <PageLink to="/agents">Agents</PageLink>.</li>
        <li>Edit MEMORY.md directly when you need to seed an agent's long-term memory.</li>
      </UL>
    </Section>
  );
}

function ConversationsDoc() {
  return (
    <Section id="conversations" icon={MessagesSquare} title="Conversations — unified threads">
      <P>
        OpenClaw agents end up talking to you across many channels — Telegram, the OpenClaw CLI, the
        Carapace UI, raw API. Conversations stitches those fragments into one timeline per agent.
      </P>
      <UL>
        <li>Each thread is linked to the agent (via raw ID) so it shows up under the right friendly name.</li>
        <li>From a thread you can spin out a Kanban task or attach a snapshot.</li>
      </UL>
    </Section>
  );
}

function DreamsDoc() {
  return (
    <Section id="dreams" icon={Sparkles} title="Dreams — memory consolidation">
      <P>
        Dreams is OpenClaw's consolidation pass: it walks recent memory, promotes the important bits
        to long-term storage (MEMORY.md), and removes noise. Carapace makes the run observable.
      </P>
      <UL>
        <li>Trigger a manual run, or watch the scheduled run.</li>
        <li>Every promotion / removal can be reviewed and reverted.</li>
        <li>Promotions feed straight into <PageLink to="/memory">Memory</PageLink> as new entries.</li>
      </UL>
    </Section>
  );
}

function MemoryDoc() {
  return (
    <Section id="memory" icon={Brain} title="Memory — controlled retrieval, not dumping">
      <P>
        Memory in Carapace has four tabs:
      </P>
      <UL>
        <li><strong className="text-foreground">Search</strong> — ranked hits across MEMORY.md, DREAMS.md, daily notes, snapshots, task notes, and conversation summaries.</li>
        <li><strong className="text-foreground">Browse</strong> — raw entries grouped by source.</li>
        <li><strong className="text-foreground">Retrieval traces</strong> — every time an agent retrieved memory: what it queried, what was selected, what was rejected. This is your audit trail.</li>
        <li><strong className="text-foreground">Write queue</strong> — proposed memory writes from agents waiting for your approval. You can edit the text before approving.</li>
      </UL>
      <Callout kind="tip">Rule of thumb: memory is retrieved, ranked, traced, and controlled — never dumped blindly into agent context.</Callout>
    </Section>
  );
}

function SnapshotsDoc() {
  return (
    <Section id="snapshots" icon={Camera} title="Snapshots — resumable work-state">
      <P>
        A snapshot is a compressed operational state for one task: objective, decisions made so far,
        next actions, blockers, open questions, retrieval keywords. They are <em>not</em> transcripts.
      </P>
      <H4>Lifecycle</H4>
      <UL>
        <li><code className="text-mono">draft</code> → <code className="text-mono">ready</code> → <code className="text-mono">in_use</code> → <code className="text-mono">stale</code> → <code className="text-mono">archived</code>.</li>
      </UL>
      <H4>How they flow</H4>
      <UL>
        <li>Created from <PageLink to="/kanban">Kanban</PageLink> or directly from this page.</li>
        <li>Surface in <PageLink to="/">Flow</PageLink> as nodes you can click into.</li>
        <li>Indexed into <PageLink to="/memory">Memory</PageLink> so other tasks can retrieve them.</li>
      </UL>
    </Section>
  );
}

function ProvidersDoc() {
  return (
    <Section id="providers" icon={Plug} title="Providers — primary and fallback LLMs">
      <P>
        Configure each LLM provider, set a primary and a fallback chain, and assign defaults per agent.
        Edits here propagate to OpenClaw's runtime config.
      </P>
      <UL>
        <li>Per-agent overrides live on the <PageLink to="/agents">Agents</PageLink> card.</li>
        <li>Failures are visible in <PageLink to="/logs">Logs</PageLink> and trigger fallback automatically.</li>
      </UL>
    </Section>
  );
}

function ApprovalsDoc() {
  return (
    <Section id="approvals" icon={ShieldCheck} title="Approvals — the operator gate">
      <P>
        Anything an agent does that's destructive, expensive, or external lands here first. Approve,
        deny, or edit-then-approve. The badge in the top bar tells you how many are waiting.
      </P>
      <UL>
        <li>Memory writes proposed by agents → routed via <PageLink to="/memory">Memory → Write queue</PageLink>.</li>
        <li>OpenClaw config changes from the registry → routed here.</li>
        <li>Tool calls flagged risky by the agent → routed here.</li>
      </UL>
      <Callout kind="warn">Carapace never auto-approves. If the gate is empty, nothing risky is happening.</Callout>
    </Section>
  );
}

function LogsDoc() {
  return (
    <Section id="logs" icon={ScrollText} title="Logs — append-only audit">
      <P>
        Every state-changing action (alias edit, config write, task move, approval, snapshot
        creation, memory write) emits a log entry. Filter by agent or action type.
      </P>
    </Section>
  );
}

function SettingsDoc() {
  return (
    <Section id="settings" icon={Settings} title="Settings — connection and security">
      <P>
        Configure the OpenClaw base URL, the OpenClaw config + agents paths, theme, and the Tailscale
        Serve hostname Carapace is exposed on.
      </P>
      <Callout kind="warn">
        Carapace must bind to localhost only — expose it through Tailscale Serve, not the public
        internet. See the deployment doc in the repo.
      </Callout>
    </Section>
  );
}

function Playbook() {
  return (
    <Section id="playbook" icon={GitBranch} title="A typical operator day">
      <ol className="list-decimal pl-5 space-y-2 text-muted-foreground marker:text-yellow">
        <li><strong className="text-foreground">Open <PageLink to="/approvals">Approvals</PageLink></strong> first — clear anything blocking agents overnight.</li>
        <li>Glance at <PageLink to="/">Flow</PageLink> for the Chief of Staff. Anything red? Anything stuck on a tool call?</li>
        <li>Move new work into <PageLink to="/kanban">Kanban</PageLink> and assign subagents.</li>
        <li>For long-running tasks, check the <PageLink to="/snapshots">snapshot</PageLink> — is it still <em>ready</em> or has it gone <em>stale</em>?</li>
        <li>Review the <PageLink to="/memory">memory write queue</PageLink>. Approve good additions, reject noise.</li>
        <li>Once a week, run <PageLink to="/dreams">Dreams</PageLink> consolidation and skim the diff.</li>
      </ol>
    </Section>
  );
}

function DataFlow() {
  return (
    <Section id="data-flow" icon={Workflow} title="How data flows between pages">
      <P>One change in one place often shows up in three others. Here's the wiring:</P>
      <H4>Tasks</H4>
      <UL>
        <li>Created in <PageLink to="/kanban">Kanban</PageLink> → appear as nodes in <PageLink to="/">Flow</PageLink> for the assigned agent.</li>
        <li>Marked <em>active</em> → the agent's Flow graph re-layouts to focus on them.</li>
      </UL>
      <H4>Snapshots</H4>
      <UL>
        <li>Created from a Kanban card → become clickable nodes in Flow → indexed into Memory → searchable from any agent.</li>
      </UL>
      <H4>Agent aliases</H4>
      <UL>
        <li>Edited in <PageLink to="/agents">Agents</PageLink> → friendly name updates everywhere (Flow, Kanban, Conversations, Logs) instantly.</li>
        <li>Pushed to OpenClaw → backup is taken, audit entry appears in <PageLink to="/logs">Logs</PageLink>.</li>
      </UL>
      <H4>Memory writes</H4>
      <UL>
        <li>Proposed by an agent → land in <PageLink to="/memory">Memory → Write queue</PageLink> → on approval, written to MEMORY.md (visible in <PageLink to="/files">Files</PageLink>) and indexed into search.</li>
      </UL>
    </Section>
  );
}

function Glossary() {
  return (
    <Section id="glossary" icon={BookOpen} title="Glossary">
      <dl className="grid grid-cols-[10rem_1fr] gap-x-4 gap-y-2 text-xs">
        <dt className="font-semibold text-foreground">Chief of Staff</dt>
        <dd className="text-muted-foreground">The single top-level agent that delegates to subagents and holds cross-cutting context.</dd>
        <dt className="font-semibold text-foreground">Subagent</dt>
        <dd className="text-muted-foreground">A specialised agent (research, build, ops, …) reporting to the Chief.</dd>
        <dt className="font-semibold text-foreground">Raw OpenClaw ID</dt>
        <dd className="text-muted-foreground">The stable, machine-side identifier for an agent. Never edit.</dd>
        <dt className="font-semibold text-foreground">Friendly name</dt>
        <dd className="text-muted-foreground">Carapace alias overlaid on a raw ID for human readability.</dd>
        <dt className="font-semibold text-foreground">Snapshot</dt>
        <dd className="text-muted-foreground">Compressed work-state for a task: objective, decisions, next actions, blockers.</dd>
        <dt className="font-semibold text-foreground">Retrieval trace</dt>
        <dd className="text-muted-foreground">Audit record of a memory query: what was searched, selected, rejected.</dd>
        <dt className="font-semibold text-foreground">Write candidate</dt>
        <dd className="text-muted-foreground">A proposed memory write from an agent, queued for operator approval.</dd>
        <dt className="font-semibold text-foreground">Dreams</dt>
        <dd className="text-muted-foreground">OpenClaw's memory consolidation pass — promotes important bits, removes noise.</dd>
      </dl>
    </Section>
  );
}