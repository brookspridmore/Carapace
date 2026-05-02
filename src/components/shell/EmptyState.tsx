import { type ReactNode } from "react";
import { Inbox } from "lucide-react";
import { useOpenClawStatus } from "@/lib/openclaw-status";
import { cn } from "@/lib/utils";

/**
 * Honest empty state. Used on every list page when OPENCLAW_MODE != mock
 * and the adapter has no data. Mirrors the connection status so operators
 * can immediately see whether the feed is empty because OpenClaw is
 * unreachable or because OpenClaw genuinely has nothing to show.
 */
export function EmptyState({
  icon,
  message,
  hint,
  className,
}: {
  icon?: ReactNode;
  message: string;
  hint?: ReactNode;
  className?: string;
}) {
  const status = useOpenClawStatus();
  const sub =
    status.connection === "unreachable"
      ? `OpenClaw at ${status.baseUrl || "—"} is unreachable.`
      : status.connection === "no-data"
      ? `Connected to ${status.baseUrl} — no records returned.`
      : status.connection === "mock"
      ? "Mock mode is active."
      : `Connected to ${status.baseUrl}.`;
  return (
    <div className={cn("flex flex-col items-center justify-center text-center px-6 py-16", className)}>
      <div className="w-12 h-12 rounded-full surface border border-border flex items-center justify-center mb-3">
        {icon ?? <Inbox className="w-5 h-5 text-muted-foreground" />}
      </div>
      <div className="text-sm font-medium text-foreground">{message}</div>
      <div className="text-[11px] text-mono text-muted-foreground mt-1">{sub}</div>
      {hint && <div className="mt-3 text-xs text-muted-foreground max-w-sm">{hint}</div>}
    </div>
  );
}