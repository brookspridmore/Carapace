import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/shell/AppShell";
import { Kanban } from "@/components/kanban/Kanban";
import { useOpenClawStatus } from "@/lib/openclaw-status";
import { EmptyState } from "@/components/shell/EmptyState";
import { KanbanSquare } from "lucide-react";

export const Route = createFileRoute("/kanban")({
  head: () => ({
    meta: [
      { title: "Kanban — Carapace" },
      { name: "description", content: "Carapace Kanban mission control — manage tasks across all agents with subtasks, snapshots, and review workflow." },
      { property: "og:title", content: "Kanban — Carapace" },
      { property: "og:description", content: "Mission control for OpenClaw agents." },
    ],
  }),
  component: KanbanPage,
});

function KanbanPage() {
  const status = useOpenClawStatus();
  const isMock = status.mode === "mock";
  return (
    <AppShell title="Kanban" subtitle="Mission control · 8 lanes · all agents">
      {isMock ? (
        <Kanban />
      ) : (
        <EmptyState icon={<KanbanSquare className="w-5 h-5 text-muted-foreground" />} message="No tasks found." />
      )}
    </AppShell>
  );
}
