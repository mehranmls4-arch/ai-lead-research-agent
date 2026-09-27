import * as React from "react";
import { cn } from "@/lib/utils";

export type Tone = "neutral" | "accent" | "ok" | "warn" | "danger" | "demo";
const TONES: Record<Tone, string> = {
  neutral: "bg-paper text-ink-2 border-line-strong",
  accent: "bg-accent-soft text-accent-strong border-accent/25",
  ok: "bg-ok-soft text-ok border-ok/25",
  warn: "bg-warn-soft text-warn border-warn/30",
  danger: "bg-danger-soft text-danger border-danger/25",
  demo: "bg-[#f3eefb] text-prov-demo border-prov-demo/30",
};

export function Badge({ tone = "neutral", className, children, ...p }: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded border px-1.5 py-px text-xs font-medium", TONES[tone], className)} {...p}>
      {children}
    </span>
  );
}
