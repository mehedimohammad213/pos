"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type { PurchaseDemand } from "@/lib/types";
import { PageHeader, TableWrap, Td, Th } from "@/components/ui";
import { formatDateTime } from "@/lib/format";

export default function DemandsPage() {
  const [rows, setRows] = useState<PurchaseDemand[]>([]);

  useEffect(() => {
    void api<PurchaseDemand[]>("/purchases/demands").then(setRows);
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
    </div>
  );
}
