"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Product, Serial, PaginatedResponse } from "@/lib/types";
import { Alert, Btn, Field, Input, Modal, PageHeader, Select, TableWrap, Td, Th, Pagination } from "@/components/ui";

export default function SerialsPage() {
  const [rows, setRows] = useState<Serial[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [productFilter, setProductFilter] = useState("");
  const PAGE_SIZE = 10;
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ product_id: "", serial_numbers: "" });

  const [error, setError] = useState("");

  async function load(p = page) {
    const qs = new URLSearchParams({
      page: String(p),
      limit: String(PAGE_SIZE),
    });
    const data = await api<PaginatedResponse<Serial>>(`/catalog/serials?${qs}`);
    setRows(data.items);
    setTotal(data.total);
    setTotalPages(data.totalPages);
    setPage(data.page);
  }

  async function loadProductsList() {
    try {
      const res = await api<Product[] | PaginatedResponse<Product>>("/catalog/products");
      const list = Array.isArray(res) ? res : res?.items || [];
      setProducts(list);
    } catch {
      setProducts([]);
    }
  }

  useEffect(() => {
    void load(1);
    void loadProductsList();
  }, []);

  async function create() {
    setError("");
    if (!form.product_id) {
      setError("Please select a product");
      return;
    }
    try {
      const serial_numbers = form.serial_numbers
        .split(/[\n,]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (!serial_numbers.length) {
        setError("Please enter at least one serial number");
        return;
      }
      await api("/catalog/serials", {
        method: "POST",
        body: JSON.stringify({ product_id: form.product_id, serial_numbers }),
      });
      setOpen(false);
      setForm({ product_id: "", serial_numbers: "" });
      setProductFilter("");
      await load();
      await loadProductsList();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  }

  const filteredProducts = products.filter((p) => {
    if (!productFilter.trim()) return true;
    const term = productFilter.toLowerCase().trim();
    return (
      p.name.toLowerCase().includes(term) ||
      (p.sku && p.sku.toLowerCase().includes(term)) ||
      (p.barcode && p.barcode.toLowerCase().includes(term))
    );
  });

  return (
    <div>
      <PageHeader title="Serial numbers">
        <Btn onClick={() => setOpen(true)}>Register serial</Btn>
      </PageHeader>
      {error ? <Alert tone="error">{error}</Alert> : null}
      <TableWrap>
        <thead>
          <tr>
            <Th>Serial</Th>
            <Th>Product</Th>
            <Th>Status</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.id}>
              <Td className="font-mono">{s.serial_number}</Td>
              <Td>{s.product_name}</Td>
              <Td>{s.status}</Td>
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
      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
          setProductFilter("");
        }}
        title="New serial(s)"
      >
        <Field label="Filter product">
          <Input
            placeholder="Type name or SKU to filter..."
            value={productFilter}
            onChange={(e) => setProductFilter(e.target.value)}
          />
        </Field>
        <Field label="Product">
          <Select value={form.product_id} onChange={(e) => setForm({ ...form, product_id: e.target.value })}>
            <option value="">
              Select product ({filteredProducts.length} available)…
            </option>
            {filteredProducts.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} {p.sku ? `(${p.sku})` : ""}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Serial numbers (comma or newline)">
          <textarea
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            rows={4}
            value={form.serial_numbers}
            onChange={(e) => setForm({ ...form, serial_numbers: e.target.value })}
            placeholder="SN1001&#10;SN1002&#10;SN1003"
          />
        </Field>
        <Btn className="mt-3" onClick={() => void create()}>
          Save
        </Btn>
      </Modal>
    </div>
  );
}
