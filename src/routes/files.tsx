import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { PageHeader } from "@/components/shell/PageHeader";
import { OnboardingHint } from "@/components/shell/OnboardingHint";
import { FILE_TREE, type FileNode } from "@/lib/mock-data";
import { ChevronRight, ChevronDown, FileText, Folder, FolderOpen, Save, History } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/files")({
  head: () => ({
    meta: [
      { title: "Files — Carapace" },
      { name: "description", content: "Browse and edit OpenClaw codebase and agent markdown files (AGENTS, SOUL, MEMORY, USER, DREAMS) with diff and backup." },
      { property: "og:title", content: "Files — Carapace" },
      { property: "og:description", content: "OpenClaw file editor with safe-by-default workflow." },
    ],
  }),
  component: FilesPage,
});

function FilesPage() {
  const [active, setActive] = useState<FileNode>(FILE_TREE[0].children![2]); // MEMORY.md
  return (
    <AppShell title="Files" subtitle="OpenClaw codebase · agent markdown · safe-by-default">
      <PageHeader
        eyebrow="Module"
        title="File browser"
        description="Edit OpenClaw configuration and agent .md files. Every save creates a backup; risky edits require approval."
        hint={
          <OnboardingHint id="files.intro" title="Safe-by-default editor" docsHref="/docs">
            <p>Browse the OpenClaw codebase and per-agent files (workspaces, MEMORY.md, DREAMS.md). Every save creates a backup automatically.</p>
          </OnboardingHint>
        }
        actions={
          <>
            <button className="text-xs px-2.5 py-1 rounded-md surface border border-border flex items-center gap-1.5 hover:border-yellow/60">
              <History className="w-3.5 h-3.5" /> History
            </button>
            <button className="text-xs px-2.5 py-1 rounded-md bg-yellow text-primary-foreground flex items-center gap-1.5 hover:opacity-90">
              <Save className="w-3.5 h-3.5" /> Save
            </button>
          </>
        }
      />
      <div className="grid grid-cols-[280px_1fr] h-[calc(100vh-3.5rem-104px)]">
        <aside className="panel border-r border-border overflow-y-auto p-2">
          <Tree nodes={FILE_TREE} active={active} onSelect={setActive} />
        </aside>
        <section className="overflow-auto">
          <div className="px-5 py-3 border-b border-border flex items-center justify-between">
            <div className="text-mono text-xs text-muted-foreground">{active.path}</div>
            <div className="text-[10px] text-mono text-muted-foreground">read-only preview</div>
          </div>
          <pre className="p-5 text-mono text-xs leading-relaxed whitespace-pre-wrap text-foreground/90">
{active.preview ?? "// (no preview)"}
          </pre>
        </section>
      </div>
    </AppShell>
  );
}

function Tree({ nodes, active, onSelect, depth = 0 }: {
  nodes: FileNode[]; active: FileNode; onSelect: (n: FileNode) => void; depth?: number;
}) {
  return (
    <ul className="space-y-0.5">
      {nodes.map((n) => (
        <TreeNode key={n.path} node={n} active={active} onSelect={onSelect} depth={depth} />
      ))}
    </ul>
  );
}

function TreeNode({ node, active, onSelect, depth }: {
  node: FileNode; active: FileNode; onSelect: (n: FileNode) => void; depth: number;
}) {
  const [open, setOpen] = useState(true);
  const isActive = node.path === active.path;
  if (node.type === "dir") {
    return (
      <li>
        <button
          onClick={() => setOpen((o) => !o)}
          className="w-full flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-surface text-xs"
          style={{ paddingLeft: 8 + depth * 12 }}
        >
          {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          {open ? <FolderOpen className="w-3.5 h-3.5 text-yellow" /> : <Folder className="w-3.5 h-3.5 text-yellow" />}
          <span>{node.name}</span>
        </button>
        {open && node.children && <Tree nodes={node.children} active={active} onSelect={onSelect} depth={depth + 1} />}
      </li>
    );
  }
  return (
    <li>
      <button
        onClick={() => onSelect(node)}
        className={cn(
          "w-full flex items-center gap-1.5 px-2 py-1 rounded-md text-xs hover:bg-surface",
          isActive && "bg-surface border-l-2 border-yellow",
        )}
        style={{ paddingLeft: 20 + depth * 12 }}
      >
        <FileText className="w-3.5 h-3.5 text-muted-foreground" />
        <span>{node.name}</span>
      </button>
    </li>
  );
}
