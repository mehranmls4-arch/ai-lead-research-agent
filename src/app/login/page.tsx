import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth/server";
import { getConfig } from "@/lib/config";
import { Logo } from "@/components/logo";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in" };

function safeNext(n: string | undefined) {
  return n && n.startsWith("/") && !n.startsWith("//") ? n : "/leads";
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  if (await getSessionUser()) redirect(safeNext(next));
  const cfg = getConfig();
  const showCreds = cfg.SHOW_DEMO_CREDENTIALS === "true" && cfg.SEED_ADMIN_PASSWORD;
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-6 inline-block">
          <Logo />
        </Link>
        <div className="rounded-lg border border-line bg-surface p-6">
          <h1 className="text-lg font-semibold">Sign in</h1>
          <p className="mb-5 mt-1 text-[13px] text-muted">Lead research workspace for the NovaFlow AI sales team.</p>
          <LoginForm next={safeNext(next)} defaultEmail={showCreds ? cfg.SEED_ADMIN_EMAIL : ""} />
        </div>
        {showCreds ? (
          <p className="mt-4 rounded-md border border-prov-demo/30 bg-[#f3eefb] px-3 py-2 text-[13px] text-ink-2">
            Demo credentials: <strong>{cfg.SEED_ADMIN_EMAIL}</strong> / <strong>{cfg.SEED_ADMIN_PASSWORD}</strong> (admin). Shown because SHOW_DEMO_CREDENTIALS=true.
          </p>
        ) : null}
      </div>
    </div>
  );
}
