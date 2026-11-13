"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { Product, Serial, PaginatedResponse } from "@/lib/types";
import { Alert, Btn, Field, Modal, PageHeader, TableWrap, Td, Th, Pagination } from "@/components/ui";

export default function SerialsPage() {
  const [rows, setRows] = useState<Serial[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
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
      await load();
      await loadProductsList();
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
        }}
        title="New serial(s)"
      >
        <div className="space-y-4">
          <Field label="Product">
            <SearchableProductSelect
              products={products}
              selectedId={form.product_id}
              onSelect={(id) => setForm({ ...form, product_id: id })}
            />
          </Field>

          <Field label="Serial numbers (comma or newline)">
            <textarea
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
              rows={4}
              value={form.serial_numbers}
              onChange={(e) => setForm({ ...form, serial_numbers: e.target.value })}
              placeholder="SN1001&#10;SN1002&#10;SN1003"
            />
          </Field>

          <Btn className="w-full py-2.5" onClick={() => void create()}>
            Save Serials
          </Btn>
        </div>
      </Modal>
    </div>
  );
}

function SearchableProductSelect({
  products,
  selectedId,
  onSelect,
}: {
  products: Product[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedProduct = products.find((p) => p.id === selectedId);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filtered = products.filter((p) => {
    if (!search.trim()) return true;
    const term = search.toLowerCase().trim();
    return (
      p.name.toLowerCase().includes(term) ||
      (p.sku && p.sku.toLowerCase().includes(term)) ||
      (p.barcode && p.barcode.toLowerCase().includes(term))
    );
  });

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => {
          setIsOpen(!isOpen);
          setTimeout(() => inputRef.current?.focus(), 50);
        }}
        className="flex w-full items-center justify-between rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-left text-sm text-slate-800 shadow-sm focus:border-teal-500 focus:outline-none"
      >
        <span className={selectedProduct ? "font-medium text-slate-900" : "text-slate-400"}>
          {selectedProduct
            ? `${selectedProduct.name} ${selectedProduct.sku ? `(${selectedProduct.sku})` : ""}`
            : "Click to search & select product..."}
        </span>
        <span className="ml-2 text-xs text-slate-400">▼</span>
      </button>

      {/* Dropdown panel with search field */}
      {isOpen && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
          <div className="mb-2">
            <input
              ref={inputRef}
              type="text"
              placeholder="Search product by name, SKU, or barcode..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm text-black outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
            />
          </div>

          <div className="max-h-56 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="py-3 text-center text-xs text-slate-500">
                No products found matching &quot;{search}&quot;
              </div>
            ) : (
              filtered.map((p) => {
                const isSelected = p.id === selectedId;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      onSelect(p.id);
                      setIsOpen(false);
                      setSearch("");
                    }}
                    className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition ${
                      isSelected
                        ? "bg-teal-50 font-medium text-teal-800"
                        : "text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    <div>
                      <p>{p.name}</p>
                      {p.sku && <p className="text-xs text-slate-400 font-mono">SKU: {p.sku}</p>}
                    </div>
                    {isSelected && <span className="text-xs font-semibold text-teal-600">✓</span>}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
