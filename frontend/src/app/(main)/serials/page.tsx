"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Product, Serial } from "@/lib/types";
import { Alert, Btn, Field, Input, Modal, PageHeader, Select, TableWrap, Td, Th } from "@/components/ui";

export default function SerialsPage() {
  const [rows, setRows] = useState<Serial[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ product_id: "", serial_numbers: "" });
  const [error, setError] = useState("");

  async function load() {
    setRows(await api<Serial[]>("/catalog/serials"));
  }

  useEffect(() => {
    void load();
    void api<Product[]>("/catalog/products").then(setProducts);
  }, []);

  async function create() {
    setError("");
    try {
      const serial_numbers = form.serial_numbers
        .split(/[\n,]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      await api("/catalog/serials", {
        method: "POST",
        body: JSON.stringify({ product_id: form.product_id, serial_numbers }),
      });
      setOpen(false);
      setForm({ product_id: "", serial_numbers: "" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  }

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
      <Modal open={open} onClose={() => setOpen(false)} title="New serial(s)">
        <Field label="Product">
          <Select value={form.product_id} onChange={(e) => setForm({ ...form, product_id: e.target.value })}>
            <option value="">Select…</option>
            {products
              .filter((p) => p.serial_required)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
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
          />
        </Field>
        <Btn className="mt-3" onClick={() => void create()}>
          Save
        </Btn>
      </Modal>
    </div>
  );
}
