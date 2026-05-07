import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/shell/AppShell";
import { PageHeader } from "@/components/shell/PageHeader";
import { OnboardingHint } from "@/components/shell/OnboardingHint";
import { StatusPill } from "@/components/shell/StatusPill";
import { EmptyState } from "@/components/shell/EmptyState";
import { useGatewayStore } from "@/lib/gateway-store";
import { useOpenClawStatus } from "@/lib/openclaw-status";
import { ocListGwModels, ocGetUsageCost, ocGetUsageStatus, ocGetChannelsStatus } from "@/lib/openclaw-client";
import { PROVIDERS } from "@/lib/mock-data";
import { Plug, Zap, TrendingUp, DollarSign } from "lucide-react";
import type { GwModel } from "@/server/gateway/protocol-types";

export const Route = createFileRoute("/providers")({
  head: () => ({
    meta: [
      { title: "Providers — Carapace" },
      { name: "description", content: "LLM providers, models, usage costs, and channel status." },
      { property: "og:title", content: "Providers — Carapace" },
      { property: "og:description", content: "LLM provider configuration and usage tracking." },
    ],
  }),
  component: ProvidersPage,
});

function ProvidersPage() {
  const status = useOpenClawStatus();
  const isGateway = status.mode === "gateway";
  const isMock = status.mode === "mock";

  // Live usage from SSE store
  const liveUsageCost = useGatewayStore((s) => s.usageCost);
  const liveModels = useGatewayStore((s) => s.models);

  const { data: models = liveModels } = useQuery({
    queryKey: ["gw-models"],
    queryFn: () => ocListGwModels(),
    enabled: isGateway,
    staleTime: 60_000,
  });

  const { data: usageCost = liveUsageCost } = useQuery({
    queryKey: ["usage-cost"],
    queryFn: () => ocGetUsageCost({ period: "30d" }),
    enabled: isGateway,
    refetchInterval: 60_000,
  });

  const { data: usageStatus } = useQuery({
    queryKey: ["usage-status"],
    queryFn: () => ocGetUsageStatus(),
    enabled: isGateway,
    refetchInterval: 30_000,
  });

  const { data: channelsStatus = [] } = useQuery({
    queryKey: ["channels-status"],
    queryFn: () => ocGetChannelsStatus(),
    enabled: isGateway,
    refetchInterval: 30_000,
  });

  // Group models by provider
  const providerMap = new Map<string, GwModel[]>();
  for (const m of models) {
    const list = providerMap.get(m.provider) ?? [];
    list.push(m);
    providerMap.set(m.provider, list);
  }

  const mockSorted = [...PROVIDERS].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));

  return (
    <AppShell title="Providers" subtitle="Models · usage · channels">
      <PageHeader
        eyebrow="Module"
        title="LLM providers"
        description={
          isGateway
            ? "Live model inventory, usage costs, and channel status from OpenClaw gateway."
            : "LLM providers and model configuration."
        }
        hint={
          <OnboardingHint id="providers.intro" title="Primary + fallback chain" docsHref="/docs">
            <p>Set one primary provider and an ordered fallback chain. If the primary fails, OpenClaw walks the chain automatically.</p>
          </OnboardingHint>
        }
      />

      <div className="p-6 space-y-6">

        {/* Usage summary */}
        {isGateway && (usageCost || usageStatus) && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <UsageTile
              icon={<DollarSign className="w-3.5 h-3.5" />}
              label="Total cost"
              value={usageCost ? `$${usageCost.totalCost.toFixed(4)}` : "—"}
              sub={usageCost?.period ?? "all time"}
            />
            <UsageTile
              icon={<TrendingUp className="w-3.5 h-3.5" />}
              label="Today"
              value={usageStatus ? `$${usageStatus.dailyCost.toFixed(4)}` : "—"}
              sub={usageStatus?.currency ?? "USD"}
            />
            <UsageTile
              icon={<TrendingUp className="w-3.5 h-3.5" />}
              label="This month"
              value={usageStatus ? `$${usageStatus.monthlyCost.toFixed(4)}` : "—"}
              sub="MTD"
            />
            <UsageTile
              icon={<Plug className="w-3.5 h-3.5" />}
              label="Providers"
              value={String(providerMap.size || 0)}
              sub="available"
            />
          </div>
        )}

        {/* Channels status (Telegram, etc.) */}
        {isGateway && channelsStatus.length > 0 && (
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Channels</h3>
            <div className="panel border border-border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-surface text-[10px] uppercase tracking-wider text-mono text-muted-foreground">
                  <tr>
                    <th className="text-left px-4 py-2.5">Channel</th>
                    <th className="text-left px-4 py-2.5">Type</th>
                    <th className="text-left px-4 py-2.5">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {channelsStatus.map((ch) => (
                    <tr key={ch.id} className="border-t border-border">
                      <td className="px-4 py-3 font-medium">{ch.id}</td>
                      <td className="px-4 py-3 text-mono text-xs text-muted-foreground">{ch.type}</td>
                      <td className="px-4 py-3">
                        <StatusPill status={ch.status === "ok" ? "ok" : ch.status === "disabled" ? "disabled" : "error"} />
                        {ch.error && <span className="ml-2 text-xs text-coral">{ch.error}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Models by provider (gateway mode) */}
        {isGateway && providerMap.size > 0 && (
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Available models</h3>
            <div className="space-y-4">
              {Array.from(providerMap.entries()).map(([provider, provModels]) => {
                const cost = usageCost?.breakdown?.[provider];
                return (
                  <div key={provider} className="panel border border-border rounded-lg overflow-hidden">
                    <div className="px-4 py-2.5 bg-surface border-b border-border flex items-center justify-between">
                      <span className="font-medium text-sm">{provider}</span>
                      {cost && (
                        <span className="text-xs text-mono text-muted-foreground">
                          ${cost.cost.toFixed(4)} · {((cost.inputTokens + cost.outputTokens) / 1000).toFixed(1)}k tokens
                        </span>
                      )}
                    </div>
                    <table className="w-full text-xs">
                      <thead className="text-[10px] uppercase tracking-wider text-mono text-muted-foreground border-b border-border">
                        <tr>
                          <th className="text-left px-4 py-2">Model</th>
                          <th className="text-left px-4 py-2">Context</th>
                          <th className="text-right px-4 py-2">$/1k in</th>
                          <th className="text-right px-4 py-2">$/1k out</th>
                        </tr>
                      </thead>
                      <tbody>
                        {provModels.map((m) => (
                          <tr key={m.id} className="border-t border-border/50 hover:bg-surface/50">
                            <td className="px-4 py-2 font-mono">{m.id}</td>
                            <td className="px-4 py-2 text-muted-foreground">
                              {m.contextWindow ? `${(m.contextWindow / 1000).toFixed(0)}k` : "—"}
                            </td>
                            <td className="px-4 py-2 text-right text-muted-foreground">
                              {m.inputPricePer1k != null ? `$${m.inputPricePer1k}` : "—"}
                            </td>
                            <td className="px-4 py-2 text-right text-muted-foreground">
                              {m.outputPricePer1k != null ? `$${m.outputPricePer1k}` : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Usage cost breakdown */}
        {isGateway && usageCost && Object.keys(usageCost.breakdown).length > 0 && (
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Cost breakdown</h3>
            <div className="panel border border-border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-surface text-[10px] uppercase tracking-wider text-mono text-muted-foreground">
                  <tr>
                    <th className="text-left px-4 py-2.5">Model / Provider</th>
                    <th className="text-right px-4 py-2.5">Input tokens</th>
                    <th className="text-right px-4 py-2.5">Output tokens</th>
                    <th className="text-right px-4 py-2.5">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(usageCost.breakdown).map(([key, val]) => (
                    <tr key={key} className="border-t border-border hover:bg-surface/50">
                      <td className="px-4 py-2.5 font-mono text-xs">{key}</td>
                      <td className="px-4 py-2.5 text-right text-mono text-xs text-muted-foreground">{val.inputTokens.toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-right text-mono text-xs text-muted-foreground">{val.outputTokens.toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-right text-mono text-xs text-yellow">${val.cost.toFixed(6)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Legacy mock providers table */}
        {(isMock || (!isGateway && providerMap.size === 0)) && (
          <section>
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
                  {mockSorted.map((p, i) => (
                    <tr key={p.id} className="border-t border-border hover:bg-surface/50">
                      <td className="px-4 py-3 text-mono text-muted-foreground">{i + 1}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{p.name}</span>
                          {p.isPrimary && <span className="text-[9px] uppercase text-mono bg-yellow/20 text-yellow rounded px-1.5 py-0.5">Primary</span>}
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
          </section>
        )}

        {isGateway && providerMap.size === 0 && models.length === 0 && (
          <EmptyState icon={<Plug className="w-5 h-5 text-muted-foreground" />} message="No models returned from gateway yet." />
        )}
      </div>
    </AppShell>
  );
}

function UsageTile({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub: string }) {
  return (
    <div className="panel border border-border rounded-lg p-3">
      <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
        {icon}
        <span className="text-[10px] uppercase tracking-wider text-mono">{label}</span>
      </div>
      <div className="text-lg font-semibold text-yellow">{value}</div>
      <div className="text-[10px] text-muted-foreground">{sub}</div>
    </div>
  );
}
