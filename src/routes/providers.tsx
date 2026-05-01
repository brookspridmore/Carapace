import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/shell/AppShell";
import { PageHeader } from "@/components/shell/PageHeader";
import { OnboardingHint } from "@/components/shell/OnboardingHint";
import { StatusPill } from "@/components/shell/StatusPill";
import { PROVIDERS } from "@/lib/mock-data";
import { Plug, Zap } from "lucide-react";

export const Route = createFileRoute("/providers")({
  head: () => ({
    meta: [
      { title: "Providers — Carapace" },
      { name: "description", content: "Configure LLM providers (OpenAI, Anthropic, Gemini, Groq, Mistral, Ollama, Custom) with primary and fallback chain." },
      { property: "og:title", content: "Providers — Carapace" },
      { property: "og:description", content: "LLM provider configuration." },
    ],
  }),
  component: ProvidersPage,
});

function ProvidersPage() {
  const sorted = [...PROVIDERS].sort((a, b) => Number(b.primary) - Number(a.primary) || a.fallbackOrder - b.fallbackOrder);
  return (
    <AppShell title="Providers" subtitle="Primary · fallback chain · per-agent overrides">
      <PageHeader
        eyebrow="Module"
        title="LLM providers"
        description="Carapace routes every model call through a primary + fallback chain. Edit ordering, run a test connection, and write changes back to OpenClaw config."
        hint={
          <OnboardingHint id="providers.intro" title="Primary + fallback chain" docsHref="/docs">
            <p>Set one primary provider and an ordered fallback chain. If the primary fails, OpenClaw walks the chain automatically and the failure shows up in Logs.</p>
          </OnboardingHint>
        }
        actions={
          <button className="text-xs px-2.5 py-1 rounded-md bg-yellow text-primary-foreground flex items-center gap-1.5 hover:opacity-90">
            <Plug className="w-3.5 h-3.5" /> Add provider
          </button>
        }
      />
      <div className="p-6">
        <div className="panel border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface text-[10px] uppercase tracking-wider text-mono text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-2.5">#</th>
                <th className="text-left px-4 py-2.5">Provider</th>
                <th className="text-left px-4 py-2.5">Models</th>
                <th className="text-left px-4 py-2.5">Status</th>
                <th className="text-right px-4 py-2.5">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((p, i) => (
                <tr key={p.id} className="border-t border-border hover:bg-surface/50">
                  <td className="px-4 py-3 text-mono text-muted-foreground">{i + 1}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{p.name}</span>
                      {p.primary && <span className="text-[9px] uppercase text-mono bg-yellow/20 text-yellow rounded px-1.5 py-0.5">Primary</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-mono text-xs text-muted-foreground">
                    {p.models.length ? p.models.join(", ") : "—"}
                  </td>
                  <td className="px-4 py-3"><StatusPill status={p.status} /></td>
                  <td className="px-4 py-3 text-right">
                    <button className="text-[11px] surface border border-border rounded-md px-2 py-1 hover:border-yellow/60 inline-flex items-center gap-1">
                      <Zap className="w-3 h-3" /> Test
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
