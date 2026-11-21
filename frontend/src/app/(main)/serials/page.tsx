"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { Product, Serial, PaginatedResponse } from "@/lib/types";
import { Alert, Btn, Field, Input, Modal, PageHeader, TableWrap, Td, Th, Pagination } from "@/components/ui";

export default function SerialsPage() {
  const [rows, setRows] = useState<Serial[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const PAGE_SIZE = 10;
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const SERIAL_STATUSES = ["in_stock", "sold", "returned", "defective"] as const;
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ product_id: "", serial_numbers: "" });
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<Serial | null>(null);
  const [editSerial, setEditSerial] = useState("");
  const [editStatus, setEditStatus] = useState<(typeof SERIAL_STATUSES)[number]>("in_stock");
  const [editBusy, setEditBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Serial | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

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

  async function changeStatus(id: string, status: (typeof SERIAL_STATUSES)[number]) {
    setError("");
    setSavingId(id);
    const prev = rows.find((r) => r.id === id)?.status;
    setRows((list) => list.map((r) => (r.id === id ? { ...r, status } : r)));
    try {
      await api(`/catalog/serials/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
    } catch (e) {
      setRows((list) => list.map((r) => (r.id === id ? { ...r, status: prev || r.status } : r)));
      setError(e instanceof Error ? e.message : "Failed to update status");
    } finally {
      setSavingId(null);
    }
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

  function openEdit(s: Serial) {
    setError("");
    setMsg("");
    setEditTarget(s);
    setEditSerial(s.serial_number);
    setEditStatus(
      SERIAL_STATUSES.includes(s.status as (typeof SERIAL_STATUSES)[number])
        ? (s.status as (typeof SERIAL_STATUSES)[number])
        : "in_stock"
    );
  }

  async function saveEdit() {
    if (!editTarget) return;
    const serial_number = editSerial.trim();
    if (!serial_number) {
      setError("Serial number is required");
      return;
    }
    setEditBusy(true);
    setError("");
    try {
      await api(`/catalog/serials/${editTarget.id}`, {
        method: "PATCH",
        body: JSON.stringify({ serial_number, status: editStatus }),
      });
      setEditTarget(null);
      setMsg("Serial updated");
      await load(page);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setEditBusy(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    setError("");
    try {
      await api(`/catalog/serials/${deleteTarget.id}`, { method: "DELETE" });
      setDeleteTarget(null);
      setMsg(`Deleted serial ${deleteTarget.serial_number}`);
      await load(page);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <div>
      <PageHeader title="Serial numbers">
        <Btn onClick={() => setOpen(true)}>Register serial</Btn>
      </PageHeader>
      {error ? <Alert tone="error">{error}</Alert> : null}
      {msg ? <Alert tone="success">{msg}</Alert> : null}
      <TableWrap>
        <thead>
          <tr>
            <Th>Serial</Th>
            <Th>Product</Th>
            <Th>Status</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.id}>
              <Td className="max-w-[8rem] truncate font-mono sm:max-w-none">{s.serial_number}</Td>
              <Td className="max-w-[10rem] truncate">{s.product_name}</Td>
              <Td>
                <select
                  className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800 focus:border-teal-500 focus:outline-none disabled:opacity-60"
                  value={s.status}
                  disabled={savingId === s.id}
                  onChange={(e) =>
                    void changeStatus(s.id, e.target.value as (typeof SERIAL_STATUSES)[number])
                  }
                >
                  {SERIAL_STATUSES.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
              </Td>
              <Td>
                <div className="flex flex-wrap justify-end gap-1">
                  <Btn variant="ghost" className="min-h-9 px-2 py-1 text-xs" onClick={() => openEdit(s)}>
                    Edit
                  </Btn>
                  <Btn
                    variant="ghost"
                    className="min-h-9 px-2 py-1 text-xs text-red-600 hover:text-red-700"
                    disabled={s.status === "sold"}
                    title={s.status === "sold" ? "Sold serials cannot be deleted" : "Delete serial"}
                    onClick={() => {
                      setError("");
                      setDeleteTarget(s);
                    }}
                  >
                    Delete
                  </Btn>
                </div>
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

      <Modal
        open={!!editTarget}
        onClose={() => {
          if (!editBusy) setEditTarget(null);
        }}
        title="Edit serial"
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-600">{editTarget?.product_name}</p>
          <Field label="Serial number">
            <Input value={editSerial} onChange={(e) => setEditSerial(e.target.value)} />
          </Field>
          <Field label="Status">
            <select
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-teal-500"
              value={editStatus}
              onChange={(e) => setEditStatus(e.target.value as (typeof SERIAL_STATUSES)[number])}
            >
              {SERIAL_STATUSES.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
          </Field>
          <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
            <Btn variant="secondary" disabled={editBusy} onClick={() => setEditTarget(null)}>
              Cancel
            </Btn>
            <Btn disabled={editBusy} onClick={() => void saveEdit()}>
              {editBusy ? "Saving…" : "Save"}
            </Btn>
          </div>
        </div>
      </Modal>

      <Modal
        open={!!deleteTarget}
        onClose={() => {
          if (!deleteBusy) setDeleteTarget(null);
        }}
        title="Delete serial"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Delete serial{" "}
            <span className="font-mono font-medium text-slate-900">{deleteTarget?.serial_number}</span>?
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Btn variant="secondary" disabled={deleteBusy} onClick={() => setDeleteTarget(null)}>
              Keep
            </Btn>
            <Btn variant="danger" disabled={deleteBusy} onClick={() => void confirmDelete()}>
              {deleteBusy ? "Deleting…" : "Yes, delete"}
            </Btn>
          </div>
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
