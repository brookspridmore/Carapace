import type { ReactNode } from "react";

export function PageHeader({ eyebrow, title, description, actions }: {
  eyebrow?: string; title: string; description?: string; actions?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-border">
      <div className="min-w-0">
        {eyebrow && (
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground text-mono mb-1">
            {eyebrow}
          </div>
        )}
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        {description && (
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}
