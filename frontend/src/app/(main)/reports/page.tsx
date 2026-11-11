"use client";

import { useEffect, useState } from "react";
import { api, apiText } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Alert, Btn, Field, Input, PageHeader, Select, TableWrap, Td, Th } from "@/components/ui";
import { formatBDT } from "@/lib/format";
import { useTodayState } from "@/lib/use-client-date";

type ReportRow = Record<string, string | number>;

export default function ReportsPage() {
  const { canSeeCost, hasPermission } = useAuth();
  const [kind, setKind] = useState<"sales" | "profit" | "stock-valuation" | "exchanges" | "audit">("sales");
  const [from, setFrom] = useTodayState();
  const [to, setTo] = useTodayState();
  const [groupBy, setGroupBy] = useState("product");
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [error, setError] = useState("");

  async function load() {
    setError("");
    try {
      if (kind === "sales") {
        const qs = new URLSearchParams({ from, to, group_by: groupBy });
        setRows(await api<ReportRow[]>(`/reports/sales?${qs}`));
      } else if (kind === "profit") {
        setRows(await api<ReportRow[]>(`/reports/profit?from=${from}&to=${to}`));
      } else if (kind === "stock-valuation") {
        const data = await api<ReportRow | ReportRow[]>("/reports/stock-valuation");
        setRows(Array.isArray(data) ? data : [data]);
      } else if (kind === "exchanges") {
        setRows(await api<ReportRow[]>(`/reports/exchanges?from=${from}&to=${to}`));
      } else if (kind === "audit") {
        setRows(await api<ReportRow[]>("/reports/audit"));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
      setRows([]);
    }
  }

  useEffect(() => {
    if (kind !== "stock-valuation" && kind !== "audit" && (!from || !to)) return;
    void load();
  }, [kind, from, to, groupBy]);

  async function downloadCsv() {
    if (kind !== "sales") return;
    const qs = new URLSearchParams({ from, to, group_by: groupBy, format: "csv" });
    const text = await apiText(`/reports/sales?${qs}`);
    const blob = new Blob([text], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sales-${from}-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const columns = rows[0] ? Object.keys(rows[0]) : [];

  return (
    <div>
      <PageHeader title="Reports">
        {kind === "sales" ? (
          <Btn variant="secondary" onClick={() => void downloadCsv()}>
            Download CSV
          </Btn>
        ) : null}
      </PageHeader>
      {error ? <Alert tone="error">{error}</Alert> : null}
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Field label="Report">
          <Select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
            <option value="sales">Sales</option>
            {canSeeCost ? <option value="profit">Profit</option> : null}
            {canSeeCost ? <option value="stock-valuation">Stock valuation</option> : null}
            <option value="exchanges">Exchanges</option>
            {hasPermission("manage_users") ? <option value="audit">Audit log</option> : null}
          </Select>
        </Field>
        {kind !== "stock-valuation" && kind !== "audit" ? (
          <>
            <Field label="From">
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </Field>
            <Field label="To">
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </Field>
          </>
        ) : null}
        {kind === "sales" ? (
          <Field label="Group by">
            <Select value={groupBy} onChange={(e) => setGroupBy(e.target.value)}>
              <option value="product">Product</option>
              <option value="category">Category</option>
              <option value="brand">Brand</option>
              <option value="cashier">Cashier</option>
            </Select>
          </Field>
        ) : null}
      </div>

      <TableWrap>
        <thead>
          <tr>
            {columns.map((c) => (
              <Th key={c}>{c}</Th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {columns.map((c) => (
                <Td key={c} className={typeof row[c] === "number" ? "font-mono" : ""}>
                  {typeof row[c] === "number" && String(c).includes("total") ? formatBDT(row[c]) : String(row[c] ?? "")}
                </Td>
              ))}
            </tr>
          ))}
        </tbody>
      </TableWrap>
    </div>
  );
}
