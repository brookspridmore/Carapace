import { useEffect, useMemo, useState } from "react";
import { X, Save, ChevronDown, ChevronRight, ShieldAlert, FileCheck2, Hash, Tag } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAgentRegistry, type AgentAlias, type AliasSource } from "@/lib/agent-registry";
import { ocBackupOpenClawConfig, ocValidateOpenClawConfig, ocWriteOpenClawConfig } from "@/server/openclaw.functions";
import { useServerFn } from "@tanstack/react-start";

const SOURCE_TONE: Record<AliasSource, string> = {
  mock:     "border-border text-muted-foreground",
  carapace: "border-yellow/60 text-yellow",
  openclaw: "border-sky/60 text-sky",
};
const SOURCE_LABEL: Record<AliasSource, string> = {
  mock:     "Mock",
  carapace: "Carapace registry",
  openclaw: "OpenClaw config",
};

export function AgentSourcePill({ source }: { source: AliasSource }) {
  return (
    <span className={cn("inline-flex items-center gap-1 text-[10px] text-mono uppercase tracking-wider px-1.5 py-0.5 rounded border", SOURCE_TONE[source])}>
      <span className={cn("w-1.5 h-1.5 rounded-full",
        source === "openclaw" ? "bg-sky" : source === "carapace" ? "bg-yellow" : "bg-muted-foreground")} />
      {SOURCE_LABEL[source]}
    </span>
  );
}

export function EditAgentDrawer({ rawId, onClose }: { rawId: string; onClose: () => void }) {
  const alias = useAgentRegistry((s) => s.aliases.find((a) => a.rawOpenClawId === rawId));
  const aliases = useAgentRegistry((s) => s.aliases);
  const updateAlias = useAgentRegistry((s) => s.updateAlias);
  const markPushed = useAgentRegistry((s) => s.markPushed);
  const pushAudit = useAgentRegistry((s) => s.pushAudit);

  const [draft, setDraft] = useState<AgentAlias | null>(alias ?? null);
  const [advanced, setAdvanced] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [pushOpen, setPushOpen] = useState(false);

  useEffect(() => { setDraft(alias ?? null); }, [alias?.rawOpenClawId]);

  if (!draft || !alias) return null;

  const dirty =
    draft.friendlyName !== alias.friendlyName ||
    draft.role !== alias.role ||
    draft.parentRawOpenClawId !== alias.parentRawOpenClawId ||
    draft.workspacePath !== alias.workspacePath ||
    draft.memoryPath !== alias.memoryPath ||
    draft.notes !== alias.notes ||
    draft.model !== alias.model ||
    draft.provider !== alias.provider ||
    JSON.stringify(draft.tags ?? []) !== JSON.stringify(alias.tags ?? []);

  function patch<K extends keyof AgentAlias>(key: K, value: AgentAlias[K]) {
    setDraft((d) => (d ? { ...d, [key]: value } : d));
  }

  function saveLocal() {
    if (!draft) return;
    updateAlias(draft.rawOpenClawId, {
      friendlyName: draft.friendlyName,
      role: draft.role,
      parentRawOpenClawId: draft.parentRawOpenClawId,
      workspacePath: draft.workspacePath,
      memoryPath: draft.memoryPath,
      notes: draft.notes,
      tags: draft.tags,
      model: draft.model,
      provider: draft.provider,
    });
    pushAudit({
      kind: "alias_edit",
      rawOpenClawId: draft.rawOpenClawId,
      summary: `Edited alias for ${draft.rawOpenClawId} → "${draft.friendlyName}"`,
    });
    setSavedAt(new Date().toISOString());
  }

  const parents = aliases.filter((a) => a.rawOpenClawId !== draft.rawOpenClawId);

  return (
    <div className="fixed inset-0 z-50 pointer-events-none">
      <div className="absolute inset-0 bg-black/40 pointer-events-auto" onClick={onClose} />
      <aside className="absolute top-0 right-0 h-full w-full sm:w-[520px] panel border-l border-border pointer-events-auto overflow-y-auto">
        <div className="px-5 py-4 border-b border-border flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground text-mono">Edit Agent</span>
              <AgentSourcePill source={draft.source} />
              {alias.dirty && (
                <span className="text-[9px] text-mono uppercase px-1 py-0.5 rounded border border-yellow/60 text-yellow">unsaved · pending push</span>
              )}
            </div>
            <h3 className="text-base font-semibold leading-tight truncate">{draft.friendlyName || "(unnamed)"}</h3>
            <div className="text-[10px] text-mono text-muted-foreground mt-0.5 flex items-center gap-1">
              <Hash className="w-3 h-3" /> {draft.rawOpenClawId}
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-surface text-muted-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          <Field label="Friendly name" hint="Shown across Carapace. Raw OpenClaw ID is preserved.">
            <input
              value={draft.friendlyName}
              onChange={(e) => patch("friendlyName", e.target.value)}
              className="w-full surface border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-yellow/60"
            />
          </Field>

          <Field label="Role / title">
            <input
              value={draft.role}
              onChange={(e) => patch("role", e.target.value)}
              className="w-full surface border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-yellow/60"
            />
          </Field>

          <Field label="Parent agent">
            <select
              value={draft.parentRawOpenClawId ?? ""}
              onChange={(e) => patch("parentRawOpenClawId", e.target.value || undefined)}
              className="w-full surface border border-border rounded-md px-2 py-2 text-sm"
            >
              <option value="">— None (top-level) —</option>
              {parents.map((p) => (
                <option key={p.rawOpenClawId} value={p.rawOpenClawId}>
                  {p.friendlyName} ({p.rawOpenClawId})
                </option>
              ))}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Provider">
              <input
                value={draft.provider ?? ""}
                onChange={(e) => patch("provider", e.target.value)}
                className="w-full surface border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-yellow/60"
              />
            </Field>
            <Field label="Model">
              <input
                value={draft.model ?? ""}
                onChange={(e) => patch("model", e.target.value)}
                className="w-full surface border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-yellow/60"
              />
            </Field>
          </div>

          <Field label="Workspace path">
            <input
              value={draft.workspacePath ?? ""}
              onChange={(e) => patch("workspacePath", e.target.value)}
              className="w-full surface border border-border rounded-md px-3 py-2 text-mono text-sm focus:outline-none focus:border-yellow/60"
            />
          </Field>

          <Field label="Memory path">
            <input
              value={draft.memoryPath ?? ""}
              onChange={(e) => patch("memoryPath", e.target.value)}
              className="w-full surface border border-border rounded-md px-3 py-2 text-mono text-sm focus:outline-none focus:border-yellow/60"
            />
          </Field>

          <Field label="Tags" hint="Comma separated">
            <input
              value={(draft.tags ?? []).join(", ")}
              onChange={(e) => patch("tags", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
              className="w-full surface border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-yellow/60"
              placeholder="research, internal, beta"
            />
            {draft.tags && draft.tags.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {draft.tags.map((t) => (
                  <span key={t} className="text-[10px] text-mono px-1.5 py-0.5 rounded border border-border surface flex items-center gap-1">
                    <Tag className="w-2.5 h-2.5" /> {t}
                  </span>
                ))}
              </div>
            )}
          </Field>

          <Field label="Notes">
            <textarea
              value={draft.notes ?? ""}
              onChange={(e) => patch("notes", e.target.value)}
              rows={3}
              className="w-full surface border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-yellow/60 resize-none"
              placeholder="Operator notes, reminders, gotchas…"
            />
          </Field>

          <button
            onClick={() => setAdvanced((a) => !a)}
            className="w-full flex items-center gap-1.5 text-[11px] text-mono uppercase tracking-wider text-muted-foreground hover:text-foreground"
          >
            {advanced ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            Advanced — raw OpenClaw details
          </button>
          {advanced && (
            <div className="surface border border-border rounded-md p-3 text-mono text-[11px] space-y-1">
              <Detail k="rawOpenClawId" v={draft.rawOpenClawId} />
              <Detail k="parentRawOpenClawId" v={draft.parentRawOpenClawId ?? "—"} />
              <Detail k="source" v={draft.source} />
              <Detail k="dirty" v={String(!!alias.dirty)} />
              <Detail k="updatedAt" v={draft.updatedAt ?? "—"} />
            </div>
          )}

          <div className="pt-2 border-t border-border flex items-center gap-2">
            <button
              onClick={saveLocal}
              disabled={!dirty}
              className={cn(
                "flex-1 px-3 py-2 rounded-md text-sm font-medium flex items-center justify-center gap-1.5",
                dirty ? "bg-yellow text-primary-foreground hover:opacity-90" : "surface border border-border text-muted-foreground cursor-not-allowed",
              )}
              title="Save to Carapace local registry. OpenClaw config is NOT touched."
            >
              <Save className="w-3.5 h-3.5" /> Save in Carapace
            </button>
            <button
              onClick={() => setPushOpen(true)}
              className="px-3 py-2 rounded-md surface border border-coral/40 text-coral text-sm font-medium flex items-center gap-1.5 hover:bg-coral/10"
              title="Write friendly-name aliases back to OpenClaw config (with backup + diff + confirmation)"
            >
              <ShieldAlert className="w-3.5 h-3.5" /> Save to OpenClaw config…
            </button>
          </div>
          {savedAt && (
            <div className="text-[10px] text-mono text-muted-foreground flex items-center gap-1">
              <FileCheck2 className="w-3 h-3 text-sky" />
              saved locally · {new Date(savedAt).toLocaleTimeString()}
            </div>
          )}
        </div>
      </aside>

      {pushOpen && (
        <SaveToOpenClawDialog
          aliases={aliases.filter((a) => a.dirty || a.rawOpenClawId === draft.rawOpenClawId)}
          highlightRawId={draft.rawOpenClawId}
          onClose={() => setPushOpen(false)}
          onConfirmed={(rawIds, audit) => {
            markPushed(rawIds);
            pushAudit({ kind: "openclaw_write", summary: audit.summary, details: `audit:${audit.id}` });
            setPushOpen(false);
          }}
        />
      )}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground text-mono mb-1.5">{label}</div>
      {children}
      {hint && <div className="mt-1 text-[10px] text-muted-foreground">{hint}</div>}
    </label>
  );
}

function Detail({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-3">
      <span className="text-muted-foreground w-44 shrink-0">{k}</span>
      <span className="text-foreground truncate">{v}</span>
    </div>
  );
}

function SaveToOpenClawDialog({
  aliases, highlightRawId, onClose, onConfirmed,
}: {
  aliases: AgentAlias[];
  highlightRawId: string;
  onClose: () => void;
  onConfirmed: (rawIds: string[], audit: { id: string; ts: string; summary: string }) => void;
}) {
  const configPath = useAgentRegistry((s) => s.openclawConfigPath);
  const backupFn = useServerFn(ocBackupOpenClawConfig);
  const validateFn = useServerFn(ocValidateOpenClawConfig);
  const writeFn = useServerFn(ocWriteOpenClawConfig);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validation, setValidation] = useState<{ ok: boolean; errors: string[]; warnings: string[] } | null>(null);
  const [backupRef, setBackupRef] = useState<{ path: string; createdAt: string } | null>(null);

  const payload = useMemo(() => buildConfigToml(aliases), [aliases]);
  const diff = useMemo(() => buildDiff(aliases), [aliases]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setBusy(true);
      setError(null);
      try {
        const [b, v] = await Promise.all([
          backupFn(),
          validateFn({ data: { payload } }),
        ]);
        if (cancelled) return;
        setBackupRef(b);
        setValidation(v);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "preflight failed");
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function confirmWrite() {
    setBusy(true);
    setError(null);
    try {
      const res = await writeFn({
        data: {
          payload,
          rawIds: aliases.map((a) => a.rawOpenClawId),
          operatorNote: `Pushed ${aliases.length} alias edit(s) including ${highlightRawId}`,
        },
      });
      onConfirmed(aliases.map((a) => a.rawOpenClawId), res.audit);
    } catch (e) {
      setError(e instanceof Error ? e.message : "write failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/60 pointer-events-auto" onClick={onClose}>
      <div className="panel border border-coral/50 rounded-lg w-[640px] max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-border flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-coral" />
          <div className="flex-1">
            <div className="text-sm font-semibold">Save to OpenClaw config</div>
            <div className="text-[10px] text-mono text-muted-foreground">
              {configPath || "(no OPENCLAW_CONFIG_PATH set — preview/mock write)"}
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-surface text-muted-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <Step done={!!backupRef} label="1. Backup">
            {backupRef ? (
              <div className="text-[11px] text-mono text-muted-foreground">
                <span className="text-sky">backup ok</span> · {backupRef.path}
              </div>
            ) : <div className="text-[11px] text-muted-foreground">creating backup…</div>}
          </Step>

          <Step done={!!validation} ok={validation?.ok} label="2. Validate">
            {validation ? (
              <div className="text-[11px] space-y-0.5">
                <div className={validation.ok ? "text-sky" : "text-coral"}>
                  {validation.ok ? "valid" : "invalid"}
                </div>
                {validation.errors.map((e, i) => <div key={i} className="text-coral text-mono">· {e}</div>)}
                {validation.warnings.map((w, i) => <div key={i} className="text-yellow text-mono">· {w}</div>)}
              </div>
            ) : <div className="text-[11px] text-muted-foreground">validating…</div>}
          </Step>

          <Step done={false} label={`3. Diff preview (${aliases.length} agent${aliases.length === 1 ? "" : "s"})`}>
            <pre className="surface border border-border rounded-md p-2.5 text-mono text-[11px] max-h-48 overflow-auto whitespace-pre">{diff}</pre>
          </Step>

          {error && (
            <div className="text-[11px] text-coral text-mono">{error}</div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-border flex items-center gap-2">
          <div className="text-[10px] text-mono text-muted-foreground flex-1">
            Audit log entry will be written. OpenClaw config will be replaced atomically.
          </div>
          <button onClick={onClose} className="px-3 py-1.5 rounded-md surface border border-border text-xs">Cancel</button>
          <button
            onClick={confirmWrite}
            disabled={busy || !validation?.ok}
            className={cn(
              "px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5",
              !busy && validation?.ok
                ? "bg-coral text-primary-foreground hover:opacity-90"
                : "surface border border-border text-muted-foreground cursor-not-allowed",
            )}
          >
            <ShieldAlert className="w-3 h-3" />
            Confirm write
          </button>
        </div>
      </div>
    </div>
  );
}

function Step({ label, done, ok, children }: { label: string; done: boolean; ok?: boolean; children: React.ReactNode }) {
  return (
    <section>
      <div className="text-[10px] uppercase tracking-wider text-mono mb-1.5 flex items-center gap-2">
        <span className={cn(
          "w-1.5 h-1.5 rounded-full",
          done ? (ok === false ? "bg-coral" : "bg-sky") : "bg-muted-foreground",
        )} />
        <span className="text-muted-foreground">{label}</span>
      </div>
      {children}
    </section>
  );
}

function buildConfigToml(aliases: AgentAlias[]): string {
  const lines: string[] = ["# OpenClaw agents — written by Carapace", ""];
  for (const a of aliases) {
    lines.push(`[agents.${a.rawOpenClawId}]`);
    lines.push(`friendly_name = ${JSON.stringify(a.friendlyName)}`);
    lines.push(`role = ${JSON.stringify(a.role)}`);
    if (a.parentRawOpenClawId) lines.push(`parent = ${JSON.stringify(a.parentRawOpenClawId)}`);
    if (a.workspacePath) lines.push(`workspace = ${JSON.stringify(a.workspacePath)}`);
    if (a.memoryPath) lines.push(`memory = ${JSON.stringify(a.memoryPath)}`);
    if (a.model) lines.push(`model = ${JSON.stringify(a.model)}`);
    if (a.provider) lines.push(`provider = ${JSON.stringify(a.provider)}`);
    if (a.tags && a.tags.length > 0) lines.push(`tags = [${a.tags.map((t) => JSON.stringify(t)).join(", ")}]`);
    lines.push("");
  }
  return lines.join("\n");
}

function buildDiff(aliases: AgentAlias[]): string {
  const lines: string[] = [];
  for (const a of aliases) {
    lines.push(`@@ [agents.${a.rawOpenClawId}] @@`);
    lines.push(`+ friendly_name = "${a.friendlyName}"`);
    lines.push(`+ role = "${a.role}"`);
    if (a.parentRawOpenClawId) lines.push(`+ parent = "${a.parentRawOpenClawId}"`);
    if (a.workspacePath) lines.push(`+ workspace = "${a.workspacePath}"`);
    if (a.memoryPath) lines.push(`+ memory = "${a.memoryPath}"`);
    lines.push("");
  }
  return lines.join("\n");
}
