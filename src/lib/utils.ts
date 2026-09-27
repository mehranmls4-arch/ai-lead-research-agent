import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function pct(n: number | null | undefined, digits = 0) {
  return n === null || n === undefined ? "—" : `${(n * 100).toFixed(digits)}%`;
}

export function fmtDate(d: Date | string | null | undefined, withTime = true) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("en-US", withTime ? { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" } : { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) + (withTime ? " UTC" : "");
}

export function titleize(s: string) {
  return s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}
