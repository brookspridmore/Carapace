import { useEffect, useState, type ReactNode } from "react";
import { HelpCircle, X } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "carapace.onboarding.dismissed.v1";

function loadDismissed(): Record<string, true> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function saveDismissed(map: Record<string, true>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* noop */
  }
}

export function resetOnboardingHints() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
  window.location.reload();
}

export interface OnboardingHintProps {
  /** Stable id used for "don't show again" persistence. */
  id: string;
  /** Short title shown in bold at the top. */
  title: string;
  /** Body — supports JSX for lists / emphasis. */
  children: ReactNode;
  /** Optional pointer to the relevant docs section. */
  docsHref?: string;
  /** Auto-open the first time the user visits this surface (default: true). */
  autoOpen?: boolean;
  className?: string;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
}

/**
 * A small "?" badge that opens a contextual onboarding tip. Each hint is
 * dismissible per-id; once dismissed it stays closed but the "?" badge
 * remains so users can reopen it on demand.
 */
export function OnboardingHint({
  id,
  title,
  children,
  docsHref,
  autoOpen = true,
  className,
  side = "bottom",
  align = "start",
}: OnboardingHintProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (!autoOpen) return;
    const dismissed = loadDismissed();
    if (!dismissed[id]) {
      // Defer slightly so it doesn't flash before the page paints.
      const t = window.setTimeout(() => setOpen(true), 350);
      return () => window.clearTimeout(t);
    }
  }, [id, autoOpen]);

  const dismiss = () => {
    const dismissed = loadDismissed();
    dismissed[id] = true;
    saveDismissed(dismissed);
    setOpen(false);
  };

  if (!mounted) {
    return (
      <span
        className={cn(
          "inline-flex items-center justify-center w-5 h-5 rounded-full text-yellow/70",
          className,
        )}
        aria-hidden
      >
        <HelpCircle className="w-3.5 h-3.5" />
      </span>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Help: ${title}`}
          className={cn(
            "inline-flex items-center justify-center w-5 h-5 rounded-full",
            "text-yellow/80 hover:text-yellow hover:bg-yellow/10 transition-colors",
            "ring-1 ring-yellow/30",
            className,
          )}
        >
          <HelpCircle className="w-3.5 h-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side={side}
        align={align}
        className="w-80 p-0 border-yellow/40"
      >
        <div className="flex items-start justify-between gap-2 px-3 pt-3">
          <div className="text-xs uppercase tracking-wider text-yellow text-mono">
            Tip
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Close"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="px-3 pb-3 pt-1.5 space-y-2">
          <div className="text-sm font-semibold leading-snug">{title}</div>
          <div className="text-xs text-muted-foreground leading-relaxed space-y-1.5">
            {children}
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-t border-border bg-surface/50">
          {docsHref ? (
            <Link
              to={docsHref}
              onClick={() => setOpen(false)}
              className="text-[11px] text-yellow hover:underline text-mono"
            >
              Read full docs →
            </Link>
          ) : (
            <span className="text-[11px] text-muted-foreground text-mono">
              Carapace · onboarding
            </span>
          )}
          <button
            type="button"
            onClick={dismiss}
            className="text-[11px] text-muted-foreground hover:text-foreground text-mono"
          >
            Got it
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}