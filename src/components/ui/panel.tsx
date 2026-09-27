import * as React from "react";
import { cn } from "@/lib/utils";

/** Bordered section. Panels are the only container style; hierarchy comes from headings and spacing. */
export function Panel({ className, ...p }: React.HTMLAttributes<HTMLElement>) {
  return <section className={cn("rounded-lg border border-line bg-surface", className)} {...p} />;
}

export function PanelHeader({ title, description, actions, className }: { title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3", className)}>
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
        {description ? <p className="mt-0.5 text-[13px] text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function PanelBody({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-4 py-4", className)} {...p} />;
}

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="px-4 py-8 text-center">
      <p className="font-medium text-ink-2">{title}</p>
      {children ? <div className="mt-1 text-[13px] text-muted">{children}</div> : null}
    </div>
  );
}
