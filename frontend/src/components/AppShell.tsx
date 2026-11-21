"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import type { PermissionKey } from "@/lib/types";

type NavItem = {
  href: string;
  label: string;
  icon: string;
  roles?: string[];
  permission?: PermissionKey;
};

const NAV: NavItem[] = [
  { href: "/", label: "Dashboard", icon: "▦" },
  { href: "/pos", label: "POS", icon: "◉" },
  { href: "/products", label: "Products", icon: "▣" },
  { href: "/serials", label: "Serials", icon: "#" },
  { href: "/low-stock", label: "Low Stock", icon: "▼" },
  { href: "/demands", label: "Demands", icon: "◇" },
  { href: "/purchases", label: "Purchases", icon: "↙" },
  { href: "/customers", label: "Customers", icon: "◎" },
  { href: "/sales", label: "Sales", icon: "₪" },
  { href: "/exchanges", label: "Exchange", icon: "⇄", permission: "walkin_exchange" },
  { href: "/installments", label: "Installments", icon: "≡" },
  { href: "/warranty", label: "Warranty", icon: "✓" },
  { href: "/expenses", label: "Expenses", icon: "−" },
  { href: "/reports", label: "Reports", icon: "▤" },
  { href: "/documents", label: "Documents", icon: "☰", roles: ["manager"] },
  { href: "/settings", label: "Settings", icon: "⚙" },
];

function SidebarNav({ items, onClose }: { items: NavItem[]; onClose: () => void }) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <>
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          onClick={onClose}
          className={`flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
            isActive(item.href)
              ? "bg-teal-600 text-white"
              : "text-slate-300 hover:bg-slate-800 hover:text-white"
          }`}
        >
          <span className="w-5 shrink-0 text-center text-teal-400">{item.icon}</span>
          {item.label}
        </Link>
      ))}
    </>
  );
}

function NavFallback({ items }: { items: NavItem[] }) {
  return (
    <>
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
        >
          <span className="w-5 shrink-0 text-center text-teal-400">{item.icon}</span>
          {item.label}
        </Link>
      ))}
    </>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, logout, hasPermission } = useAuth();
  const [open, setOpen] = useState(false);

  const visibleNav = NAV.filter((item) => {
    if (item.permission && !hasPermission(item.permission)) return false;
    if (item.roles && user && !item.roles.includes(user.role) && user.role !== "admin") return false;
    return true;
  });

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <div className="flex min-h-screen min-w-0 overflow-x-clip bg-slate-100 text-slate-900">
      <aside
        id="app-sidebar"
        className={`fixed inset-y-0 left-0 z-40 flex h-dvh max-h-dvh w-[min(16rem,85vw)] max-w-full flex-col overflow-hidden border-r border-slate-200 bg-slate-900 text-slate-100 transition-transform lg:sticky lg:top-0 lg:w-64 lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div
          className="shrink-0 border-b border-slate-700 px-4 py-5"
          style={{ paddingTop: "max(1.25rem, env(safe-area-inset-top))" }}
        >
          <p className="text-lg font-semibold tracking-tight text-teal-400">Hardware POS</p>
          <p className="mt-1 truncate text-xs text-slate-400">{user?.name}</p>
        </div>
        <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto overscroll-contain p-2 [-webkit-overflow-scrolling:touch]">
          <Suspense fallback={<NavFallback items={visibleNav} />}>
            <SidebarNav items={visibleNav} onClose={() => setOpen(false)} />
          </Suspense>
        </nav>
        <div className="shrink-0 border-t border-slate-700 p-3">
          <button
            type="button"
            onClick={() => void logout()}
            className="min-h-11 w-full rounded-lg bg-slate-800 px-3 py-2 text-sm text-slate-200 hover:bg-slate-700"
          >
            Sign out
          </button>
        </div>
      </aside>

      {open ? (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setOpen(false)}
        />
      ) : null}

      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <header
          className="sticky top-0 z-20 flex items-center gap-3 border-b border-slate-200 bg-white px-3 py-2.5 shadow-sm sm:px-4 lg:hidden"
          style={{ paddingTop: "max(0.625rem, env(safe-area-inset-top))" }}
        >
          <button
            type="button"
            className="inline-flex min-h-10 items-center rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium"
            aria-expanded={open}
            aria-controls="app-sidebar"
            onClick={() => setOpen(true)}
          >
            Menu
          </button>
          <span className="min-w-0 truncate text-base font-semibold leading-none text-teal-700">Hardware POS</span>
        </header>
        <main className="mx-auto min-w-0 w-full max-w-[1600px] flex-1 overflow-x-clip p-3 sm:p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
