import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { PageHeader } from "@/components/shell/PageHeader";
import { MEMORY_ENTRIES } from "@/lib/mock-data";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

const TABS = ["all", "MEMORY.md", "DREAMS.md", "daily", "snapshot"] as const;

export const Route = createFileRoute("/memory")({
  head: () => ({
    meta: [
      { title: "Memory — Carapace" },
      { name: "description", content: "Carapace memory command center — full-text search across MEMORY.md, DREAMS.md, daily notes, and snapshots." },
      { property: "og:title", content: "Memory — Carapace" },
      { property: "og:description", content: "Controlled memory for OpenClaw agents." },
    ],
  }),
  component: MemoryPage,
});

function MemoryPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("all");
  const [q, setQ] = useState("");
  const filtered = MEMORY_ENTRIES.filter((e) =>
    (tab === "all" || e.source === tab) &&
    (q === "" || (e.title + e.excerpt).toLowerCase().includes(q.toLowerCase())),
  );
  return (
    <AppShell title="Memory" subtitle="Markdown · FTS5 (Postgres FTS in preview) · snapshots">
      <PageHeader
        eyebrow="Module"
        title="Memory command center"
        description="Search consolidated memory across all sources. On the VPS this runs on SQLite FTS5; in preview it uses Postgres full-text search."
      />
      <div className="p-6 space-y-4">
        <div className="flex items-center gap-2 surface border border-border rounded-md px-3 py-2">
          <Search className="w-4 h-4 text-muted-foreground" />
          <input
            value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Search memory…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <span className="text-[10px] text-mono text-muted-foreground">{filtered.length} results</span>
        </div>
        <div className="flex gap-1.5">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "text-[11px] px-2.5 py-1 rounded-md text-mono",
                tab === t ? "bg-yellow/20 text-yellow" : "surface border border-border text-muted-foreground hover:text-foreground",
              )}
            >{t}</button>
          ))}
        </div>

        <ul className="space-y-2">
          {filtered.map((e) => (
            <li key={e.id} className="panel border border-border rounded-lg p-4 hover:border-yellow/40 transition-colors">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[10px] uppercase text-mono text-muted-foreground tracking-wider">{e.source}</div>
                  <div className="text-sm font-semibold mt-0.5">{e.title}</div>
                  <p className="text-xs text-foreground/80 mt-1.5 leading-relaxed">{e.excerpt}</p>
                </div>
                <div className="text-[10px] text-mono text-muted-foreground shrink-0">{format(new Date(e.promotedAt), "MMM d")}</div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </AppShell>
  );
}
