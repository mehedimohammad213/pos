"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useState, type ReactNode } from "react";
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
  { href: "/installments", label: "Installments", icon: "≡" },
  { href: "/warranty", label: "Warranty", icon: "✓" },
  { href: "/expenses", label: "Expenses", icon: "−" },
  { href: "/reports", label: "Reports", icon: "▤" },
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
          className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
            isActive(item.href)
              ? "bg-teal-600 text-white"
              : "text-slate-300 hover:bg-slate-800 hover:text-white"
          }`}
        >
          <span className="w-5 text-center text-teal-400">{item.icon}</span>
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
          className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
        >
          <span className="w-5 text-center text-teal-400">{item.icon}</span>
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

  return (
    <div className="flex min-h-screen bg-slate-100 text-slate-900">
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-slate-200 bg-slate-900 text-slate-100 transition-transform lg:static lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="border-b border-slate-700 px-4 py-5">
          <p className="text-lg font-semibold tracking-tight text-teal-400">Hardware POS</p>
          <p className="mt-1 truncate text-xs text-slate-400">{user?.name}</p>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
          <Suspense fallback={<NavFallback items={visibleNav} />}>
            <SidebarNav items={visibleNav} onClose={() => setOpen(false)} />
          </Suspense>
        </nav>
        <div className="border-t border-slate-700 p-3">
          <button
            type="button"
            onClick={() => void logout()}
            className="w-full rounded-lg bg-slate-800 px-3 py-2 text-sm text-slate-200 hover:bg-slate-700"
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

      <div className="flex min-h-screen flex-1 flex-col lg:min-w-0">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 shadow-sm lg:hidden">
          <button
            type="button"
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            onClick={() => setOpen(true)}
          >
            Menu
          </button>
          <span className="font-semibold text-teal-700">Hardware POS</span>
        </header>
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
