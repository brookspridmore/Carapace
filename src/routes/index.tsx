import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/shell/AppShell";
import { FlowEngine } from "@/components/flow/FlowEngine";

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
  return (
    <AppShell title="Flow" subtitle="Chief of Staff · agent-centric runtime graph">
      <FlowEngine />
    </AppShell>
  );
}
