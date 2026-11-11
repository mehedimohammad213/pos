"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BarcodeInputs } from "@/components/BarcodeInputs";
import { ProductLabelPrint, ProductLabelsPrint } from "@/components/ProductLabel";
import { Alert, Btn, Field, Input, Modal, PageHeader, Select, TableWrap, Td, Th } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatBDT } from "@/lib/format";
import type { Brand, Category, Product } from "@/lib/types";

const emptyForm = {
  name: "",
  sku: "",
  barcode: "",
  category_id: "",
  brand_id: "",
  retail_price: "",
  wholesale_price: "",
  cost: "",
  reorder_level: "5",
  serial_required: false,
  initial_qty: "0",
};

export default function ProductsPage() {
  const { canSeeCost } = useAuth();
  const [rows, setRows] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [q, setQ] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [adjust, setAdjust] = useState<{ id: string; qty: string; note: string } | null>(null);
  const [label, setLabel] = useState<Product | null>(null);
  const [printLabels, setPrintLabels] = useState<Product[] | null>(null);
  const [autoPrint, setAutoPrint] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  async function load() {
    const qs = new URLSearchParams();
    if (q) qs.set("q", q);
    qs.set("include_inactive", "1");
    setRows(await api<Product[]>(`/catalog/products?${qs}`));
  }

  useEffect(() => {
    void load();
    void api<Category[]>("/catalog/categories").then(setCategories);
    void api<Brand[]>("/catalog/brands").then(setBrands);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void load(), 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    setSelected((prev) => {
      const ids = new Set(rows.map((p) => p.id));
      const next = new Set<string>();
      for (const id of prev) if (ids.has(id)) next.add(id);
      return next;
    });
  }, [rows]);

  const allSelected = rows.length > 0 && selected.size === rows.length;
  const someSelected = selected.size > 0 && selected.size < rows.length;

  const selectedProducts = useMemo(
    () => rows.filter((p) => selected.has(p.id)),
    [rows, selected]
  );

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

  useEffect(() => {
    if (!autoPrint || !printLabels?.length) return;
    const t = window.setTimeout(() => {
      window.print();
      setAutoPrint(false);
    }, 300);
    return () => window.clearTimeout(t);
  }, [autoPrint, printLabels]);

  function openBarcodePrint(products: Product[], printNow = false) {
    if (!products.length) {
      setError("No products to print");
      return;
    }
    setLabel(null);
    setError("");
    setPrintLabels(products);
    setAutoPrint(printNow);
  }

  function printBarcodes() {
    if (!selected.size) {
      setError("Select products with the checkbox first");
      return;
    }
    openBarcodePrint(selectedProducts, true);
  }

  async function save() {
    setError("");
    try {
      const body = {
        name: form.name,
        sku: form.sku,
        barcode: form.barcode,
        retail_price: Number(form.retail_price),
        wholesale_price: form.wholesale_price ? Number(form.wholesale_price) : 0,
        cost: form.cost ? Number(form.cost) : 0,
        reorder_level: Number(form.reorder_level) || 0,
        category_id: form.category_id || undefined,
        brand_id: form.brand_id || undefined,
        serial_required: form.serial_required,
        initial_qty: editId ? undefined : Number(form.initial_qty) || 0,
      };
      if (editId) await api(`/catalog/products/${editId}`, { method: "PATCH", body: JSON.stringify(body) });
      else await api("/catalog/products", { method: "POST", body: JSON.stringify(body) });
      setOpen(false);
      setForm(emptyForm);
      setEditId(null);
      setMsg("Saved");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    }
  }

  async function doAdjust() {
    if (!adjust) return;
    await api("/catalog/stock/adjust", {
      method: "POST",
      body: JSON.stringify({
        product_id: adjust.id,
        quantity_change: Number(adjust.qty),
        reason: adjust.note || "Manual adjust",
      }),
    });
    setAdjust(null);
    await load();
  }

  function startEdit(p: Product) {
    setEditId(p.id);
    setForm({
      name: p.name,
      sku: p.sku || "",
      barcode: p.barcode || "",
      category_id: p.category_id || "",
      brand_id: p.brand_id || "",
      retail_price: String(p.retail_price),
      wholesale_price: p.wholesale_price != null ? String(p.wholesale_price) : "",
      cost: p.cost != null ? String(p.cost) : "",
      reorder_level: String(p.reorder_level ?? 5),
      serial_required: !!p.serial_required,
      initial_qty: "0",
    });
    setOpen(true);
  }

  return (
    <div>
      <div className="no-print">
      <PageHeader title="Products">
        <Btn
          variant="secondary"
          onClick={printBarcodes}
          disabled={!selected.size}
          title={selected.size ? `Print ${selected.size} selected barcode(s)` : "Select products first"}
        >
          {selected.size ? `Print barcodes (${selected.size})` : "Print barcodes"}
        </Btn>
        <Link href="/products/new">
          <Btn>Add product</Btn>
        </Link>
      </PageHeader>
      {error ? <Alert tone="error">{error}</Alert> : null}
      {msg ? <Alert tone="success">{msg}</Alert> : null}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Input className="max-w-md" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
        {selected.size > 0 ? (
          <span className="text-sm text-slate-600">
            {selected.size} selected
            <button type="button" className="ml-2 text-teal-700 hover:underline" onClick={() => setSelected(new Set())}>
              Clear
            </button>
          </span>
        ) : (
          <span className="text-sm text-slate-500">Check products, then Print barcodes</span>
        )}
      </div>
      <TableWrap>
        <thead>
          <tr>
            <Th>
              <input
                type="checkbox"
                aria-label="Select all products"
                checked={allSelected}
                ref={(el) => {
                  if (el) el.indeterminate = someSelected;
                }}
                onChange={toggleAll}
                disabled={!rows.length}
              />
            </Th>
            <Th>Name</Th>
            <Th>SKU</Th>
            <Th>Barcode</Th>
            <Th>Stock</Th>
            <Th>Retail</Th>
            {canSeeCost ? <Th>Cost</Th> : null}
            <Th />
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id} className={selected.has(p.id) ? "bg-teal-50/60" : undefined}>
              <Td>
                <input
                  type="checkbox"
                  aria-label={`Select ${p.name}`}
                  checked={selected.has(p.id)}
                  onChange={() => toggleOne(p.id)}
                />
              </Td>
              <Td>{p.name}</Td>
              <Td className="font-mono text-xs">{p.sku}</Td>
              <Td className="font-mono text-xs">{p.barcode || "—"}</Td>
              <Td className="font-mono">{Number(p.stock_qty ?? 0)}</Td>
              <Td className="font-mono">{formatBDT(p.retail_price)}</Td>
              {canSeeCost ? <Td className="font-mono">{formatBDT(p.cost)}</Td> : null}
              <Td>
                <div className="flex gap-1">
                  <Btn variant="ghost" className="px-2 py-1 text-xs" onClick={() => startEdit(p)}>
                    Edit
                  </Btn>
                  <Btn
                    variant="ghost"
                    className="px-2 py-1 text-xs"
                    onClick={() => setAdjust({ id: p.id, qty: "0", note: "" })}
                  >
                    Stock
                  </Btn>
                  <Btn
                    variant="ghost"
                    className="px-2 py-1 text-xs"
                    onClick={() => {
                      setPrintLabels(null);
                      setLabel(p);
                    }}
                  >
                    Label
                  </Btn>
                </div>
              </Td>
            </tr>
          ))}
        </tbody>
      </TableWrap>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={editId ? "Edit product" : "New product"} wide>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="SKU">
            <Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
          </Field>
          <div className="sm:col-span-2">
            <BarcodeInputs
              barcode={form.barcode}
              onChange={(b) => setForm((prev) => ({ ...prev, barcode: b }))}
              excludeProductId={editId ?? undefined}
            />
          </div>
          <Field label="Category">
            <Select value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
              <option value="">—</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Brand">
            <Select value={form.brand_id} onChange={(e) => setForm({ ...form, brand_id: e.target.value })}>
              <option value="">—</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Retail price">
            <Input value={form.retail_price} onChange={(e) => setForm({ ...form, retail_price: e.target.value })} />
          </Field>
          <Field label="Wholesale">
            <Input
              value={form.wholesale_price}
              onChange={(e) => setForm({ ...form, wholesale_price: e.target.value })}
            />
          </Field>
          {canSeeCost ? (
            <Field label="Cost">
              <Input value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} />
            </Field>
          ) : null}
          <Field label="Reorder level">
            <Input value={form.reorder_level} onChange={(e) => setForm({ ...form, reorder_level: e.target.value })} />
          </Field>
          {!editId ? (
            <Field label="Initial qty">
              <Input value={form.initial_qty} onChange={(e) => setForm({ ...form, initial_qty: e.target.value })} />
            </Field>
          ) : null}
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              checked={form.serial_required}
              onChange={(e) => setForm({ ...form, serial_required: e.target.checked })}
            />
            Track serial numbers
          </label>
        </div>
        <Btn className="mt-4" onClick={() => void save()}>
          Save
        </Btn>
      </Modal>

      <Modal open={!!adjust} onClose={() => setAdjust(null)} title="Adjust stock">
        {adjust ? (
          <>
            <Field label="Quantity change (+/-)">
              <Input value={adjust.qty} onChange={(e) => setAdjust({ ...adjust, qty: e.target.value })} />
            </Field>
            <Field label="Reason">
              <Input value={adjust.note} onChange={(e) => setAdjust({ ...adjust, note: e.target.value })} />
            </Field>
            <Btn className="mt-3" onClick={() => void doAdjust()}>
              Apply
            </Btn>
          </>
        ) : null}
      </Modal>

      {label ? (
        <>
          <div className="no-print mt-6 flex flex-wrap items-center gap-2">
            <Btn onClick={() => window.print()}>Print label</Btn>
            <Btn variant="ghost" onClick={() => setLabel(null)}>
              Close preview
            </Btn>
          </div>
          <ProductLabelPrint
            name={label.name}
            barcode={label.barcode}
            sku={label.sku}
            price={Number(label.retail_price)}
          />
        </>
      ) : null}

      {printLabels ? (
        <>
          <div className="no-print mt-6 flex flex-wrap items-center gap-2">
            <Btn onClick={() => window.print()}>
              Print {printLabels.length} barcode{printLabels.length === 1 ? "" : "s"}
            </Btn>
            <Btn variant="ghost" onClick={() => setPrintLabels(null)}>
              Close preview
            </Btn>
            <span className="text-sm text-slate-600">
              {printLabels.length} product label{printLabels.length === 1 ? "" : "s"} ready
            </span>
          </div>
          <ProductLabelsPrint
            items={printLabels.map((p) => ({
              name: p.name,
              barcode: p.barcode,
              sku: p.sku,
              price: Number(p.retail_price),
            }))}
          />
        </>
      ) : null}
    </div>
  );
}
