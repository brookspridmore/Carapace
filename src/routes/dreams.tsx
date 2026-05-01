import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { PageHeader } from "@/components/shell/PageHeader";
import { OnboardingHint } from "@/components/shell/OnboardingHint";
import { DREAM_RUN } from "@/lib/mock-data";
import { Sparkles, Check, X, Play } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/dreams")({
  head: () => ({
    meta: [
      { title: "Dreams — Carapace" },
      { name: "description", content: "Memory consolidation engine — replay, cluster, score, promote, prune. Approve or reject memory changes before they apply." },
      { property: "og:title", content: "Dreams — Carapace" },
      { property: "og:description", content: "Carapace dreaming and memory consolidation." },
    ],
  }),
  component: DreamsPage,
});

function DreamsPage() {
  const [enabled, setEnabled] = useState(true);
  return (
    <AppShell title="Dreams" subtitle="Memory consolidation · controlled & observable">
      <PageHeader
        eyebrow="Module"
        title="Dreaming engine"
        description="Carapace observes how OpenClaw consolidates memory: each phase is logged, and every promotion or removal can be approved or rejected before it lands."
        hint={
          <OnboardingHint id="dreams.intro" title="Memory consolidation, observable" docsHref="/docs">
            <p>Dreams promotes important short-term memory into MEMORY.md and removes noise. Run it weekly and skim the diff — promotions feed straight into the Memory module.</p>
          </OnboardingHint>
        }
        actions={
          <>
            <button
              onClick={() => setEnabled((e) => !e)}
              className={cn(
                "text-xs px-2.5 py-1 rounded-md border flex items-center gap-1.5",
                enabled ? "bg-yellow/15 border-yellow/40 text-yellow" : "surface border-border text-muted-foreground",
              )}
            >
              <Sparkles className="w-3.5 h-3.5" /> {enabled ? "Enabled" : "Disabled"}
            </button>
            <button className="text-xs px-2.5 py-1 rounded-md bg-yellow text-primary-foreground flex items-center gap-1.5 hover:opacity-90">
              <Play className="w-3.5 h-3.5" /> Trigger run
            </button>
          </>
        }
      />
      <div className="p-6 grid gap-6 lg:grid-cols-2">
        <section className="panel border border-border rounded-lg p-4">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground text-mono mb-3">Run phases</div>
          <ol className="space-y-2">
            {DREAM_RUN.phases.map((p, i) => (
              <li key={p.id} className="flex items-start gap-3 surface border border-border rounded-md px-3 py-2.5">
                <div className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0",
                  p.status === "complete" ? "bg-sky/20 text-sky" :
                  p.status === "running" ? "bg-yellow/20 text-yellow" :
                  "surface border border-border text-muted-foreground",
                )}>{i + 1}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">{p.name}</div>
                    <span className="text-[10px] text-mono text-muted-foreground uppercase">{p.status}</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground">{p.description}</div>
                  {p.durationMs && <div className="text-[10px] text-mono text-muted-foreground mt-1">{p.durationMs}ms</div>}
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="panel border border-border rounded-lg p-4">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground text-mono mb-3">Pending memory changes</div>
          <ul className="space-y-2">
            {DREAM_RUN.pendingChanges.map((c) => (
              <li key={c.id} className="surface border border-border rounded-md p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "text-[10px] text-mono uppercase px-1.5 py-0.5 rounded",
                        c.kind === "promote" ? "bg-sky/15 text-sky" : "bg-coral/15 text-coral",
                      )}>{c.kind}</span>
                      <span className="text-mono text-xs truncate">{c.target}</span>
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-1">{c.reason}</div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button className="p-1.5 rounded-md surface border border-border hover:border-sky/60"><Check className="w-3.5 h-3.5 text-sky" /></button>
                    <button className="p-1.5 rounded-md surface border border-border hover:border-coral/60"><X className="w-3.5 h-3.5 text-coral" /></button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="lg:col-span-2 panel border border-border rounded-lg p-4">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground text-mono mb-3">DREAMS.md preview</div>
          <pre className="surface border border-border rounded-md p-3 text-mono text-xs leading-relaxed whitespace-pre-wrap">
{`# Dreams\n\n## ${new Date().toISOString().slice(0, 10)} — run-0042\n- replay: 142 events from last 24h\n- cluster: 8 groups identified\n- promote: launch-priors, brand-voice\n- prune: legacy-crm-import (failed task, 12d old)`}
          </pre>
        </section>
      </div>
    </AppShell>
  );
}
