import Link from "next/link";
import { requirePageUser } from "@/lib/auth/server";
import { getConfig } from "@/lib/config";
import { AppNav } from "@/components/app-nav";
import { LogoutButton } from "@/components/logout-button";
import { Logo } from "@/components/logo";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser();
  const cfg = getConfig();
  const demoMode = cfg.RESEARCH_PROVIDER === "mock" || cfg.AI_PROVIDER === "mock";
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[232px_1fr]">
      <aside className="hidden border-r border-line bg-surface lg:flex lg:flex-col">
        <div className="px-4 py-4">
          <Link href="/leads">
            <Logo />
          </Link>
        </div>
        <div className="flex-1 px-2">
          <AppNav />
        </div>
        <div className="space-y-3 border-t border-line px-4 py-4 text-[12.5px]">
          <div>
            <p className="font-medium text-ink-2">Providers</p>
            <p className="text-muted">
              Research: <span className="text-ink">{cfg.RESEARCH_PROVIDER}</span>
              <br />
              AI: <span className="text-ink">{cfg.AI_PROVIDER}</span>
            </p>
            {demoMode ? <p className="mt-1 text-prov-demo">Demo mode — mock results are labelled Demo.</p> : null}
          </div>
          <div>
            <p className="truncate font-medium text-ink">{user.name}</p>
            <p className="truncate text-muted">
              {user.email}
              <br />
              Role: {user.role}
            </p>
            <div className="-ml-2 mt-1">
              <LogoutButton />
            </div>
          </div>
        </div>
      </aside>
      <div className="min-w-0">
        <header className="border-b border-line bg-surface px-4 py-3 lg:hidden">
          <div className="mb-2 flex items-center justify-between">
            <Logo />
            <LogoutButton />
          </div>
          <AppNav orientation="horizontal" />
        </header>
        <main className="mx-auto max-w-[1280px] px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
