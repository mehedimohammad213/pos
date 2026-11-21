"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { LowStockItem } from "@/lib/types";
import { Alert, Btn, PageHeader, TableWrap, Td, Th, Pagination } from "@/components/ui";
import { formatBDT } from "@/lib/format";

export default function LowStockPage() {
  const router = useRouter();
  const PAGE_SIZE = 10;
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<LowStockItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const paginatedRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const allSelected = rows.length > 0 && selected.size === rows.length;
  const someSelected = selected.size > 0 && selected.size < rows.length;

  useEffect(() => {
    void api<LowStockItem[]>("/catalog/low-stock").then((data) => {
      setRows(data);
      const initQty: Record<string, number> = {};
      for (const p of data) initQty[p.id] = Number(p.suggested_qty) || 1;
      setQuantities(initQty);
      setSelected(new Set());
    });
  }, []);

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(rows.map((p) => p.id)));
  }

  async function createDemand() {
    const items = rows
      .filter((r) => selected.has(r.id))
      .map((r) => ({
        product_id: r.id,
        requested_qty: quantities[r.id] ?? (Number(r.suggested_qty) || 1),
        last_cost: Number(r.last_cost || 0),
      }))
      .filter((item) => item.requested_qty > 0);

    if (!selected.size) {
      setError("Select at least one product with the checkbox");
      return;
    }
    if (!items.length) {
      setError("Selected products need an order quantity greater than 0");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const demand = await api<{ id: string }>("/purchases/demands", {
        method: "POST",
        body: JSON.stringify({ items, notes: "From low stock" }),
      });
      router.push(`/demands/${demand.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader title="Low Stock Alert">
        <Btn onClick={() => void createDemand()} disabled={!selected.size || saving}>
          {saving
            ? "Creating…"
            : selected.size
              ? (
                <>
                  <span className="sm:hidden">Demand ({selected.size})</span>
                  <span className="hidden sm:inline">Create Purchase Demand ({selected.size})</span>
                </>
              )
              : (
                <>
                  <span className="sm:hidden">Create Demand</span>
                  <span className="hidden sm:inline">Create Purchase Demand</span>
                </>
              )}
        </Btn>
      </PageHeader>
      {error ? <Alert tone="error">{error}</Alert> : null}
      <div className="mb-2 text-sm text-slate-600">
        {selected.size > 0 ? (
          <span>
            {selected.size} selected
            <button
              type="button"
              className="ml-2 text-teal-700 hover:underline"
              onClick={() => setSelected(new Set())}
            >
              Clear
            </button>
          </span>
        ) : (
          <span className="text-slate-500">Check items, then create purchase demand</span>
        )}
      </div>
      <TableWrap>
        <thead>
          <tr>
            <Th>
              <input
                type="checkbox"
                aria-label="Select all low-stock products"
                checked={allSelected}
                ref={(el) => {
                  if (el) el.indeterminate = someSelected;
                }}
                onChange={toggleAll}
                disabled={!rows.length}
              />
            </Th>
            <Th>Product</Th>
            <Th>On hand</Th>
            <Th className="hidden sm:table-cell">Reorder</Th>
            <Th className="hidden md:table-cell">Last cost</Th>
            <Th>Order qty</Th>
          </tr>
        </thead>
        <tbody>
          {paginatedRows.map((p) => (
            <tr key={p.id} className={selected.has(p.id) ? "bg-teal-50/60" : undefined}>
              <Td>
                <input
                  type="checkbox"
                  aria-label={`Select ${p.name}`}
                  checked={selected.has(p.id)}
                  onChange={() => toggleOne(p.id)}
                />
              </Td>
              <Td className="max-w-[11rem]">
                <div className="truncate font-medium">{p.name}</div>
                <div className="truncate font-mono text-xs text-slate-500">{p.sku}</div>
              </Td>
              <Td className="font-mono">{Number(p.current_qty)}</Td>
              <Td className="hidden font-mono sm:table-cell">{Number(p.reorder_level)}</Td>
              <Td className="hidden font-mono md:table-cell">{formatBDT(p.last_cost)}</Td>
              <Td>
                <input
                  type="number"
                  min={0}
                  className="w-20 rounded border border-slate-300 px-2 py-1"
                  value={quantities[p.id] ?? Number(p.suggested_qty)}
                  onChange={(e) =>
                    setQuantities({ ...quantities, [p.id]: Number(e.target.value) || 0 })
                  }
                />
              </Td>
            </tr>
          ))}
          {!rows.length ? (
            <tr>
              <Td className="text-slate-500" colSpan={6}>
                No low-stock items
              </Td>
            </tr>
          ) : null}
        </tbody>
      </TableWrap>
      <Pagination
        page={page}
        totalPages={totalPages}
        total={total}
        limit={PAGE_SIZE}
        onPage={(p) => setPage(p)}
      />
    </div>
  );
}
