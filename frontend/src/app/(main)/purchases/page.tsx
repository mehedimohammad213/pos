"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Product, Purchase, Supplier, PaginatedResponse } from "@/lib/types";
import { Alert, Btn, Field, Input, Modal, PageHeader, Select, TableWrap, Td, Th, Pagination } from "@/components/ui";
import { formatBDT, formatDate, todayISO } from "@/lib/format";

type PurchaseLine = { product_id: string; quantity: string; unit_cost: string };

export default function PurchasesPage() {
  const PAGE_SIZE = 10;
  const [tab, setTab] = useState<"purchases" | "suppliers">("purchases");
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [pagePurchases, setPagePurchases] = useState(1);
  const [totalPagesPurchases, setTotalPagesPurchases] = useState(1);
  const [totalPurchases, setTotalPurchases] = useState(0);

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [pageSuppliers, setPageSuppliers] = useState(1);
  const [totalPagesSuppliers, setTotalPagesSuppliers] = useState(1);
  const [totalSuppliers, setTotalSuppliers] = useState(0);
  const [allSuppliers, setAllSuppliers] = useState<Supplier[]>([]);

  const [products, setProducts] = useState<Product[]>([]);
  const [supOpen, setSupOpen] = useState(false);
  const [supEditId, setSupEditId] = useState<string | null>(null);
  const [payOpen, setPayOpen] = useState<Supplier | null>(null);
  const [purOpen, setPurOpen] = useState(false);
  const [purEditId, setPurEditId] = useState<string | null>(null);
  const [supForm, setSupForm] = useState({ name: "", phone: "", address: "" });
  const [payForm, setPayForm] = useState({ amount: "", method: "cash", notes: "" });
  const [purForm, setPurForm] = useState({
    supplier_id: "",
    purchase_date: "",
    invoice_no: "",
    notes: "",
    paid_amount: "",
    lines: [{ product_id: "", quantity: "1", unit_cost: "" }] as PurchaseLine[],
  });
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletePurchaseTarget, setDeletePurchaseTarget] = useState<Purchase | null>(null);
  const [deleteSupplierTarget, setDeleteSupplierTarget] = useState<Supplier | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  async function loadPurchases(p = pagePurchases) {
    const qs = new URLSearchParams({
      page: String(p),
      limit: String(PAGE_SIZE),
    });
    const data = await api<PaginatedResponse<Purchase>>(`/purchases?${qs}`);
    setPurchases(data.items);
    setTotalPurchases(data.total);
    setTotalPagesPurchases(data.totalPages);
    setPagePurchases(data.page);
  }

  async function loadSuppliers(p = pageSuppliers) {
    const qs = new URLSearchParams({
      page: String(p),
      limit: String(PAGE_SIZE),
    });
    const data = await api<PaginatedResponse<Supplier>>(`/purchases/suppliers?${qs}`);
    setSuppliers(data.items);
    setTotalSuppliers(data.total);
    setTotalPagesSuppliers(data.totalPages);
    setPageSuppliers(data.page);
  }

  async function loadAllSuppliers() {
    const data = await api<Supplier[]>("/purchases/suppliers");
    setAllSuppliers(Array.isArray(data) ? data : (data as PaginatedResponse<Supplier>).items || []);
  }

  useEffect(() => {
    void loadPurchases(1);
    void loadSuppliers(1);
    void loadAllSuppliers();
    void api<Product[]>("/catalog/products").then(setProducts);
    setPurForm((f) => (f.purchase_date ? f : { ...f, purchase_date: todayISO() }));
  }, []);

  function openCreateSupplier() {
    setSupEditId(null);
    setSupForm({ name: "", phone: "", address: "" });
    setError("");
    setSupOpen(true);
  }

  function openEditSupplier(s: Supplier) {
    setSupEditId(s.id);
    setSupForm({ name: s.name || "", phone: s.phone || "", address: s.address || "" });
    setError("");
    setSupOpen(true);
  }

  async function saveSupplier() {
    setSaving(true);
    setError("");
    try {
      if (supEditId) {
        await api(`/purchases/suppliers/${supEditId}`, { method: "PATCH", body: JSON.stringify(supForm) });
        setMsg("Supplier updated");
      } else {
        await api("/purchases/suppliers", { method: "POST", body: JSON.stringify(supForm) });
        setMsg("Supplier added");
      }
      setSupOpen(false);
      setSupEditId(null);
      await Promise.all([loadSuppliers(pageSuppliers), loadAllSuppliers()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  async function paySupplier() {
    if (!payOpen) return;
    try {
      await api("/purchases/suppliers/pay", {
        method: "POST",
        body: JSON.stringify({
          supplier_id: payOpen.id,
          amount: Number(payForm.amount),
          method: payForm.method,
          notes: payForm.notes || undefined,
        }),
      });
      setPayOpen(null);
      await Promise.all([loadSuppliers(pageSuppliers), loadPurchases(pagePurchases)]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  }

  function openCreatePurchase() {
    setPurEditId(null);
    setError("");
    setPurForm({
      supplier_id: "",
      purchase_date: todayISO(),
      invoice_no: "",
      notes: "",
      paid_amount: "",
      lines: [{ product_id: "", quantity: "1", unit_cost: "" }],
    });
    setPurOpen(true);
  }

  async function openEditPurchase(p: Purchase) {
    setError("");
    setMsg("");
    try {
      const full = await api<Purchase & { invoice_no?: string; notes?: string; items?: Array<{ product_id: string; quantity: number; unit_cost: number }> }>(
        `/purchases/${p.id}`
      );
      setPurEditId(full.id);
      setPurForm({
        supplier_id: full.supplier_id || "",
        purchase_date: full.purchase_date ? String(full.purchase_date).slice(0, 10) : todayISO(),
        invoice_no: full.invoice_no || "",
        notes: full.notes || "",
        paid_amount: "",
        lines: (full.items || []).length
          ? (full.items || []).map((item) => ({
              product_id: item.product_id,
              quantity: String(item.quantity),
              unit_cost: String(item.unit_cost),
            }))
          : [{ product_id: "", quantity: "1", unit_cost: "" }],
      });
      setPurOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load purchase");
    }
  }

  async function savePurchase() {
    setSaving(true);
    setError("");
    try {
      if (purEditId) {
        await api(`/purchases/${purEditId}`, {
          method: "PATCH",
          body: JSON.stringify({
            supplier_id: purForm.supplier_id || null,
            purchase_date: purForm.purchase_date || undefined,
            invoice_no: purForm.invoice_no || null,
            notes: purForm.notes || null,
          }),
        });
        setMsg("Purchase updated");
        setPurOpen(false);
        setPurEditId(null);
        await loadPurchases(pagePurchases);
      } else {
        const items = purForm.lines
          .filter((l) => l.product_id && Number(l.quantity) > 0)
          .map((l) => ({
            product_id: l.product_id,
            quantity: Number(l.quantity),
            unit_cost: Number(l.unit_cost) || 0,
          }));
        if (!items.length) {
          setError("Add at least one line");
          setSaving(false);
          return;
        }
        await api("/purchases", {
          method: "POST",
          body: JSON.stringify({
            supplier_id: purForm.supplier_id || undefined,
            purchase_date: purForm.purchase_date,
            invoice_no: purForm.invoice_no || undefined,
            notes: purForm.notes || undefined,
            paid_amount: purForm.paid_amount ? Number(purForm.paid_amount) : undefined,
            items,
          }),
        });
        setMsg("Purchase saved");
        setPurOpen(false);
        await Promise.all([loadPurchases(1), loadSuppliers(pageSuppliers)]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDeletePurchase() {
    if (!deletePurchaseTarget) return;
    setDeleteBusy(true);
    setError("");
    try {
      await api(`/purchases/${deletePurchaseTarget.id}`, { method: "DELETE" });
      setMsg(`Deleted ${deletePurchaseTarget.purchase_no || "purchase"}`);
      setDeletePurchaseTarget(null);
      await Promise.all([loadPurchases(pagePurchases), loadSuppliers(pageSuppliers)]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleteBusy(false);
    }
  }

  async function confirmDeleteSupplier() {
    if (!deleteSupplierTarget) return;
    setDeleteBusy(true);
    setError("");
    try {
      await api(`/purchases/suppliers/${deleteSupplierTarget.id}`, { method: "DELETE" });
      setMsg(`Deleted supplier ${deleteSupplierTarget.name}`);
      setDeleteSupplierTarget(null);
      await Promise.all([loadSuppliers(pageSuppliers), loadAllSuppliers()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <div>
      <PageHeader title="Purchases">
        <Btn variant="secondary" onClick={openCreateSupplier}>
          Add supplier
        </Btn>
        <Btn onClick={openCreatePurchase}>New purchase</Btn>
      </PageHeader>
      {error && !supOpen && !purOpen && !deletePurchaseTarget && !deleteSupplierTarget ? (
        <Alert tone="error">{error}</Alert>
      ) : null}
      {msg ? <Alert tone="success">{msg}</Alert> : null}
      <div className="mb-4 flex flex-wrap gap-2">
        <TabBtn active={tab === "purchases"} onClick={() => setTab("purchases")}>
          Purchases
        </TabBtn>
        <TabBtn active={tab === "suppliers"} onClick={() => setTab("suppliers")}>
          Suppliers
        </TabBtn>
      </div>

      {tab === "purchases" ? (
        <>
          <TableWrap>
            <thead>
              <tr>
                <Th className="hidden sm:table-cell">Date</Th>
                <Th>Supplier</Th>
                <Th>Total</Th>
                <Th className="hidden md:table-cell">#</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {purchases.map((p) => (
                <tr key={p.id}>
                  <Td className="hidden sm:table-cell">{formatDate(p.purchase_date)}</Td>
                  <Td className="max-w-[10rem]">
                    <span className="block truncate">{p.supplier_name || "—"}</span>
                    <span className="mt-0.5 block text-[11px] text-slate-500 sm:hidden">
                      {formatDate(p.purchase_date)}
                    </span>
                  </Td>
                  <Td className="font-mono">{formatBDT(p.total)}</Td>
                  <Td className="hidden font-mono text-xs md:table-cell">{p.purchase_no || "—"}</Td>
                  <Td>
                    <div className="flex flex-wrap justify-end gap-1">
                      <Btn variant="ghost" className="min-h-9 px-2 py-1 text-xs" onClick={() => void openEditPurchase(p)}>
                        Edit
                      </Btn>
                      <Btn
                        variant="ghost"
                        className="min-h-9 px-2 py-1 text-xs text-red-600 hover:text-red-700"
                        onClick={() => {
                          setError("");
                          setDeletePurchaseTarget(p);
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
            page={pagePurchases}
            totalPages={totalPagesPurchases}
            total={totalPurchases}
            limit={PAGE_SIZE}
            onPage={(p) => {
              setPagePurchases(p);
              void loadPurchases(p);
            }}
          />
        </>
      ) : (
        <>
          <TableWrap>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th className="hidden md:table-cell">Phone</Th>
                <Th>Balance</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {suppliers.map((s) => (
                <tr key={s.id}>
                  <Td className="max-w-[10rem]">
                    <span className="block truncate font-medium">{s.name}</span>
                    <span className="mt-0.5 block font-mono text-[11px] text-slate-500 md:hidden">
                      {s.phone || "—"}
                    </span>
                  </Td>
                  <Td className="hidden font-mono md:table-cell">{s.phone}</Td>
                  <Td className="font-mono">{formatBDT(s.due_balance)}</Td>
                  <Td className="text-right">
                    <div className="flex flex-wrap justify-end gap-1">
                      <Btn variant="ghost" className="min-h-9 px-2 py-1 text-xs" onClick={() => openEditSupplier(s)}>
                        Edit
                      </Btn>
                      <Btn variant="ghost" className="min-h-9 px-2 py-1 text-xs" onClick={() => setPayOpen(s)}>
                        Pay
                      </Btn>
                      <Btn
                        variant="ghost"
                        className="min-h-9 px-2 py-1 text-xs text-red-600 hover:text-red-700"
                        onClick={() => {
                          setError("");
                          setDeleteSupplierTarget(s);
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
            page={pageSuppliers}
            totalPages={totalPagesSuppliers}
            total={totalSuppliers}
            limit={PAGE_SIZE}
            onPage={(p) => {
              setPageSuppliers(p);
              void loadSuppliers(p);
            }}
          />
        </>
      )}

      <Modal
        open={supOpen}
        onClose={() => {
          setSupOpen(false);
          setSupEditId(null);
        }}
        title={supEditId ? "Edit supplier" : "New supplier"}
      >
        {error && supOpen ? <Alert tone="error">{error}</Alert> : null}
        <Field label="Name">
          <Input value={supForm.name} onChange={(e) => setSupForm({ ...supForm, name: e.target.value })} />
        </Field>
        <Field label="Phone">
          <Input value={supForm.phone} onChange={(e) => setSupForm({ ...supForm, phone: e.target.value })} />
        </Field>
        <Field label="Address">
          <Input value={supForm.address} onChange={(e) => setSupForm({ ...supForm, address: e.target.value })} />
        </Field>
        <Btn className="mt-3" disabled={saving} onClick={() => void saveSupplier()}>
          {saving ? "Saving…" : "Save"}
        </Btn>
      </Modal>

      <Modal open={!!payOpen} onClose={() => setPayOpen(null)} title={`Pay ${payOpen?.name || ""}`}>
        <Field label="Amount">
          <Input value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} />
        </Field>
        <Field label="Method">
          <Input value={payForm.method} onChange={(e) => setPayForm({ ...payForm, method: e.target.value })} />
        </Field>
        <Btn className="mt-3" onClick={() => void paySupplier()}>
          Submit payment
        </Btn>
      </Modal>

      <Modal
        open={purOpen}
        onClose={() => {
          setPurOpen(false);
          setPurEditId(null);
        }}
        title={purEditId ? "Edit purchase" : "New purchase"}
        wide
      >
        {error && purOpen ? <Alert tone="error">{error}</Alert> : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Supplier">
            <Select value={purForm.supplier_id} onChange={(e) => setPurForm({ ...purForm, supplier_id: e.target.value })}>
              <option value="">—</option>
              {(allSuppliers.length ? allSuppliers : suppliers).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Date">
            <Input type="date" value={purForm.purchase_date} onChange={(e) => setPurForm({ ...purForm, purchase_date: e.target.value })} />
          </Field>
          <Field label="Invoice #">
            <Input value={purForm.invoice_no} onChange={(e) => setPurForm({ ...purForm, invoice_no: e.target.value })} />
          </Field>
          {!purEditId ? (
            <Field label="Paid amount">
              <Input value={purForm.paid_amount} onChange={(e) => setPurForm({ ...purForm, paid_amount: e.target.value })} />
            </Field>
          ) : (
            <Field label="Notes">
              <Input value={purForm.notes} onChange={(e) => setPurForm({ ...purForm, notes: e.target.value })} />
            </Field>
          )}
        </div>
        {purEditId ? (
          <p className="mt-3 text-xs text-slate-500">
            Line items and stock are fixed after save. Edit updates supplier, date, invoice #, and notes only.
          </p>
        ) : (
          <div className="mt-4 space-y-2">
            {purForm.lines.map((line, i) => (
              <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <Select
                  value={line.product_id}
                  onChange={(e) => {
                    const lines = [...purForm.lines];
                    lines[i] = { ...line, product_id: e.target.value };
                    setPurForm({ ...purForm, lines });
                  }}
                >
                  <option value="">Product</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
                <Input
                  placeholder="Qty"
                  value={line.quantity}
                  onChange={(e) => {
                    const lines = [...purForm.lines];
                    lines[i] = { ...line, quantity: e.target.value };
                    setPurForm({ ...purForm, lines });
                  }}
                />
                <Input
                  placeholder="Unit cost"
                  value={line.unit_cost}
                  onChange={(e) => {
                    const lines = [...purForm.lines];
                    lines[i] = { ...line, unit_cost: e.target.value };
                    setPurForm({ ...purForm, lines });
                  }}
                />
              </div>
            ))}
            <Btn
              variant="secondary"
              className="text-xs"
              onClick={() =>
                setPurForm({ ...purForm, lines: [...purForm.lines, { product_id: "", quantity: "1", unit_cost: "" }] })
              }
            >
              + Line
            </Btn>
          </div>
        )}
        {!purEditId ? (
          <Field label="Notes" className="mt-3">
            <Input value={purForm.notes} onChange={(e) => setPurForm({ ...purForm, notes: e.target.value })} />
          </Field>
        ) : null}
        <Btn className="mt-4" disabled={saving} onClick={() => void savePurchase()}>
          {saving ? "Saving…" : purEditId ? "Save changes" : "Save purchase"}
        </Btn>
      </Modal>

      <Modal
        open={!!deletePurchaseTarget}
        onClose={() => {
          if (!deleteBusy) setDeletePurchaseTarget(null);
        }}
        title="Delete purchase"
      >
        <div className="space-y-4">
          {error && deletePurchaseTarget ? <Alert tone="error">{error}</Alert> : null}
          <p className="text-sm text-slate-600">
            Delete purchase{" "}
            <span className="font-medium text-slate-900">
              {deletePurchaseTarget?.purchase_no || deletePurchaseTarget?.id.slice(0, 8)}
            </span>
            ? Stock and supplier balance will be reversed.
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Btn variant="secondary" disabled={deleteBusy} onClick={() => setDeletePurchaseTarget(null)}>
              Keep
            </Btn>
            <Btn variant="danger" disabled={deleteBusy} onClick={() => void confirmDeletePurchase()}>
              {deleteBusy ? "Deleting…" : "Yes, delete"}
            </Btn>
          </div>
        </div>
      </Modal>

      <Modal
        open={!!deleteSupplierTarget}
        onClose={() => {
          if (!deleteBusy) setDeleteSupplierTarget(null);
        }}
        title="Delete supplier"
      >
        <div className="space-y-4">
          {error && deleteSupplierTarget ? <Alert tone="error">{error}</Alert> : null}
          <p className="text-sm text-slate-600">
            Delete supplier <span className="font-medium text-slate-900">{deleteSupplierTarget?.name}</span>?
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Btn variant="secondary" disabled={deleteBusy} onClick={() => setDeleteSupplierTarget(null)}>
              Keep
            </Btn>
            <Btn variant="danger" disabled={deleteBusy} onClick={() => void confirmDeleteSupplier()}>
              {deleteBusy ? "Deleting…" : "Yes, delete"}
            </Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-4 py-2 text-sm font-medium ${
        active ? "bg-teal-600 text-white" : "bg-white border border-slate-300 text-slate-700"
      }`}
    >
      {children}
    </button>
  );
}
