"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { formatBDT } from "@/lib/format";
import type { DashboardSummary } from "@/lib/types";
import { Alert, Card, PageHeader } from "@/components/ui";

export default function DashboardPage() {
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    void api<DashboardSummary>("/reports/dashboard")
      .then(setData)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Unable to load dashboard data");
      });
  }, []);

  const s = data?.sales;

  return (
    <div>
      <PageHeader title="Dashboard" />
      {error ? <Alert tone="error">{error}</Alert> : null}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Today's sales" value={formatBDT(s?.total_sales)} sub={`${s?.invoice_count ?? 0} invoices`} />
        <StatCard label="Retail" value={formatBDT(s?.retail_sales)} />
        <StatCard label="Wholesale" value={formatBDT(s?.wholesale_sales)} />
        <StatCard label="Due today" value={formatBDT(s?.due_today)} />
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <LinkCard href="/low-stock" title="Low stock" value={String(data?.low_stock_count ?? "—")} />
        <LinkCard href="/demands" title="Open demands" value={String(data?.open_demands ?? "—")} />
        <LinkCard href="/customers" title="Customer dues" value={formatBDT(data?.customer_dues)} />
        <LinkCard href="/installments" title="Overdue EMI" value={String(data?.overdue_emi ?? "—")} />
      </div>
      {data?.payments ? (
        <Card className="mt-6 p-5">
          <h2 className="font-medium text-slate-700">Payment mix today</h2>
          <PaymentMixGrid payments={data.payments} />
        </Card>
      ) : null}
      <QuickActions />
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card className="p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 font-mono text-2xl font-semibold text-slate-900">{value}</p>
      {sub ? <p className="mt-1 text-sm text-slate-500">{sub}</p> : null}
    </Card>
  );
}

function LinkCard({ href, title, value }: { href: string; title: string; value: string }) {
  return (
    <Link href={href}>
      <Card className="p-5 transition hover:border-teal-300 hover:shadow-md">
        <p className="text-xs font-medium uppercase text-slate-500">{title}</p>
        <p className="mt-2 font-mono text-xl font-semibold text-teal-700">{value}</p>
      </Card>
    </Link>
  );
}

function PaymentMixGrid({ payments }: { payments: DashboardSummary["payments"] }) {
  return (
    <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
      {(["cash", "card", "mfs", "credit"] as const).map((k) => (
        <div key={k} className="rounded-lg bg-slate-50 px-3 py-2">
          <p className="text-xs uppercase text-slate-500">{k}</p>
          <p className="font-mono font-semibold">{formatBDT(payments[k])}</p>
        </div>
      ))}
    </div>
  );
}

function QuickActions() {
  return (
    <div className="mt-6 flex flex-wrap gap-3">
      <Link
        href="/pos"
        className="rounded-xl bg-teal-600 px-6 py-4 text-lg font-semibold text-white shadow hover:bg-teal-700"
      >
        Open POS
      </Link>
      <Link
        href="/sales"
        className="rounded-xl border border-slate-300 bg-white px-6 py-4 font-medium hover:bg-slate-50"
      >
        Sales history
      </Link>
      <Link
        href="/products"
        className="rounded-xl border border-slate-300 bg-white px-6 py-4 font-medium hover:bg-slate-50"
      >
        Products
      </Link>
      <Link
        href="/reports"
        className="rounded-xl border border-slate-300 bg-white px-6 py-4 font-medium hover:bg-slate-50"
      >
        Reports
      </Link>
    </div>
  );
}
