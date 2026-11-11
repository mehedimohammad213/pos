"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type { Sale } from "@/lib/types";
import { Field, Input, PageHeader, TableWrap, Td, Th } from "@/components/ui";
import { formatBDT, formatDate } from "@/lib/format";
import { useTodayState } from "@/lib/use-client-date";

export default function SalesPage() {
  const [rows, setRows] = useState<Sale[]>([]);
  const [from, setFrom] = useTodayState();
  const [to, setTo] = useTodayState();
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!from || !to) return;
    const qs = new URLSearchParams({ from, to });
    if (q) qs.set("q", q);
    void api<Sale[]>(`/sales?${qs}`).then(setRows);
  }, [from, to, q]);

  return (
    <div>
      <PageHeader title="Sales" />
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Field label="From">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="To">
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
        <Field label="Search">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Invoice, customer…" />
        </Field>
      </div>
      <TableWrap>
        <thead>
          <tr>
            <Th>Invoice</Th>
            <Th>Date</Th>
            <Th>Customer</Th>
            <Th>Total</Th>
            <Th>Status</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.id}>
              <Td className="font-mono">{s.invoice_no || s.id.slice(0, 8)}</Td>
              <Td>{formatDate(s.sale_date)}</Td>
              <Td>{s.customer_name || "—"}</Td>
              <Td className="font-mono">{formatBDT(s.total)}</Td>
              <Td>{s.status}</Td>
              <Td>
                <Link href={`/sales/${s.id}`} className="text-teal-700 underline">
                  Open
                </Link>
              </Td>
            </tr>
          ))}
        </tbody>
      </TableWrap>
    </div>
  );
}
