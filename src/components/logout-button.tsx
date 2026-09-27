"use client";
import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await fetch("/api/auth/logout", { method: "POST" });
        router.push("/login");
        router.refresh();
      }}
      className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-[13px] text-muted hover:bg-paper hover:text-ink"
    >
      <LogOut className="size-3.5" aria-hidden />
      Sign out
    </button>
  );
}
