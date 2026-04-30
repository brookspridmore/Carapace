import { cn } from "@/lib/utils";

const TONE: Record<string, string> = {
  idle: "bg-surface text-muted-foreground border-border",
  thinking: "bg-[color-mix(in_oklab,var(--carapace-yellow)_15%,transparent)] text-yellow border-[color-mix(in_oklab,var(--carapace-yellow)_40%,transparent)]",
  executing: "bg-[color-mix(in_oklab,var(--carapace-sky)_15%,transparent)] text-sky border-[color-mix(in_oklab,var(--carapace-sky)_40%,transparent)]",
  waiting: "bg-surface text-muted-foreground border-border",
  error: "bg-[color-mix(in_oklab,var(--carapace-coral)_15%,transparent)] text-coral border-[color-mix(in_oklab,var(--carapace-coral)_40%,transparent)]",
  ok: "bg-[color-mix(in_oklab,var(--carapace-sky)_15%,transparent)] text-sky border-[color-mix(in_oklab,var(--carapace-sky)_40%,transparent)]",
  warn: "bg-[color-mix(in_oklab,var(--carapace-yellow)_15%,transparent)] text-yellow border-[color-mix(in_oklab,var(--carapace-yellow)_40%,transparent)]",
  untested: "bg-surface text-muted-foreground border-border",
};

export function StatusPill({ status, label, className }: { status: string; label?: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px] text-mono uppercase tracking-wide",
        TONE[status] ?? TONE.idle,
        className,
      )}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {label ?? status}
    </span>
  );
}
