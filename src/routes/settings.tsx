import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/shell/AppShell";
import { PageHeader } from "@/components/shell/PageHeader";
import { OnboardingHint } from "@/components/shell/OnboardingHint";
import { Copy, RefreshCw, FolderSearch, FileText, Database, ScrollText, Settings as SettingsIcon, Folder, AlertCircle, CheckCircle2 } from "lucide-react";
import { useAgentRegistry } from "@/lib/agent-registry";
import { useOpenClawStatus, refreshOpenClawStatus } from "@/lib/openclaw-status";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import { ocFilesystemDiagnostics, type FsDiagnosticsReport, type FsItem, type FsItemKind } from "@/server/openclaw-diagnostics.functions";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Carapace" },
      { name: "description", content: "Carapace settings — OpenClaw base URL, Tailscale exposure, theme." },
      { property: "og:title", content: "Settings — Carapace" },
      { property: "og:description", content: "Carapace operator settings." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const configPath = useAgentRegistry((s) => s.openclawConfigPath);
  const agentsPath = useAgentRegistry((s) => s.openclawAgentsPath);
  const setConfigPath = useAgentRegistry((s) => s.setOpenClawConfigPath);
  const setAgentsPath = useAgentRegistry((s) => s.setOpenClawAgentsPath);
  return (
    <AppShell title="Settings" subtitle="Operator preferences · OpenClaw connection">
      <PageHeader
        eyebrow="System"
        title="Settings"
        description="Configure how Carapace talks to OpenClaw and how it's exposed on your network."
        hint={
          <OnboardingHint id="settings.intro" title="Localhost + Tailscale only" docsHref="/docs">
            <p>Carapace must bind to localhost. Expose it through Tailscale Serve — never the public internet.</p>
            <p>Set the OpenClaw base URL and config paths here so the agent registry can read and write the real config.</p>
          </OnboardingHint>
        }
      />
      <div className="p-6 space-y-6 max-w-2xl">
        <Card title="OpenClaw connection">
          <Field label="OPENCLAW_ROOT_PATH (primary)" defaultValue="~/.openclaw" />
          <div className="mt-3">
            <Field label="OPENCLAW_BASE_URL (legacy gateway, optional)" defaultValue="" />
          </div>
          <div className="mt-3">
            <Field label="OPENCLAW_API_KEY (optional)" defaultValue="" />
          </div>
          <div className="mt-3">
            <div className="text-[11px] text-mono text-muted-foreground mb-1">OPENCLAW_MODE</div>
            <div className="text-[11px] text-muted-foreground">
              Set on the server (env var). One of:
              <span className="text-mono text-foreground"> mock</span> ·
              <span className="text-mono text-foreground"> readonly</span> ·
              <span className="text-mono text-foreground"> live</span>.
              In <span className="text-mono">readonly</span> Carapace never falls back to mock data — empty states are shown when OpenClaw is unreachable.
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground mt-3">
            OpenClaw is a local runtime + filesystem + gateway protocol — not a REST service.
            Carapace reads agents, memory, sessions and logs directly from
            <span className="text-mono"> OPENCLAW_ROOT_PATH</span>. The legacy
            HTTP gateway is only used when no root path is configured.
          </p>
        </Card>

        <OpenClawDebugPanel />

        <FilesystemDiagnosticsPanel />

        <Card title="OpenClaw config bridge">
          <label className="block mb-3">
            <div className="text-[11px] text-mono text-muted-foreground mb-1">OPENCLAW_CONFIG_PATH</div>
            <input
              value={configPath}
              onChange={(e) => setConfigPath(e.target.value)}
              placeholder="/opt/openclaw/config.toml"
              className="w-full surface border border-border rounded-md px-3 py-2 text-mono text-sm focus:outline-none focus:border-yellow/60"
            />
          </label>
          <label className="block">
            <div className="text-[11px] text-mono text-muted-foreground mb-1">OPENCLAW_AGENTS_PATH</div>
            <input
              value={agentsPath}
              onChange={(e) => setAgentsPath(e.target.value)}
              placeholder="/opt/openclaw/agents.toml"
              className="w-full surface border border-border rounded-md px-3 py-2 text-mono text-sm focus:outline-none focus:border-yellow/60"
            />
          </label>
          <p className="text-[11px] text-muted-foreground mt-2">
            Carapace reads agent records from these files to populate the registry. If unset, the registry falls back to mock data. Writes happen only via the Agents page "Save to OpenClaw config" flow (with backup, validation, diff, and confirmation).
          </p>
        </Card>

        <Card title="Tailscale exposure">
          <p className="text-sm text-foreground/85 mb-3">
            Carapace binds to <span className="text-mono text-yellow">127.0.0.1:3080</span> on your VPS. Expose it to your tailnet with:
          </p>
          <CopyBlock value="tailscale serve --bg http://127.0.0.1:3080" />
        </Card>

        <Card title="Theme">
          <p className="text-sm text-muted-foreground">Dark operator theme. Light theme is intentionally disabled — Carapace is built for low-light cockpit use.</p>
        </Card>
      </div>
    </AppShell>
  );
}

function OpenClawDebugPanel() {
  const s = useOpenClawStatus(8000);
  const f = s.lastFetch;
  const tone =
    s.connection === "connected" ? "text-sky" :
    s.connection === "no-data" ? "text-muted-foreground" :
    s.connection === "mock" ? "text-yellow" :
    "text-coral";
  return (
    <section className="panel border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[10px] uppercase tracking-wider text-mono text-muted-foreground">OpenClaw Debug</div>
        <button
          onClick={() => refreshOpenClawStatus()}
          className="flex items-center gap-1 text-[11px] text-mono text-muted-foreground hover:text-foreground"
        >
          <RefreshCw className="w-3 h-3" /> refresh
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3 text-[11px] text-mono">
        <DebugRow label="mode" value={s.mode} />
        <DebugRow label="connection" value={<span className={tone}>{s.connection}</span>} />
        <DebugRow label="base url" value={s.baseUrl || "—"} />
        <DebugRow label="api key" value={s.apiKeyConfigured ? "configured" : "unset"} />
        <DebugRow label="last url" value={f.url ?? "—"} />
        <DebugRow label="last status" value={f.status === null ? "—" : String(f.status)} />
        <DebugRow label="last latency" value={f.latencyMs === null ? "—" : `${f.latencyMs}ms`} />
        <DebugRow label="last fetch" value={f.finishedAt ?? "—"} />
      </div>
      {(s.lastError || f.error) && (
        <div className="mt-3 surface border border-coral/40 rounded-md p-2">
          <div className="text-[10px] text-mono uppercase text-coral mb-1">last error</div>
          <div className="text-[11px] text-mono text-foreground/85 break-all">{s.lastError ?? f.error}</div>
        </div>
      )}
      {f.rawPreview && (
        <div className="mt-3">
          <div className="text-[10px] text-mono uppercase text-muted-foreground mb-1">raw response (first 512 chars)</div>
          <pre className={cn("surface border border-border rounded-md p-2 text-[11px] text-mono whitespace-pre-wrap break-all max-h-48 overflow-auto")}>
            {f.rawPreview}
          </pre>
        </div>
      )}
      <p className="text-[11px] text-muted-foreground mt-3">
        Readonly mode never writes, executes, or mutates OpenClaw. All write methods on the adapter throw.
      </p>
    </section>
  );
}

function DebugRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase text-muted-foreground">{label}</span>
      <span className="text-foreground break-all">{value}</span>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="panel border border-border rounded-lg p-4">
      <div className="text-[10px] uppercase tracking-wider text-mono text-muted-foreground mb-3">{title}</div>
      {children}
    </section>
  );
}

function Field({ label, defaultValue }: { label: string; defaultValue: string }) {
  return (
    <label className="block">
      <div className="text-[11px] text-mono text-muted-foreground mb-1">{label}</div>
      <input
        defaultValue={defaultValue}
        className="w-full surface border border-border rounded-md px-3 py-2 text-mono text-sm focus:outline-none focus:border-yellow/60"
      />
    </label>
  );
}

function CopyBlock({ value }: { value: string }) {
  return (
    <div className="flex items-center gap-2 surface border border-border rounded-md px-3 py-2">
      <code className="flex-1 text-mono text-xs">{value}</code>
      <button className="p-1 text-muted-foreground hover:text-foreground" aria-label="Copy"><Copy className="w-3.5 h-3.5" /></button>
    </div>
  );
}
