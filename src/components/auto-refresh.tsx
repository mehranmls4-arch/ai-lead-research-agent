"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Re-renders the server component periodically while background work is in progress. */
export function AutoRefresh({ intervalMs = 3000 }: { intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(t);
  }, [router, intervalMs]);
  return null;
}
