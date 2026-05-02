import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/shell/AppShell";
import { FlowEngine } from "@/components/flow/FlowEngine";
import { useOpenClawStatus } from "@/lib/openclaw-status";
import { EmptyState } from "@/components/shell/EmptyState";
import { Activity } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Flow — Carapace" },
      { name: "description", content: "Carapace Flow engine — agent-centric runtime graph showing inputs, tools, memory, and infrastructure for the selected agent." },
      { property: "og:title", content: "Flow — Carapace" },
      { property: "og:description", content: "Agent-centric runtime graph for OpenClaw operators." },
    ],
  }),
  component: FlowPage,
});

function FlowPage() {
  const status = useOpenClawStatus();
  const isMock = status.mode === "mock";
  return (
    <AppShell title="Flow" subtitle="Chief of Staff · agent-centric runtime graph">
      {isMock ? (
        <FlowEngine />
      ) : (
        <EmptyState icon={<Activity className="w-5 h-5 text-muted-foreground" />} message="No OpenClaw agents found yet." />
      )}
    </AppShell>
  );
}
