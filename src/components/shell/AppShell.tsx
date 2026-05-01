import { useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  Activity, KanbanSquare, Users, FolderTree, MessagesSquare, Sparkles,
  Brain, Camera, Plug, ShieldCheck, ScrollText, Settings, Search,
  PanelLeftClose, PanelLeftOpen, Hexagon, BookOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV: { to: string; label: string; icon: typeof Activity; group: "primary" | "modules" | "system" }[] = [
  { to: "/", label: "Flow", icon: Activity, group: "primary" },
  { to: "/kanban", label: "Kanban", icon: KanbanSquare, group: "primary" },
  { to: "/agents", label: "Agents", icon: Users, group: "modules" },
  { to: "/files", label: "Files", icon: FolderTree, group: "modules" },
  { to: "/conversations", label: "Conversations", icon: MessagesSquare, group: "modules" },
  { to: "/dreams", label: "Dreams", icon: Sparkles, group: "modules" },
  { to: "/memory", label: "Memory", icon: Brain, group: "modules" },
  { to: "/snapshots", label: "Snapshots", icon: Camera, group: "modules" },
  { to: "/providers", label: "Providers", icon: Plug, group: "modules" },
  { to: "/approvals", label: "Approvals", icon: ShieldCheck, group: "system" },
  { to: "/logs", label: "Logs", icon: ScrollText, group: "system" },
  { to: "/docs", label: "Docs", icon: BookOpen, group: "system" },
  { to: "/settings", label: "Settings", icon: Settings, group: "system" },
];

export function AppShell({ children, title, subtitle, actions }: {
  children: ReactNode; title?: string; subtitle?: string; actions?: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const path = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="min-h-screen w-full flex bg-background text-foreground">
      {/* Sidebar */}
      <aside
        className={cn(
          "panel border-r border-border flex flex-col transition-[width] duration-200",
          collapsed ? "w-[64px]" : "w-[240px]",
        )}
      >
        <div className="h-14 px-3 flex items-center gap-2 border-b border-border">
          <div className="w-8 h-8 rounded-md bg-[color-mix(in_oklab,var(--carapace-yellow)_20%,transparent)] flex items-center justify-center">
            <Hexagon className="w-4 h-4 text-yellow" strokeWidth={2.25} />
          </div>
          {!collapsed && (
            <div className="flex-1">
              <div className="text-sm font-semibold tracking-tight">Carapace</div>
              <div className="text-[10px] text-muted-foreground text-mono uppercase">operator</div>
            </div>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
          {(["primary", "modules", "system"] as const).map((group) => (
            <div key={group}>
              {!collapsed && (
                <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground text-mono">
                  {group === "primary" ? "Primary" : group === "modules" ? "Modules" : "System"}
                </div>
              )}
              <ul className="space-y-0.5">
                {NAV.filter((n) => n.group === group).map((item) => {
                  const active = item.to === "/" ? path === "/" : path.startsWith(item.to);
                  const Icon = item.icon;
                  return (
                    <li key={item.to}>
                      <Link
                        to={item.to}
                        className={cn(
                          "flex items-center gap-3 px-2 py-1.5 rounded-md text-sm transition-colors",
                          "hover:bg-surface",
                          active
                            ? "bg-surface text-foreground border-l-2 border-yellow"
                            : "text-muted-foreground border-l-2 border-transparent",
                          collapsed && "justify-center",
                        )}
                        title={collapsed ? item.label : undefined}
                      >
                        <Icon className="w-4 h-4 shrink-0" />
                        {!collapsed && <span className="truncate">{item.label}</span>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <button
          onClick={() => setCollapsed((c) => !c)}
          className="m-2 p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-surface flex items-center gap-2 text-xs"
          aria-label="Toggle sidebar"
        >
          {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
          {!collapsed && <span>Collapse</span>}
        </button>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar title={title} subtitle={subtitle} actions={actions} />
        <main className="flex-1 min-h-0">{children}</main>
      </div>
    </div>
  );
}

function TopBar({ title, subtitle, actions }: { title?: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <header className="h-14 panel border-b border-border flex items-center px-4 gap-4 shrink-0">
      <div className="flex flex-col min-w-0">
        <h1 className="text-sm font-semibold tracking-tight truncate">{title ?? "Carapace"}</h1>
        {subtitle && (
          <div className="text-[11px] text-muted-foreground text-mono truncate">{subtitle}</div>
        )}
      </div>

      <div className="flex-1 max-w-md mx-auto hidden md:block">
        <div className="flex items-center gap-2 surface rounded-md px-2.5 py-1.5 text-xs text-muted-foreground border border-border">
          <Search className="w-3.5 h-3.5" />
          <span>Search agents, tasks, files…</span>
          <span className="ml-auto text-mono opacity-60">⌘K</span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {actions}
        <ApprovalsBadge />
        <OpenClawIndicator />
      </div>
    </header>
  );
}

function ApprovalsBadge() {
  return (
    <Link
      to="/approvals"
      className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs surface border border-border hover:border-yellow/50 transition-colors"
      title="Pending approvals"
    >
      <ShieldCheck className="w-3.5 h-3.5 text-yellow" />
      <span className="text-mono">3</span>
    </Link>
  );
}

function OpenClawIndicator() {
  // Simulated — green dot pointing at default OPENCLAW_BASE_URL.
  return (
    <div
      className="flex items-center gap-2 px-2 py-1 rounded-md surface border border-border text-xs"
      title="OpenClaw 127.0.0.1:18789 — connected (mock)"
    >
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full rounded-full bg-sky opacity-60 animate-ping" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-sky" />
      </span>
      <span className="text-mono text-muted-foreground hidden sm:inline">openclaw</span>
    </div>
  );
}
