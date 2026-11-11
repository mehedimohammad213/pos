"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import { getAccessToken } from "@/lib/api";

export function AuthGuard({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const token = getAccessToken();
    if (!token || !user) {
      const next =
        typeof window !== "undefined" ? window.location.pathname + window.location.search : "/";
      router.replace(`/login?next=${encodeURIComponent(next)}`);
    }
  }, [loading, user, router]);

  // Always keep `{children}` in the tree so Instant Navigation can validate
  // route segments (AuthGuard must not drop the page during loading/redirect).
  if (loading || !user) {
    return (
      <>
        <div className="flex min-h-screen items-center justify-center bg-slate-100">
          <p className="text-slate-600">{loading ? "Loading…" : "Redirecting…"}</p>
        </div>
        <div hidden>{children}</div>
      </>
    );
  }

  return <>{children}</>;
}
