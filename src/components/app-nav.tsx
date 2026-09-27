"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, FileUp, KanbanSquare, ListChecks, SearchCheck, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/leads/new", label: "Analyze lead", icon: SearchCheck },
  { href: "/leads", label: "Leads", icon: ListChecks, exact: true },
  { href: "/crm", label: "Pipeline", icon: KanbanSquare },
  { href: "/import", label: "CSV import", icon: FileUp },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/settings/icp", label: "ICP & scoring", icon: SlidersHorizontal },
];

export function AppNav({ orientation = "vertical" }: { orientation?: "vertical" | "horizontal" }) {
  const path = usePathname();
  const isActive = (href: string, exact?: boolean) =>
    exact ? path === href || (path.startsWith("/leads/") && !path.startsWith("/leads/new")) : path === href || path.startsWith(`${href}/`);
  return (
    <nav aria-label="Main" className={cn(orientation === "vertical" ? "flex flex-col gap-0.5" : "flex gap-1 overflow-x-auto")}>
      {NAV.map(({ href, label, icon: Icon, exact }) => {
        const active = isActive(href, exact);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2.5 whitespace-nowrap rounded-md px-2.5 py-1.5 text-[13.5px]",
              active ? "bg-accent-soft font-medium text-accent-strong" : "text-ink-2 hover:bg-paper hover:text-ink",
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
