"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import type { PermissionKey } from "@/lib/types";

type NavItem = {
  href: string;
  label: string;
  icon: string;
  roles?: string[];
  permission?: PermissionKey;
};

type NavGroup = {
  id: string;
  label: string;
  items: NavItem[];
};

const NAV_GROUPS: NavGroup[] = [
  {
    id: "overview",
    label: "Overview",
    items: [{ href: "/", label: "Dashboard", icon: "▦" }],
  },
  {
    id: "sales",
    label: "Sales & Billing",
    items: [
      { href: "/pos", label: "Counter Sale (POS)", icon: "◉" },
      { href: "/sales", label: "Sales Invoices", icon: "₪" },
      { href: "/exchanges", label: "Item Exchange", icon: "⇄", permission: "walkin_exchange" },
      { href: "/installments", label: "EMI / Installments", icon: "≡" },
    ],
  },
  {
    id: "customers",
    label: "Customers & Credit",
    items: [{ href: "/customers", label: "Customers & Dues", icon: "◎" }],
  },
  {
    id: "inventory",
    label: "Stock & Catalog",
    items: [
      { href: "/products", label: "Product Catalog", icon: "▣" },
      { href: "/serials", label: "Device Serials", icon: "#" },
      { href: "/low-stock", label: "Low Stock Alert", icon: "▼" },
    ],
  },
  {
    id: "purchasing",
    label: "Purchase & Suppliers",
    items: [
      { href: "/demands", label: "Purchase Demand", icon: "◇" },
      { href: "/purchases", label: "Goods Receive", icon: "↙" },
    ],
  },
  {
    id: "service",
    label: "After-Sales Service",
    items: [{ href: "/warranty", label: "Warranty Claims", icon: "✓" }],
  },
  {
    id: "finance",
    label: "Accounts & Reports",
    items: [
      { href: "/expenses", label: "Shop Expenses", icon: "−" },
      { href: "/reports", label: "Business Reports", icon: "▤" },
    ],
  },
  {
    id: "admin",
    label: "Administration",
    items: [
      { href: "/documents", label: "Invoice Templates", icon: "☰", roles: ["manager"] },
      { href: "/settings", label: "Shop Settings", icon: "⚙" },
    ],
  },
];

function itemVisible(
  item: NavItem,
  hasPermission: (key: PermissionKey) => boolean,
  role: string | undefined,
) {
  if (item.permission && !hasPermission(item.permission)) return false;
  if (item.roles && role && !item.roles.includes(role) && role !== "admin") return false;
  return true;
}

function isHrefActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({
  item,
  active,
  onClose,
  nested = false,
}: {
  item: NavItem;
  active: boolean;
  onClose: () => void;
  nested?: boolean;
}) {
  return (
    <Link
      href={item.href}
      onClick={onClose}
      className={`flex min-h-10 items-center gap-2.5 rounded-lg text-sm font-medium transition-colors ${
        nested ? "px-3 py-2 pl-3" : "px-3 py-2.5"
      } ${
        active
          ? "bg-teal-600 text-white"
          : "text-slate-300 hover:bg-slate-800 hover:text-white"
      }`}
    >
      <span className={`w-5 shrink-0 text-center ${active ? "text-teal-100" : "text-teal-400"}`}>
        {item.icon}
      </span>
      <span className="min-w-0 leading-snug">{item.label}</span>
    </Link>
  );
}

function SidebarNav({
  groups,
  onClose,
}: {
  groups: NavGroup[];
  onClose: () => void;
}) {
  const pathname = usePathname();

  const activeGroupIds = useMemo(() => {
    const ids = new Set<string>();
    for (const group of groups) {
      if (group.items.some((item) => isHrefActive(pathname, item.href))) {
        ids.add(group.id);
      }
    }
    return ids;
  }, [groups, pathname]);

  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set(activeGroupIds));

  useEffect(() => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      for (const id of activeGroupIds) next.add(id);
      return next;
    });
  }, [activeGroupIds]);

  const toggleGroup = (id: string) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <>
      {groups.map((group) => {
        const isOpen = openGroups.has(group.id);
        const hasActiveChild = activeGroupIds.has(group.id);
        const onlyOne = group.items.length === 1;

        if (onlyOne) {
          const item = group.items[0];
          return (
            <div key={group.id} className="mb-1">
              <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                {group.label}
              </p>
              <NavLink
                item={item}
                active={isHrefActive(pathname, item.href)}
                onClose={onClose}
              />
            </div>
          );
        }

        return (
          <div key={group.id} className="mb-1">
            <button
              type="button"
              onClick={() => toggleGroup(group.id)}
              aria-expanded={isOpen}
              className={`flex min-h-10 w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left transition-colors ${
                hasActiveChild
                  ? "text-teal-300"
                  : "text-slate-400 hover:bg-slate-800/80 hover:text-slate-200"
              }`}
            >
              <span className="text-[11px] font-semibold uppercase tracking-wider">
                {group.label}
              </span>
              <span
                className={`shrink-0 text-xs text-slate-500 transition-transform ${
                  isOpen ? "rotate-90" : ""
                }`}
                aria-hidden
              >
                ›
              </span>
            </button>
            {isOpen ? (
              <div className="ml-2 space-y-0.5 border-l border-slate-700 pl-2">
                {group.items.map((item) => (
                  <NavLink
                    key={item.href}
                    item={item}
                    active={isHrefActive(pathname, item.href)}
                    onClose={onClose}
                    nested
                  />
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </>
  );
}

function NavFallback({ groups }: { groups: NavGroup[] }) {
  return (
    <>
      {groups.map((group) => (
        <div key={group.id} className="mb-1">
          <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            {group.label}
          </p>
          {group.items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex min-h-10 items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
            >
              <span className="w-5 shrink-0 text-center text-teal-400">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </div>
      ))}
    </>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, logout, hasPermission } = useAuth();
  const [open, setOpen] = useState(false);

  const visibleGroups = useMemo(() => {
    return NAV_GROUPS.map((group) => ({
      ...group,
      items: group.items.filter((item) => itemVisible(item, hasPermission, user?.role)),
    })).filter((group) => group.items.length > 0);
  }, [hasPermission, user?.role]);

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
          <Suspense fallback={<NavFallback groups={visibleGroups} />}>
            <SidebarNav groups={visibleGroups} onClose={() => setOpen(false)} />
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
          <span className="min-w-0 truncate text-base font-semibold leading-none text-teal-700">
            Hardware POS
          </span>
        </header>
        <main className="mx-auto min-w-0 w-full max-w-[1600px] flex-1 overflow-x-clip p-3 sm:p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
