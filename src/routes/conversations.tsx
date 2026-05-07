import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/shell/AppShell";
import { PageHeader } from "@/components/shell/PageHeader";
import { OnboardingHint } from "@/components/shell/OnboardingHint";
import { EmptyState } from "@/components/shell/EmptyState";
import { CONVERSATIONS, AGENTS } from "@/lib/mock-data";
import { useGatewayStore } from "@/lib/gateway-store";
import { useAgentLabelMap } from "@/lib/agent-registry";
import { useOpenClawStatus } from "@/lib/openclaw-status";
import {
  ocListGwSessions, ocGetChatHistory,
  ocSendChat, ocSteerSession, ocAbortSession,
  ocDeleteSession, ocCompactSession, ocResetSession,
} from "@/lib/openclaw-client";
import type { GwSession, GwMessage } from "@/server/gateway/protocol-types";
import {
  Send, Terminal, Globe, MonitorSmartphone, MessagesSquare,
  Zap, Trash2, Archive, RotateCcw, StopCircle, ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { toast } from "sonner";

const CHANNEL_ICON = {
  telegram: Send, ui: MonitorSmartphone, terminal: Terminal, api: Globe,
} as const;

export const Route = createFileRoute("/conversations")({
  head: () => ({
    meta: [
      { title: "Conversations — Carapace" },
      { name: "description", content: "Unified inbox for all OpenClaw sessions. Send, steer, abort." },
      { property: "og:title", content: "Conversations — Carapace" },
      { property: "og:description", content: "Unified agent conversation timeline." },
    ],
  }),
  component: ConversationsPage,
});

function ConversationsPage() {
  const status = useOpenClawStatus();
  const isGateway = status.mode === "gateway";
  const isMock = status.mode === "mock";
  const qc = useQueryClient();
  const labelMap = useAgentLabelMap();
  const nameOf = (id?: string) => (id ? labelMap[id] ?? AGENTS.find((a) => a.id === id)?.name ?? id : "—");

  // Live sessions from SSE store
  const liveSessions = useGatewayStore((s) => s.sessions);
  const liveSessionMessages = useGatewayStore((s) => s.sessionMessages);

  const { data: polledSessions = liveSessions, isLoading } = useQuery({
    queryKey: ["gw-sessions"],
    queryFn: () => isGateway ? ocListGwSessions() : Promise.resolve<GwSession[]>([]),
    enabled: isGateway,
    refetchInterval: 15_000,
    staleTime: 5_000,
  });

  const sessions: GwSession[] = isGateway
    ? (liveSessions.length > 0 ? liveSessions : polledSessions)
    : [];

  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [replyText, setReplyText] = useState("");
  const [steerMode, setSteerMode] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-select first session
  useEffect(() => {
    if (!activeKey && sessions.length > 0) setActiveKey(sessions[0].key);
  }, [sessions.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeSession = sessions.find((s) => s.key === activeKey) ?? null;

  // Fetch chat history for active session
  const { data: chatHistory } = useQuery({
    queryKey: ["chat-history", activeKey],
    queryFn: () => activeKey ? ocGetChatHistory({ key: activeKey, limit: 60 }) : null,
    enabled: isGateway && !!activeKey,
    staleTime: 5_000,
  });

  // Merge polled history with live SSE messages
  const liveMessages = activeKey ? (liveSessionMessages[activeKey] ?? []) : [];
  const polledMessages = chatHistory?.messages ?? [];
  const allMessages: GwMessage[] = mergeMessages(polledMessages, liveMessages);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [allMessages.length]);

  const sendMut = useMutation({
    mutationFn: ({ key, message, steer }: { key: string; message: string; steer: boolean }) =>
      steer ? ocSteerSession({ key, message }) : ocSendChat({ key, message }),
    onSuccess: () => {
      setReplyText("");
      void qc.invalidateQueries({ queryKey: ["chat-history", activeKey] });
    },
    onError: (e) => toast.error(String(e)),
  });

  const abortMut = useMutation({
    mutationFn: (key: string) => ocAbortSession({ key }),
    onSuccess: () => toast.success("Session aborted"),
    onError: (e) => toast.error(String(e)),
  });

  const deleteMut = useMutation({
    mutationFn: (key: string) => ocDeleteSession({ key }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["gw-sessions"] });
      setActiveKey(null);
      toast.success("Session deleted");
    },
    onError: (e) => toast.error(String(e)),
  });

  const compactMut = useMutation({
    mutationFn: (key: string) => ocCompactSession({ key }),
    onSuccess: () => toast.success("Session compacted"),
    onError: (e) => toast.error(String(e)),
  });

  const filteredSessions = filter === "all" ? sessions : sessions.filter((s) => s.channel === filter);

  function send() {
    if (!activeKey || !replyText.trim()) return;
    sendMut.mutate({ key: activeKey, message: replyText.trim(), steer: steerMode });
  }

  // Mock fallback
  if (isMock) {
    return (
      <AppShell title="Conversations" subtitle="Unified inbox · merged across channels">
        <PageHeader eyebrow="Module" title="Unified conversations" description="Conversations from Telegram, UI, terminals, and API merged into coherent timelines per agent." hint={<OnboardingHint id="conversations.intro" title="One thread per agent" docsHref="/docs"><p>Talking to your Chief on Telegram and in the UI? Carapace merges both into one timeline.</p></OnboardingHint>} />
        <div className="grid grid-cols-[320px_1fr] h-[calc(100vh-3.5rem-104px)]">
          <MockSidebar sessions={CONVERSATIONS} nameOf={nameOf} />
          <EmptyState icon={<MessagesSquare className="w-5 h-5 text-muted-foreground" />} message="Mock mode — connect to gateway for live sessions." />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Conversations" subtitle="Live sessions · send / steer / abort">
      <PageHeader
        eyebrow="Module"
        title="Sessions"
        description="Live OpenClaw sessions. Send messages, steer active runs, abort stuck agents, compact history."
        hint={
          <OnboardingHint id="conversations.intro" title="Full session control" docsHref="/docs">
            <p>Send injects a new user message. Steer interrupts the current run and redirects it. Abort stops the run immediately. Compact frees context window space.</p>
          </OnboardingHint>
        }
      />

      {isLoading && sessions.length === 0 ? (
        <div className="p-6 text-xs text-muted-foreground">Loading sessions…</div>
      ) : sessions.length === 0 ? (
        <EmptyState icon={<MessagesSquare className="w-5 h-5 text-muted-foreground" />} message="No sessions found. Start an agent run to create one." />
      ) : (
        <div className="grid grid-cols-[320px_1fr] h-[calc(100vh-3.5rem-104px)]">
          {/* Sidebar */}
          <aside className="panel border-r border-border overflow-y-auto">
            <div className="p-2 flex gap-1 border-b border-border flex-wrap">
              {["all", "telegram", "ui", "terminal", "api"].map((c) => (
                <button
                  key={c}
                  onClick={() => setFilter(c)}
                  className={cn(
                    "text-[11px] px-2 py-1 rounded-md text-mono uppercase",
                    filter === c ? "bg-yellow/20 text-yellow" : "text-muted-foreground hover:bg-surface",
                  )}
                >{c}</button>
              ))}
            </div>
            <ul>
              {filteredSessions.map((s) => (
                <li key={s.key}>
                  <button
                    onClick={() => setActiveKey(s.key)}
                    className={cn(
                      "w-full text-left px-3 py-3 border-b border-border hover:bg-surface",
                      activeKey === s.key && "bg-surface border-l-2 border-yellow",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-medium truncate">{s.title ?? s.key}</div>
                      <span className={cn(
                        "text-[9px] uppercase text-mono shrink-0",
                        s.status === "running" ? "text-sky" : s.status === "error" ? "text-coral" : "text-muted-foreground",
                      )}>{s.status}</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[10px] text-mono text-muted-foreground">
                      <span>{nameOf(s.agentId)}</span>
                      <span>{s.updatedAt ? format(new Date(s.updatedAt), "HH:mm") : "—"}</span>
                    </div>
                    {s.preview && <div className="text-[10px] text-muted-foreground truncate mt-0.5">{s.preview}</div>}
                  </button>
                </li>
              ))}
            </ul>
          </aside>

          {/* Thread view */}
          {activeSession ? (
            <section className="flex flex-col min-h-0">
              {/* Session toolbar */}
              <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold">{activeSession.title ?? activeSession.key}</div>
                  <div className="text-[11px] text-muted-foreground text-mono">
                    {nameOf(activeSession.agentId)} · {activeSession.key}
                  </div>
                </div>
                <div className="flex gap-1.5">
                  {activeSession.status === "running" && (
                    <button onClick={() => abortMut.mutate(activeKey!)} className="text-xs px-2 py-1 rounded surface border border-coral/40 text-coral hover:bg-coral/10 flex items-center gap-1">
                      <StopCircle className="w-3 h-3" /> Abort
                    </button>
                  )}
                  <button onClick={() => compactMut.mutate(activeKey!)} className="text-xs px-2 py-1 rounded surface border border-border hover:border-yellow/60 flex items-center gap-1">
                    <Archive className="w-3 h-3" /> Compact
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Delete session ${activeKey}?`)) deleteMut.mutate(activeKey!);
                    }}
                    className="text-xs px-2 py-1 rounded surface border border-border hover:border-coral/60 text-muted-foreground hover:text-coral flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {/* Messages */}
              <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-2.5">
                {allMessages.length === 0 ? (
                  <div className="text-xs text-muted-foreground">No messages yet.</div>
                ) : allMessages.map((m, i) => (
                  <MessageBubble key={m.id ?? i} msg={m} />
                ))}
              </div>

              {/* Reply bar */}
              <div className="p-3 border-t border-border space-y-2">
                <div className="flex gap-1.5 items-center">
                  <button
                    onClick={() => setSteerMode(false)}
                    className={cn("text-[10px] px-2 py-0.5 rounded text-mono uppercase", !steerMode ? "bg-yellow/20 text-yellow" : "text-muted-foreground hover:bg-surface")}
                  >Send</button>
                  <button
                    onClick={() => setSteerMode(true)}
                    className={cn("text-[10px] px-2 py-0.5 rounded text-mono uppercase flex items-center gap-1", steerMode ? "bg-sky/20 text-sky" : "text-muted-foreground hover:bg-surface")}
                  >
                    <Zap className="w-2.5 h-2.5" /> Steer
                  </button>
                  <span className="text-[10px] text-muted-foreground ml-1">
                    {steerMode ? "Interrupt and redirect current run" : "Inject a new user message"}
                  </span>
                </div>
                <div className="flex gap-2">
                  <input
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                    placeholder={steerMode ? "Steer the agent…" : "Send a message…"}
                    className="flex-1 surface border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-yellow/60"
                  />
                  <button
                    onClick={send}
                    disabled={sendMut.isPending || !replyText.trim()}
                    className={cn(
                      "px-3 py-2 rounded-md text-sm font-medium flex items-center gap-1.5 disabled:opacity-50",
                      steerMode ? "bg-sky text-black" : "bg-yellow text-black",
                    )}
                  >
                    <Send className="w-3.5 h-3.5" />
                    {steerMode ? "Steer" : "Send"}
                  </button>
                </div>
              </div>
            </section>
          ) : (
            <div className="flex items-center justify-center text-xs text-muted-foreground">
              Select a session
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}

// ── Message bubble ────────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: GwMessage }) {
  const isUser = msg.role === "user";
  const isTool = msg.role === "tool";
  return (
    <div className={cn("rounded-md border px-3 py-2.5", isUser ? "border-yellow/30 bg-yellow/5" : isTool ? "border-sky/20 bg-sky/5" : "border-border surface")}>
      <div className="flex items-center justify-between text-[10px] text-mono text-muted-foreground mb-1">
        <span className={cn(isUser ? "text-yellow" : isTool ? "text-sky" : "text-foreground/70")}>
          {msg.role}
          {msg.toolName && ` · ${msg.toolName}`}
        </span>
        <div className="flex items-center gap-2">
          {msg.model && <span>{msg.model}</span>}
          {msg.cost != null && <span>${msg.cost.toFixed(6)}</span>}
          {(msg.inputTokens || msg.outputTokens) && (
            <span>{(msg.inputTokens ?? 0)}↑{(msg.outputTokens ?? 0)}↓</span>
          )}
          <span>{msg.ts ? format(new Date(msg.ts), "HH:mm:ss") : ""}</span>
        </div>
      </div>
      <div className="text-sm whitespace-pre-wrap break-words">{msg.content}</div>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function mergeMessages(polled: GwMessage[], live: GwMessage[]): GwMessage[] {
  const seen = new Set<string>();
  const all: GwMessage[] = [];
  for (const m of [...polled, ...live]) {
    const key = m.id ?? `${m.ts}-${m.role}-${m.content.slice(0, 32)}`;
    if (!seen.has(key)) { seen.add(key); all.push(m); }
  }
  return all.sort((a, b) => (a.ts ?? "").localeCompare(b.ts ?? ""));
}

function MockSidebar({ sessions, nameOf }: { sessions: unknown[]; nameOf: (id?: string) => string }) {
  return (
    <aside className="panel border-r border-border overflow-y-auto">
      <ul>
        {(sessions as Array<{ id: string; title: string; agentId?: string; channels?: string[] }>).map((s) => (
          <li key={s.id} className="px-3 py-3 border-b border-border">
            <div className="text-sm font-medium truncate">{s.title}</div>
            <div className="text-[10px] text-mono text-muted-foreground">{nameOf(s.agentId)}</div>
          </li>
        ))}
      </ul>
    </aside>
  );
}
