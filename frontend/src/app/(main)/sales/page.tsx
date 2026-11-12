"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type { PaginatedResponse, Sale } from "@/lib/types";
import { Field, Input, PageHeader, Pagination, TableWrap, Td, Th } from "@/components/ui";
import { formatBDT, formatDate } from "@/lib/format";
import { useTodayState } from "@/lib/use-client-date";

const PAGE_SIZE = 20;

export default function SalesPage() {
  const [rows, setRows] = useState<Sale[]>([]);
  const [from, setFrom] = useTodayState();
  const [to, setTo] = useTodayState();
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  async function load(p = page) {
    if (!from || !to) return;
    const qs = new URLSearchParams({ from, to, page: String(p), limit: String(PAGE_SIZE) });
    if (q) qs.set("q", q);
    const data = await api<PaginatedResponse<Sale>>(`/sales?${qs}`);
    setRows(data.items);
    setTotal(data.total);
    setTotalPages(data.totalPages);
    setPage(data.page);
  }

  useEffect(() => {
    setPage(1);
    void load(1);
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
      <Pagination
        page={page}
        totalPages={totalPages}
        total={total}
        limit={PAGE_SIZE}
        onPage={(p) => { setPage(p); void load(p); }}
      />
    </div>
  );
}
