import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/shell/AppShell";
import { PageHeader } from "@/components/shell/PageHeader";
import { OnboardingHint } from "@/components/shell/OnboardingHint";
import { Copy, RefreshCw, FolderSearch, FileText, Database, ScrollText, Settings as SettingsIcon, Folder, AlertCircle, CheckCircle2, Save, RotateCcw, ShieldCheck, Power } from "lucide-react";
import { useAgentRegistry } from "@/lib/agent-registry";
import { useOpenClawStatus, refreshOpenClawStatus } from "@/lib/openclaw-status";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ocFilesystemDiagnostics, type FsDiagnosticsReport, type FsItem, type FsItemKind } from "@/lib/openclaw-client";
import { ocGetConfig, ocGetConfigSchema, ocValidateConfig, ocWriteConfig, ocBackupConfig, ocApplyConfig } from "@/lib/openclaw-client";
import { toast } from "sonner";

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
            <Field label="OPENCLAW_GATEWAY_TOKEN (optional)" defaultValue="" />
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
            Carapace binds to <span className="text-mono text-yellow">127.0.0.1:8080</span> on your VPS. Expose it to your tailnet with:
          </p>
          <CopyBlock value="tailscale serve --bg --https=8080 http://127.0.0.1:8080" />
        </Card>

        <GatewayConfigEditor />

        <Card title="Theme">
          <p className="text-sm text-muted-foreground">Dark operator theme. Light theme is intentionally disabled — Carapace is built for low-light cockpit use.</p>
        </Card>
      </div>
    </AppShell>
  );
}

// ── Gateway config editor ────────────────────────────────────────────────────

function GatewayConfigEditor() {
  const status = useOpenClawStatus();
  const isGateway = status.mode === "gateway";
  const [draft, setDraft] = useState<string>("");
  const [validation, setValidation] = useState<{ ok: boolean; errors: string[] } | null>(null);

  const { data: liveConfig, refetch: refetchConfig } = useQuery({
    queryKey: ["gateway-config"],
    queryFn: async () => {
      try {
        return await ocGetConfig();
      } catch (e) {
        console.error("[settings] failed to fetch gateway config:", e);
        return null;
      }
    },
    enabled: isGateway,
    staleTime: 30_000,
    retry: false,
  });

  // Populate draft when config loads for the first time
  useEffect(() => {
    if (liveConfig && !draft) {
      setDraft(JSON.stringify(liveConfig, null, 2));
    }
  }, [liveConfig]); // eslint-disable-line react-hooks/exhaustive-deps

  const backupMut = useMutation({
    mutationFn: () => ocBackupConfig(),
    onSuccess: (ref) => toast.success(`Config backed up to ${ref.path}`),
    onError: (e) => toast.error(String(e)),
  });

  const validateMut = useMutation({
    mutationFn: () => ocValidateConfig({ payload: draft }),
    onSuccess: (v) => {
      setValidation(v);
      if (v.ok) toast.success("Config valid");
      else toast.error(`Invalid: ${v.errors.join(", ")}`);
    },
    onError: (e) => toast.error(String(e)),
  });

  const writeMut = useMutation({
    mutationFn: () => ocWriteConfig({ payload: draft, operatorNote: "Carapace config editor" }),
    onSuccess: () => {
      toast.success("Config written and applied");
      void refetchConfig();
    },
    onError: (e) => toast.error(String(e)),
  });

  const restartMut = useMutation({
    mutationFn: () => ocApplyConfig(),
    onSuccess: (r) => toast.success(r.message ?? "Gateway restarted"),
    onError: (e) => toast.error(String(e)),
  });

  if (!isGateway) return null;

  return (
    <section className="panel border border-border rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <SettingsIcon className="w-4 h-4 text-yellow" /> Gateway config editor
        </h3>
        <div className="flex gap-1.5">
          <button
            onClick={() => backupMut.mutate()}
            disabled={backupMut.isPending}
            className="text-xs px-2.5 py-1 rounded-md surface border border-border hover:border-yellow/60 flex items-center gap-1"
          >
            <ShieldCheck className="w-3 h-3" /> Backup
          </button>
          <button
            onClick={() => {
              if (liveConfig) setDraft(JSON.stringify(liveConfig, null, 2));
              setValidation(null);
            }}
            className="text-xs px-2.5 py-1 rounded-md surface border border-border hover:border-yellow/60 flex items-center gap-1"
          >
            <RotateCcw className="w-3 h-3" /> Reset
          </button>
          <button
            onClick={() => restartMut.mutate()}
            disabled={restartMut.isPending}
            className="text-xs px-2.5 py-1 rounded-md bg-coral/15 border border-coral/40 text-coral flex items-center gap-1 hover:bg-coral/25"
          >
            <Power className="w-3 h-3" /> Restart gateway
          </button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Edit the live OpenClaw config. Carapace always creates a timestamped backup before writing.
        Use <span className="text-mono text-foreground">Validate</span> first, then <span className="text-mono text-foreground">Save & apply</span>.
      </p>

      <textarea
        value={draft}
        onChange={(e) => { setDraft(e.target.value); setValidation(null); }}
        rows={18}
        className="w-full font-mono text-xs surface border border-border rounded-md px-3 py-2 focus:outline-none focus:border-yellow/60 resize-none"
        spellCheck={false}
      />

      {validation && (
        <div className={cn(
          "text-xs rounded-md px-3 py-2 flex items-start gap-2",
          validation.ok ? "bg-sky/10 border border-sky/30 text-sky" : "bg-coral/10 border border-coral/30 text-coral",
        )}>
          {validation.ok
            ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            : <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />}
          <span>{validation.ok ? "Config is valid." : validation.errors.join(" · ")}</span>
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => validateMut.mutate()}
          disabled={validateMut.isPending || !draft}
          className="text-xs px-3 py-1.5 rounded-md surface border border-border hover:border-yellow/60 flex items-center gap-1.5 disabled:opacity-50"
        >
          <CheckCircle2 className="w-3.5 h-3.5" /> Validate
        </button>
        <button
          onClick={() => {
            if (!validation?.ok) {
              toast.error("Validate first before saving.");
              return;
            }
            writeMut.mutate();
          }}
          disabled={writeMut.isPending || !draft}
          className="text-xs px-3 py-1.5 rounded-md bg-yellow text-black flex items-center gap-1.5 hover:opacity-90 disabled:opacity-50"
        >
          <Save className="w-3.5 h-3.5" /> Save & apply
        </button>
      </div>
    </section>
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
        <DebugRow label="gateway token" value={s.gatewayTokenConfigured ? "configured" : "unset"} />
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

// ---------------------------------------------------------------------------
// Filesystem Diagnostics
// ---------------------------------------------------------------------------

function FilesystemDiagnosticsPanel() {
  const [report, setReport] = useState<FsDiagnosticsReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runScan = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await ocFilesystemDiagnostics();
      setReport(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { runScan(); }, []);

  return (
    <section className="panel border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[10px] uppercase tracking-wider text-mono text-muted-foreground flex items-center gap-2">
          <FolderSearch className="w-3.5 h-3.5" /> Filesystem Diagnostics
        </div>
        <button
          onClick={runScan}
          disabled={loading}
          className="flex items-center gap-1 text-[11px] text-mono surface border border-border rounded-md px-2 py-1 hover:border-yellow/60 disabled:opacity-50"
        >
          <RefreshCw className={cn("w-3 h-3", loading && "animate-spin")} />
          {loading ? "scanning…" : "Run Filesystem Scan"}
        </button>
      </div>

      {error && (
        <div className="surface border border-coral/40 rounded-md p-2 mb-3">
          <div className="text-[11px] text-coral text-mono">{error}</div>
        </div>
      )}

      {report && <FsReportView report={report} showRaw={showRaw} setShowRaw={setShowRaw} />}

      {!report && !loading && (
        <div className="text-[11px] text-muted-foreground">No scan yet.</div>
      )}

      <p className="text-[11px] text-muted-foreground mt-3">
        Read-only. This panel never writes to OpenClaw — it only inspects what Carapace can see at <span className="text-mono">OPENCLAW_ROOT_PATH</span>.
      </p>
    </section>
  );
}

function FsReportView({ report, showRaw, setShowRaw }: { report: FsDiagnosticsReport; showRaw: boolean; setShowRaw: (v: boolean) => void }) {
  const summaryTone =
    !report.exists ? "text-coral" :
    !report.readable ? "text-coral" :
    report.agents.length === 0 ? "text-yellow" :
    "text-sky";

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 text-[11px] text-mono">
        <DebugRow label="root path" value={report.rootPath ?? "—"} />
        <DebugRow label="env set" value={report.rootEnvSet ? "yes" : "no"} />
        <DebugRow label="exists" value={<span className={summaryTone}>{report.exists ? "yes" : "no"}</span>} />
        <DebugRow label="readable" value={report.readable ? "yes" : "no"}/>
        <DebugRow label="is directory" value={report.isDirectory ? "yes" : "no"} />
        <DebugRow label="scanned at" value={report.scannedAt} />
        <DebugRow label="duration" value={`${report.durationMs}ms`} />
        <DebugRow label="subdirs" value={report.subdirectories.join(", ") || "—"} />
      </div>

      {/* Honest empty / error states */}
      {!report.rootPath && (
        <EmptyBanner kind="error" title="OPENCLAW_ROOT_PATH not set"
          body="Set the env var on the server (e.g. ~/.openclaw) and restart Carapace." />
      )}
      {report.rootPath && !report.exists && (
        <EmptyBanner kind="error" title="Root path not found"
          body={`No directory at ${report.rootPath}. Check the path or try one of the suggestions below.`} />
      )}
      {report.exists && !report.readable && (
        <EmptyBanner kind="error" title="Permission denied reading path"
          body={`Carapace cannot read ${report.rootPath}. Check filesystem permissions for the user running the Carapace server.`} />
      )}
      {report.exists && report.readable && report.agents.length === 0 && (
        <EmptyBanner kind="warn" title="Root path found but no agents detected"
          body={`Carapace found ${report.rootPath} but no agent directories under /agents.`} />
      )}
      {report.agents.length > 0 && report.memory.length === 0 && (
        <EmptyBanner kind="warn" title="Agents detected but no memory files found"
          body="No MEMORY.md or DREAMS.md files were found. Memory features will show empty state." />
      )}
      {report.errors.length > 0 && report.exists && report.readable && report.agents.length > 0 && report.memory.length > 0 && (
        <EmptyBanner kind="warn" title="Scan completed with notes" body={report.errors.join(" · ")} />
      )}
      {report.warnings && report.warnings.length > 0 && (
        <EmptyBanner kind="warn" title="Warnings" body={report.warnings.join(" · ")} />
      )}

      <ItemSection title="Agents" icon={<Folder className="w-3 h-3" />} items={report.agents} kind="agent" />
      <ItemSection title="Memory files" icon={<Database className="w-3 h-3" />} items={report.memory} kind="memory" />
      <ItemSection title="Sessions" icon={<FileText className="w-3 h-3" />} items={report.sessions} kind="session" />
      <ItemSection title="Logs" icon={<ScrollText className="w-3 h-3" />} items={report.logs} kind="log" />
      <ItemSection title="Config files" icon={<SettingsIcon className="w-3 h-3" />} items={report.configs} kind="config" />

      {report.agents.length === 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-mono text-muted-foreground mb-2">Path suggestions</div>
          <div className="space-y-1">
            {report.suggestions.map((s) => (
              <div key={s.path} className="flex items-center justify-between surface border border-border rounded-md px-2 py-1 text-[11px] text-mono">
                <span className="break-all">{s.path}</span>
                <span className={s.exists ? "text-sky" : "text-muted-foreground"}>
                  {s.exists ? <CheckCircle2 className="w-3 h-3 inline" /> : "not found"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <button
          onClick={() => setShowRaw(!showRaw)}
          className="text-[11px] text-mono text-muted-foreground hover:text-foreground"
        >
          {showRaw ? "▼" : "▶"} raw scan JSON
        </button>
        {showRaw && (
          <pre className="surface border border-border rounded-md p-2 text-[11px] text-mono whitespace-pre-wrap break-all max-h-64 overflow-auto mt-2">
            {report.raw}
          </pre>
        )}
      </div>
    </div>
  );
}

function ItemSection({ title, icon, items, kind }: { title: string; icon: React.ReactNode; items: FsItem[]; kind: FsItemKind }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-mono text-muted-foreground mb-1 flex items-center gap-1.5">
        {icon} {title} <span className="text-foreground/60">({items.length})</span>
      </div>
      {items.length === 0 ? (
        <div className="text-[11px] text-muted-foreground italic">none detected</div>
      ) : (
        <div className="space-y-1 max-h-48 overflow-auto">
          {items.map((it) => (
            <div key={it.path} className="surface border border-border rounded-md px-2 py-1 text-[11px] text-mono flex items-center gap-2">
              <span className="text-yellow uppercase text-[9px] w-12 shrink-0">{kind}</span>
              <span className="flex-1 break-all">{it.path}</span>
              <span className="text-muted-foreground shrink-0">{formatSize(it.size)}</span>
              <span className="text-muted-foreground shrink-0">{formatTs(it.modifiedAt)}</span>
              <span className={cn("shrink-0", it.readable ? "text-sky" : "text-coral")}>{it.readable ? "R" : "✕"}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyBanner({ kind, title, body }: { kind: "warn" | "error"; title: string; body: string }) {
  const tone = kind === "error" ? "border-coral/40 text-coral" : "border-yellow/40 text-yellow";
  return (
    <div className={cn("surface border rounded-md p-2 flex items-start gap-2", tone)}>
      <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
      <div>
        <div className="text-[11px] text-mono">{title}</div>
        <div className="text-[11px] text-mono text-foreground/70 mt-0.5">{body}</div>
      </div>
    </div>
  );
}

function formatSize(n: number | null): string {
  if (n === null) return "—";
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}K`;
  return `${(n / 1024 / 1024).toFixed(1)}M`;
}

function formatTs(ts: string | null): string {
  if (!ts) return "—";
  try {
    const d = new Date(ts);
    return d.toISOString().slice(0, 16).replace("T", " ");
  } catch { return ts; }
}
