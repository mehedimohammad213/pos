"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { formatBDT, formatDate, formatDateTime, todayISO } from "@/lib/format";
import { useAuth } from "@/lib/auth";
import type { DashboardSummary } from "@/lib/types";
import { Alert, Card, PageHeader, TableWrap, Td, Th } from "@/components/ui";

type PresetPeriod = "today" | "yesterday" | "last7" | "thisMonth" | "custom";

function computePresetDates(preset: PresetPeriod): { from: string; to: string } {
  const now = new Date();
  const format = (d: Date) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const todayStr = format(now);

  if (preset === "today") {
    return { from: todayStr, to: todayStr };
  }
  if (preset === "yesterday") {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    const yStr = format(y);
    return { from: yStr, to: yStr };
  }
  if (preset === "last7") {
    const d7 = new Date(now);
    d7.setDate(d7.getDate() - 6);
    return { from: format(d7), to: todayStr };
  }
  if (preset === "thisMonth") {
    const m = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: format(m), to: todayStr };
  }
  return { from: todayStr, to: todayStr };
}

export default function DashboardPage() {
  const { canSeeCost } = useAuth();
  const [preset, setPreset] = useState<PresetPeriod>("today");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const today = todayISO();
    setFrom((prev) => prev || today);
    setTo((prev) => prev || today);
  }, []);

  const loadData = useCallback(async (fromDate: string, toDate: string, isManualRefresh = false) => {
    if (!fromDate || !toDate) return;
    if (isManualRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError("");

    try {
      const qs = new URLSearchParams({ from: fromDate, to: toDate });
      const summary = await api<DashboardSummary>(`/reports/dashboard?${qs.toString()}`);
      setData(summary);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unable to load dashboard data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const handlePresetChange = (newPreset: PresetPeriod) => {
    setPreset(newPreset);
    if (newPreset !== "custom") {
      const dates = computePresetDates(newPreset);
      setFrom(dates.from);
      setTo(dates.to);
    }
  };

  useEffect(() => {
    if (from && to) {
      void loadData(from, to);
    }
  }, [from, to, loadData]);

  const s = data?.sales;
  const payments = data?.payments;
  const profit = data?.profit;
  const expenses = data?.expenses;

  const totalCollected = payments
    ? Number(payments.cash || 0) +
      Number(payments.card || 0) +
      Number(payments.mfs || 0) +
      Number(payments.credit || 0)
    : 0;

  const periodLabel = !from || !to
    ? "Today"
    : from === to
    ? (preset === "yesterday" ? "Yesterday" : formatDate(from))
    : `${formatDate(from)} – ${formatDate(to)}`;

  return (
    <div className="space-y-6">
      {/* Header with Dynamic Controls */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <PageHeader title="Dashboard" />
          <p className="mt-1 text-sm text-slate-500">
            Real-time sales, inventory, and financial overview for{" "}
            <span className="font-semibold text-slate-700">{periodLabel}</span>
          </p>
        </div>

        {/* Filter Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Preset buttons */}
          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1 shadow-xs">
            {(
              [
                { id: "today", label: "Today" },
                { id: "yesterday", label: "Yesterday" },
                { id: "last7", label: "Last 7 Days" },
                { id: "thisMonth", label: "This Month" },
                { id: "custom", label: "Custom" },
              ] as const
            ).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => handlePresetChange(p.id)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                  preset === p.id
                    ? "bg-teal-600 text-white shadow-xs"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Custom Date Pickers */}
          {preset === "custom" && (
            <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 shadow-xs">
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 outline-none focus:border-teal-500"
              />
              <span className="text-xs text-slate-400">to</span>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 outline-none focus:border-teal-500"
              />
            </div>
          )}

          {/* Refresh button */}
          <button
            type="button"
            onClick={() => void loadData(from, to, true)}
            disabled={refreshing || loading}
            title="Refresh dashboard data"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-xs hover:bg-slate-50 disabled:opacity-60"
          >
            <svg
              className={`h-3.5 w-3.5 text-slate-500 ${refreshing ? "animate-spin text-teal-600" : ""}`}
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            <span>{refreshing ? "Refreshing..." : "Refresh"}</span>
          </button>
        </div>
      </div>

      {error ? <Alert tone="error">{error}</Alert> : null}

      {/* Primary Sales KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={`Sales (${periodLabel})`}
          value={formatBDT(s?.total_sales)}
          sub={`${s?.invoice_count ?? 0} invoices completed`}
          tone="teal"
          icon={
            <svg className="h-5 w-5 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <StatCard
          label="Retail Sales"
          value={formatBDT(s?.retail_sales)}
          sub="Walk-in & consumer"
          icon={
            <svg className="h-5 w-5 text-sky-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
            </svg>
          }
        />
        <StatCard
          label="Wholesale Sales"
          value={formatBDT(s?.wholesale_sales)}
          sub="B2B & trade partners"
          icon={
            <svg className="h-5 w-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          }
        />
        <StatCard
          label="Due / Credit Amount"
          value={formatBDT(s?.due_amount ?? s?.due_today)}
          sub="Unpaid from sales"
          tone={(Number(s?.due_amount ?? s?.due_today) > 0) ? "amber" : "neutral"}
          icon={
            <svg className="h-5 w-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
      </div>

      {/* Secondary Financial Summary (Expenses & Profit if accessible) */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Expenses ({periodLabel})</p>
            <Link href="/expenses" className="text-xs font-semibold text-teal-600 hover:underline">
              Manage
            </Link>
          </div>
          <p className="mt-2 font-mono text-2xl font-semibold text-slate-900">
            {formatBDT(expenses?.total_expenses)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {expenses?.expense_count ?? 0} expense entries recorded
          </p>
        </Card>

        {canSeeCost && profit ? (
          <>
            <Card className="p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Gross Profit ({periodLabel})</p>
              <p className="mt-2 font-mono text-2xl font-semibold text-emerald-700">
                {formatBDT(profit.gross_profit)}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Revenue {formatBDT(profit.revenue)} − Cost {formatBDT(profit.cost)}
              </p>
            </Card>

            <Card className="p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Net Profit ({periodLabel})</p>
              <p className={`mt-2 font-mono text-2xl font-semibold ${profit.net_profit >= 0 ? "text-teal-700" : "text-rose-600"}`}>
                {formatBDT(profit.net_profit)}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Gross Profit − Expenses ({formatBDT(expenses?.total_expenses)})
              </p>
            </Card>
          </>
        ) : null}
      </div>

      {/* Operational Status Badges */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <LinkCard
          href="/low-stock"
          title="Low stock alerts"
          value={String(data?.low_stock_count ?? "—")}
          highlight={Number(data?.low_stock_count) > 0}
          badge={Number(data?.low_stock_count) > 0 ? "Needs reorder" : "Healthy"}
        />
        <LinkCard
          href="/demands"
          title="Open demands"
          value={String(data?.open_demands ?? "—")}
          badge="Purchase requests"
        />
        <LinkCard
          href="/customers"
          title="Customer total dues"
          value={formatBDT(data?.customer_dues)}
          badge="Receivables"
        />
        <LinkCard
          href="/installments"
          title="Overdue EMI"
          value={String(data?.overdue_emi ?? "—")}
          highlight={Number(data?.overdue_emi) > 0}
          badge={Number(data?.overdue_emi) > 0 ? "Action required" : "Up to date"}
        />
      </div>

      {/* 7-Day Sales Trend & Payment Mix Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Sales Trend Bar Chart (2 columns) */}
        <Card className="p-5 lg:col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-slate-800">7-Day Sales Trend</h2>
              <p className="text-xs text-slate-500">Daily sales totals and invoices up to {formatDate(to)}</p>
            </div>
            <Link href="/reports" className="text-xs font-semibold text-teal-600 hover:underline">
              Detailed reports &rarr;
            </Link>
          </div>

          <div className="mt-6">
            {data?.trends && data.trends.length > 0 ? (
              <TrendChart trends={data.trends} />
            ) : (
              <p className="py-12 text-center text-sm text-slate-400">No trend data available for this range.</p>
            )}
          </div>
        </Card>

        {/* Payment Mix Breakdown (1 column) */}
        <Card className="flex flex-col justify-between p-5">
          <div>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-slate-800">Payment Mix</h2>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-600">
                Total: {formatBDT(totalCollected)}
              </span>
            </div>
            <p className="text-xs text-slate-500">Collections recorded for {periodLabel}</p>

            <div className="mt-4 space-y-3">
              {(
                [
                  { key: "cash", label: "Cash", color: "bg-emerald-500" },
                  { key: "card", label: "Card", color: "bg-sky-500" },
                  { key: "mfs", label: "MFS (bKash/Nagad)", color: "bg-pink-500" },
                  { key: "credit", label: "Credit Sale", color: "bg-amber-500" },
                ] as const
              ).map(({ key, label, color }) => {
                const amount = Number(payments?.[key] || 0);
                const percent = totalCollected > 0 ? Math.round((amount / totalCollected) * 100) : 0;
                return (
                  <div key={key} className="rounded-lg border border-slate-100 bg-slate-50 p-2.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-700">{label}</span>
                      <span className="font-mono font-semibold text-slate-900">{formatBDT(amount)}</span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <div className="h-2 w-full rounded-full bg-slate-200">
                        <div
                          className={`h-2 rounded-full ${color} transition-all duration-500`}
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                      <span className="w-8 text-right font-mono text-[10px] text-slate-500">{percent}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-4 border-t border-slate-100 pt-3">
            <Link href="/sales" className="block text-center text-xs font-semibold text-teal-600 hover:underline">
              View sales ledger &rarr;
            </Link>
          </div>
        </Card>
      </div>

      {/* Recent Invoices & Top Selling Products / Low Stock */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Recent Invoices Table (2 Cols) */}
        <Card className="p-5 lg:col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-slate-800">Recent Completed Invoices</h2>
              <p className="text-xs text-slate-500">Latest sales transactions across registers</p>
            </div>
            <Link href="/sales" className="text-xs font-semibold text-teal-600 hover:underline">
              View all sales &rarr;
            </Link>
          </div>

          <div className="mt-4">
            {data?.recent_sales && data.recent_sales.length > 0 ? (
              <TableWrap>
                <thead>
                  <tr>
                    <Th>Invoice #</Th>
                    <Th>Customer</Th>
                    <Th>Date & Time</Th>
                    <Th>Total</Th>
                    <Th>Status</Th>
                    <Th>Action</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.recent_sales.map((sale) => (
                    <tr key={sale.id} className="hover:bg-slate-50">
                      <Td className="font-mono font-semibold text-teal-700">
                        <Link href={`/sales/${sale.id}`} className="hover:underline">
                          {sale.invoice_no || "INV"}
                        </Link>
                      </Td>
                      <Td>{sale.customer_name || <span className="text-slate-400">Walk-in</span>}</Td>
                      <Td className="text-xs text-slate-500">
                        {sale.created_at ? formatDateTime(sale.created_at) : formatDate(sale.sale_date)}
                      </Td>
                      <Td className="font-mono font-semibold">{formatBDT(sale.total)}</Td>
                      <Td>
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${
                            sale.payment_status === "paid"
                              ? "bg-emerald-50 text-emerald-700"
                              : sale.payment_status === "partial"
                              ? "bg-amber-50 text-amber-700"
                              : "bg-rose-50 text-rose-700"
                          }`}
                        >
                          {sale.payment_status}
                        </span>
                      </Td>
                      <Td>
                        <Link
                          href={`/sales/${sale.id}`}
                          className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          View
                        </Link>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            ) : (
              <p className="py-8 text-center text-sm text-slate-400">No completed sales found.</p>
            )}
          </div>
        </Card>

        {/* Top Selling Products & Low Stock Items (1 Col) */}
        <div className="space-y-6">
          {/* Top Selling Products */}
          <Card className="p-5">
            <h2 className="font-semibold text-slate-800">Top Selling Products</h2>
            <p className="text-xs text-slate-500">Highest grossing items ({periodLabel})</p>

            <div className="mt-4 divide-y divide-slate-100">
              {data?.top_products && data.top_products.length > 0 ? (
                data.top_products.map((p, idx) => (
                  <div key={p.id} className="flex items-center justify-between py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-teal-50 text-xs font-bold text-teal-700">
                        {idx + 1}
                      </span>
                      <div>
                        <p className="text-xs font-medium text-slate-800">{p.name}</p>
                        <p className="font-mono text-[11px] text-slate-400">{p.sku}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-xs font-semibold text-slate-900">{formatBDT(p.total_amount)}</p>
                      <p className="text-[11px] text-slate-500">
                        {p.qty_sold} {p.unit} sold
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="py-6 text-center text-xs text-slate-400">No products sold in this period.</p>
              )}
            </div>
          </Card>

          {/* Low Stock Alerts */}
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-slate-800">Low Stock Items</h2>
                <p className="text-xs text-slate-500">Current stock at or below reorder level</p>
              </div>
              <Link href="/low-stock" className="text-xs font-semibold text-teal-600 hover:underline">
                View all &rarr;
              </Link>
            </div>

            <div className="mt-4 divide-y divide-slate-100">
              {data?.low_stock_items && data.low_stock_items.length > 0 ? (
                data.low_stock_items.map((item) => (
                  <div key={item.id} className="flex items-center justify-between py-2 text-xs">
                    <div>
                      <p className="font-medium text-slate-800">{item.name}</p>
                      <p className="font-mono text-[11px] text-slate-400">{item.sku}</p>
                    </div>
                    <div className="text-right">
                      <span className="font-mono font-bold text-rose-600">
                        {item.current_stock} {item.unit}
                      </span>
                      <p className="text-[10px] text-slate-400">reorder: {item.reorder_level}</p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="py-4 text-center text-xs text-emerald-600 font-medium">All stock levels healthy!</p>
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* Quick Action Shortcuts */}
      <QuickActions />
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  tone = "neutral",
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "teal" | "amber" | "neutral";
  icon?: React.ReactNode;
}) {
  const borderTone =
    tone === "teal"
      ? "border-teal-200 bg-gradient-to-br from-white to-teal-50/20"
      : tone === "amber"
      ? "border-amber-200 bg-gradient-to-br from-white to-amber-50/20"
      : "border-slate-200 bg-white";

  return (
    <Card className={`p-5 border ${borderTone} shadow-xs`}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
        {icon}
      </div>
      <p className="mt-2 font-mono text-2xl font-bold tracking-tight text-slate-900">{value}</p>
      {sub ? <p className="mt-1 text-xs text-slate-500">{sub}</p> : null}
    </Card>
  );
}

function LinkCard({
  href,
  title,
  value,
  highlight = false,
  badge,
}: {
  href: string;
  title: string;
  value: string;
  highlight?: boolean;
  badge?: string;
}) {
  return (
    <Link href={href} className="group block">
      <Card
        className={`p-5 transition hover:shadow-md ${
          highlight
            ? "border-amber-300 bg-amber-50/30 group-hover:border-amber-400"
            : "hover:border-teal-300"
        }`}
      >
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{title}</p>
          {badge ? (
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                highlight ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600"
              }`}
            >
              {badge}
            </span>
          ) : null}
        </div>
        <p
          className={`mt-2 font-mono text-xl font-bold ${
            highlight ? "text-amber-800" : "text-teal-700"
          }`}
        >
          {value}
        </p>
      </Card>
    </Link>
  );
}

function TrendChart({
  trends,
}: {
  trends: { date: string; label: string; total: number; invoice_count: number }[];
}) {
  const maxTotal = Math.max(...trends.map((t) => Number(t.total) || 0), 100);

  return (
    <div className="space-y-2">
      <div className="flex h-44 items-end gap-2 pt-6 sm:gap-4">
        {trends.map((day) => {
          const val = Number(day.total) || 0;
          const heightPercent = Math.max(Math.round((val / maxTotal) * 100), val > 0 ? 6 : 2);
          const isHighest = val === maxTotal && val > 0;

          return (
            <div key={day.date} className="group relative flex flex-1 flex-col items-center h-full justify-end">
              {/* Tooltip */}
              <div className="pointer-events-none absolute -top-10 z-10 hidden whitespace-nowrap rounded-md bg-slate-900 px-2.5 py-1 text-[11px] font-medium text-white shadow-md group-hover:block">
                <p className="font-semibold">{day.label || day.date}</p>
                <p className="font-mono text-teal-300">{formatBDT(val)}</p>
                <p className="text-[10px] text-slate-300">{day.invoice_count} invoices</p>
              </div>

              {/* Bar */}
              <div
                style={{ height: `${heightPercent}%` }}
                className={`w-full rounded-t-md transition-all duration-300 group-hover:opacity-90 ${
                  isHighest ? "bg-teal-600" : "bg-teal-400/80 hover:bg-teal-500"
                }`}
              />
            </div>
          );
        })}
      </div>

      {/* X-axis labels */}
      <div className="flex items-center gap-2 border-t border-slate-200 pt-2 sm:gap-4">
        {trends.map((day) => (
          <div key={day.date} className="flex-1 text-center">
            <p className="truncate text-[10px] font-medium text-slate-500">
              {day.label ? day.label.split(",")[0] : day.date.slice(5)}
            </p>
            <p className="truncate font-mono text-[10px] text-slate-700">
              {Number(day.total) > 0 ? `${Math.round(Number(day.total) / 1000)}k` : "0"}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function QuickActions() {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Quick Actions</h3>
      <div className="mt-3 flex flex-wrap gap-3">
        <Link
          href="/pos"
          className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-teal-700 transition"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Open POS
        </Link>
        <Link
          href="/sales"
          className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-medium text-slate-700 shadow-2xs hover:bg-slate-50 transition"
        >
          Sales History
        </Link>
        <Link
          href="/products"
          className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-medium text-slate-700 shadow-2xs hover:bg-slate-50 transition"
        >
          Products & Inventory
        </Link>
        <Link
          href="/expenses"
          className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-medium text-slate-700 shadow-2xs hover:bg-slate-50 transition"
        >
          Expenses
        </Link>
        <Link
          href="/reports"
          className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-medium text-slate-700 shadow-2xs hover:bg-slate-50 transition"
        >
          Reports & Analytics
        </Link>
      </div>
    </div>
  );
}
