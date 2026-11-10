"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { LowStockItem } from "@/lib/types";
import { Alert, Btn, PageHeader, TableWrap, Td, Th } from "@/components/ui";
import { formatBDT } from "@/lib/format";

export default function LowStockPage() {
  const router = useRouter();
  const [rows, setRows] = useState<LowStockItem[]>([]);
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [error, setError] = useState("");

  useEffect(() => {
    void api<LowStockItem[]>("/catalog/low-stock").then((data) => {
      setRows(data);
      const init: Record<string, number> = {};
      for (const p of data) init[p.id] = Number(p.suggested_qty) || 1;
      setSelected(init);
    });
  }, []);

  async function createDemand() {
    const items = Object.entries(selected)
      .filter(([, qty]) => qty > 0)
      .map(([product_id, quantity]) => {
        const row = rows.find((r) => r.id === product_id);
        return { product_id, requested_qty: quantity, last_cost: Number(row?.last_cost || 0) };
      });
    if (!items.length) {
      setError("Select quantities for at least one product");
      return;
    }
    try {
      const demand = await api<{ id: string }>("/purchases/demands", {
        method: "POST",
        body: JSON.stringify({ items, notes: "From low stock" }),
      });
      router.push(`/demands/${demand.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  }

  return (
    <div>
      <PageHeader title="Low stock">
        <Btn onClick={() => void createDemand()}>Create purchase demand</Btn>
      </PageHeader>
      {error ? <Alert tone="error">{error}</Alert> : null}
      <TableWrap>
        <thead>
          <tr>
            <Th>Product</Th>
            <Th>On hand</Th>
            <Th>Reorder</Th>
            <Th>Last cost</Th>
            <Th>Order qty</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id}>
              <Td>
                <div className="font-medium">{p.name}</div>
                <div className="font-mono text-xs text-slate-500">{p.sku}</div>
              </Td>
              <Td className="font-mono">{Number(p.current_qty)}</Td>
              <Td className="font-mono">{Number(p.reorder_level)}</Td>
              <Td className="font-mono">{formatBDT(p.last_cost)}</Td>
              <Td>
                <input
                  type="number"
                  min={0}
                  className="w-20 rounded border border-slate-300 px-2 py-1"
                  value={selected[p.id] ?? Number(p.suggested_qty)}
                  onChange={(e) => setSelected({ ...selected, [p.id]: Number(e.target.value) || 0 })}
                />
              </Td>
            </tr>
          ))}
          {!rows.length ? (
            <tr>
              <Td className="text-slate-500">No low-stock items</Td>
            </tr>
          ) : null}
        </tbody>
      </TableWrap>
    </div>
  );
}
