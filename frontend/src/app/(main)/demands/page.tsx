"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type { PurchaseDemand, PaginatedResponse } from "@/lib/types";
import { PageHeader, TableWrap, Td, Th, Pagination } from "@/components/ui";
import { formatDateTime } from "@/lib/format";

const PAGE_SIZE = 20;

export default function DemandsPage() {
  const [rows, setRows] = useState<PurchaseDemand[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  async function load(p = page) {
    const qs = new URLSearchParams({
      page: String(p),
      limit: String(PAGE_SIZE),
    });
    const data = await api<PaginatedResponse<PurchaseDemand>>(`/purchases/demands?${qs}`);
    setRows(data.items);
    setTotal(data.total);
    setTotalPages(data.totalPages);
    setPage(data.page);
  }

  useEffect(() => {
    void load(1);
  }, []);

  return (
    <div>
      <PageHeader title="Purchase demands" />
      <TableWrap>
        <thead>
          <tr>
            <Th>ID</Th>
            <Th>Status</Th>
            <Th>Created</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {rows.map((d) => (
            <tr key={d.id}>
              <Td className="font-mono text-xs">{d.id.slice(0, 8)}</Td>
              <Td>{d.status}</Td>
              <Td>{formatDateTime(d.created_at)}</Td>
              <Td>
                <Link href={`/demands/${d.id}`} className="text-teal-700 underline">
                  View
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
        onPage={(p) => {
          setPage(p);
          void load(p);
        }}
      />
    </div>
  );
}
