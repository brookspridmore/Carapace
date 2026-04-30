import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/shell/AppShell";
import { PageHeader } from "@/components/shell/PageHeader";
import { Copy } from "lucide-react";

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
  return (
    <AppShell title="Settings" subtitle="Operator preferences · OpenClaw connection">
      <PageHeader eyebrow="System" title="Settings" description="Configure how Carapace talks to OpenClaw and how it's exposed on your network." />
      <div className="p-6 space-y-6 max-w-2xl">
        <Card title="OpenClaw connection">
          <Field label="OPENCLAW_BASE_URL" defaultValue="http://127.0.0.1:18789" />
          <p className="text-[11px] text-muted-foreground mt-2">
            Carapace proxies every OpenClaw call server-side. The browser never connects to OpenClaw directly.
            <br />
            <span className="text-mono">OPENCLAW_GATEWAY_URL</span> is accepted as an alias.
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
