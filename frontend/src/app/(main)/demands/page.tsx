"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { Product, PurchaseDemand, Supplier, PaginatedResponse } from "@/lib/types";
import { Alert, Btn, Field, Input, Modal, PageHeader, Select, TableWrap, Td, Th, Pagination } from "@/components/ui";
import { formatDateTime, todayISO } from "@/lib/format";

const PAGE_SIZE = 20;

type DemandLine = { product_id: string; quantity: string; last_cost: string };

export default function DemandsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<PurchaseDemand[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    demand_date: "",
    preferred_supplier_id: "",
    notes: "",
    lines: [{ product_id: "", quantity: "1", last_cost: "" }] as DemandLine[],
  });

  async function load(p = page, search = q) {
    const qs = new URLSearchParams({
      page: String(p),
      limit: String(PAGE_SIZE),
    });
    if (search.trim()) qs.set("q", search.trim());
    const data = await api<PaginatedResponse<PurchaseDemand>>(`/purchases/demands?${qs}`);
    setRows(data.items);
    setTotal(data.total);
    setTotalPages(data.totalPages);
    setPage(data.page);
  }

  useEffect(() => {
    void api<Product[]>("/catalog/products").then((data) => {
      setProducts(Array.isArray(data) ? data : (data as PaginatedResponse<Product>).items || []);
    });
    void api<Supplier[]>("/purchases/suppliers").then((data) => {
      setSuppliers(Array.isArray(data) ? data : (data as PaginatedResponse<Supplier>).items || []);
    });
    setForm((f) => (f.demand_date ? f : { ...f, demand_date: todayISO() }));
  }, []);

  useEffect(() => {
    setPage(1);
    const t = setTimeout(() => void load(1, q), 300);
    return () => clearTimeout(t);
  }, [q]);

  function openCreate() {
    setError("");
    setForm({
      demand_date: todayISO(),
      preferred_supplier_id: "",
      notes: "",
      lines: [{ product_id: "", quantity: "1", last_cost: "" }],
    });
    setOpen(true);
  }

  function updateLine(i: number, patch: Partial<DemandLine>) {
    const lines = [...form.lines];
    lines[i] = { ...lines[i], ...patch };
    setForm({ ...form, lines });
  }

  function onProductChange(i: number, productId: string) {
    const product = products.find((p) => p.id === productId);
    updateLine(i, {
      product_id: productId,
      last_cost: product?.cost != null ? String(product.cost) : form.lines[i].last_cost,
    });
  }

  async function createDemand() {
    const items = form.lines
      .filter((l) => l.product_id && Number(l.quantity) > 0)
      .map((l) => ({
        product_id: l.product_id,
        requested_qty: Number(l.quantity),
        last_cost: l.last_cost ? Number(l.last_cost) : undefined,
      }));
    if (!items.length) {
      setError("Add at least one product line");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const demand = await api<PurchaseDemand>("/purchases/demands", {
        method: "POST",
        body: JSON.stringify({
          demand_date: form.demand_date || undefined,
          preferred_supplier_id: form.preferred_supplier_id || undefined,
          notes: form.notes || undefined,
          items,
        }),
      });
      setOpen(false);
      router.push(`/demands/${demand.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create demand");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader title="Purchase demands">
        <Btn onClick={openCreate}>New demand</Btn>
      </PageHeader>
      {error && !open ? <Alert tone="error">{error}</Alert> : null}
      <Input
        className="mb-4 max-w-md"
        placeholder="Search demand #, product, status, supplier…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <TableWrap>
        <thead>
          <tr>
            <Th>Demand #</Th>
            <Th>Products</Th>
            <Th>Status</Th>
            <Th className="hidden sm:table-cell">Supplier</Th>
            <Th className="hidden md:table-cell">Created</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {rows.map((d) => (
            <tr key={d.id}>
              <Td className="font-mono text-xs">{d.demand_no || d.id.slice(0, 8)}</Td>
              <Td>
                <div className="max-w-[10rem] truncate text-sm sm:max-w-xs" title={d.product_names || undefined}>
                  {d.product_names || "—"}
                </div>
                {d.item_count != null && d.item_count > 0 ? (
                  <div className="text-xs text-slate-500">{d.item_count} item{d.item_count === 1 ? "" : "s"}</div>
                ) : null}
                <div className="mt-0.5 text-[11px] text-slate-500 md:hidden">{formatDateTime(d.created_at)}</div>
              </Td>
              <Td>{d.status}</Td>
              <Td className="hidden sm:table-cell">{d.supplier_name || "—"}</Td>
              <Td className="hidden md:table-cell">{formatDateTime(d.created_at)}</Td>
              <Td>
                <Link href={`/demands/${d.id}`} className="text-teal-700 underline">
                  View
                </Link>
              </Td>
            </tr>
          ))}
          {!rows.length ? (
            <tr>
              <Td className="text-slate-500">No demands yet. Create one to request stock, then convert it to a purchase.</Td>
            </tr>
          ) : null}
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

      <Modal open={open} onClose={() => setOpen(false)} title="New purchase demand" wide>
        {error ? <Alert tone="error">{error}</Alert> : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Date">
            <Input
              type="date"
              value={form.demand_date}
              onChange={(e) => setForm({ ...form, demand_date: e.target.value })}
            />
          </Field>
          <Field label="Preferred supplier">
            <Select
              value={form.preferred_supplier_id}
              onChange={(e) => setForm({ ...form, preferred_supplier_id: e.target.value })}
            >
              <option value="">—</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Notes" className="sm:col-span-2">
            <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Field>
        </div>
        <div className="mt-4 space-y-2">
          {form.lines.map((line, i) => (
            <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <Select value={line.product_id} onChange={(e) => onProductChange(i, e.target.value)}>
                <option value="">Product</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.sku ? ` (${p.sku})` : ""}
                  </option>
                ))}
              </Select>
              <Input
                placeholder="Qty"
                value={line.quantity}
                onChange={(e) => updateLine(i, { quantity: e.target.value })}
              />
              <Input
                placeholder="Est. unit cost"
                value={line.last_cost}
                onChange={(e) => updateLine(i, { last_cost: e.target.value })}
              />
            </div>
          ))}
          <Btn
            variant="secondary"
            className="text-xs"
            onClick={() =>
              setForm({
                ...form,
                lines: [...form.lines, { product_id: "", quantity: "1", last_cost: "" }],
              })
            }
          >
            + Line
          </Btn>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Btn disabled={saving} onClick={() => void createDemand()}>
            {saving ? "Saving…" : "Create demand"}
          </Btn>
          <Btn variant="secondary" onClick={() => setOpen(false)}>
            Cancel
          </Btn>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          After creating, open the demand and use Convert to purchase to place the order.
        </p>
      </Modal>
    </div>
  );
}
