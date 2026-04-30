import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { PageHeader } from "@/components/shell/PageHeader";
import { CONVERSATIONS, AGENTS, type ConversationThread } from "@/lib/mock-data";
import { Send, Terminal, Globe, MonitorSmartphone } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

const CHANNEL_ICON = { telegram: Send, ui: MonitorSmartphone, terminal: Terminal, api: Globe } as const;

export const Route = createFileRoute("/conversations")({
  head: () => ({
    meta: [
      { title: "Conversations — Carapace" },
      { name: "description", content: "Unified inbox for Telegram, UI, terminal, and API conversations across all agents." },
      { property: "og:title", content: "Conversations — Carapace" },
      { property: "og:description", content: "Unified agent conversation timeline." },
    ],
  }),
  component: ConversationsPage,
});

function ConversationsPage() {
  const [active, setActive] = useState<ConversationThread>(CONVERSATIONS[0]);
  const [filter, setFilter] = useState<string>("all");
  const filtered = filter === "all" ? CONVERSATIONS : CONVERSATIONS.filter((c) => c.channels.includes(filter as any));
  return (
    <AppShell title="Conversations" subtitle="Unified inbox · merged across channels">
      <PageHeader
        eyebrow="Module"
        title="Unified conversations"
        description="Conversations from Telegram, the Carapace UI, terminals, and the OpenClaw API are merged into coherent timelines per agent."
      />
      <div className="grid grid-cols-[320px_1fr] h-[calc(100vh-3.5rem-104px)]">
        <aside className="panel border-r border-border overflow-y-auto">
          <div className="p-2 flex gap-1 border-b border-border">
            {(["all", "telegram", "ui", "terminal", "api"] as const).map((c) => (
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
            {filtered.map((c) => {
              const agent = AGENTS.find((a) => a.id === c.agentId);
              const isActive = c.id === active.id;
              return (
                <li key={c.id}>
                  <button
                    onClick={() => setActive(c)}
                    className={cn("w-full text-left px-3 py-3 border-b border-border hover:bg-surface", isActive && "bg-surface border-l-2 border-yellow")}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-medium truncate">{c.title}</div>
                      {c.unread > 0 && <span className="text-[10px] bg-yellow text-primary-foreground rounded-full px-1.5">{c.unread}</span>}
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[10px] text-mono text-muted-foreground">
                      <span>{agent?.name}</span>
                      <div className="flex gap-1">
                        {c.channels.map((ch) => {
                          const Icon = CHANNEL_ICON[ch];
                          return <Icon key={ch} className="w-2.5 h-2.5" />;
                        })}
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>
        <section className="flex flex-col min-h-0">
          <div className="px-5 py-3 border-b border-border">
            <div className="text-sm font-semibold">{active.title}</div>
            <div className="text-[11px] text-muted-foreground text-mono">
              {AGENTS.find((a) => a.id === active.agentId)?.name} · {active.channels.join(" · ")}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-5 space-y-3">
            {active.messages.map((m) => {
              const Icon = CHANNEL_ICON[m.channel];
              return (
                <div key={m.id} className="surface rounded-md border border-border p-3">
                  <div className="flex items-center justify-between text-[10px] text-mono text-muted-foreground mb-1.5">
                    <span className="flex items-center gap-1.5"><Icon className="w-3 h-3" />{m.author}</span>
                    <span>{format(new Date(m.timestamp), "HH:mm")}</span>
                  </div>
                  <div className="text-sm">{m.body}</div>
                </div>
              );
            })}
          </div>
          <div className="p-3 border-t border-border">
            <input
              placeholder="Reply through Carapace…"
              className="w-full surface border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-yellow/60"
            />
          </div>
        </section>
      </div>
    </AppShell>
  );
}
