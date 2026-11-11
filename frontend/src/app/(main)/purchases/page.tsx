"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Product, Purchase, Supplier } from "@/lib/types";
import { Alert, Btn, Field, Input, Modal, PageHeader, Select, TableWrap, Td, Th } from "@/components/ui";
import { formatBDT, formatDate, todayISO } from "@/lib/format";

type PurchaseLine = { product_id: string; quantity: string; unit_cost: string };

export default function PurchasesPage() {
  const [tab, setTab] = useState<"purchases" | "suppliers">("purchases");
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [supOpen, setSupOpen] = useState(false);
  const [payOpen, setPayOpen] = useState<Supplier | null>(null);
  const [purOpen, setPurOpen] = useState(false);
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

  async function load() {
    setPurchases(await api<Purchase[]>("/purchases"));
    setSuppliers(await api<Supplier[]>("/purchases/suppliers"));
  }

  useEffect(() => {
    void load();
    void api<Product[]>("/catalog/products").then(setProducts);
    setPurForm((f) => (f.purchase_date ? f : { ...f, purchase_date: todayISO() }));
  }, []);

  async function addSupplier() {
    try {
      await api("/purchases/suppliers", { method: "POST", body: JSON.stringify(supForm) });
      setSupOpen(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
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
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  }

  async function createPurchase() {
    const items = purForm.lines
      .filter((l) => l.product_id && Number(l.quantity) > 0)
      .map((l) => ({
        product_id: l.product_id,
        quantity: Number(l.quantity),
        unit_cost: Number(l.unit_cost) || 0,
      }));
    if (!items.length) {
      setError("Add at least one line");
      return;
    }
    try {
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
      setPurOpen(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  }

  return (
    <div>
      <PageHeader title="Purchases">
        <Btn variant="secondary" onClick={() => setSupOpen(true)}>
          Add supplier
        </Btn>
        <Btn onClick={() => setPurOpen(true)}>New purchase</Btn>
      </PageHeader>
      {error ? <Alert tone="error">{error}</Alert> : null}
      <div className="mb-4 flex gap-2">
        <TabBtn active={tab === "purchases"} onClick={() => setTab("purchases")}>
          Purchases
        </TabBtn>
        <TabBtn active={tab === "suppliers"} onClick={() => setTab("suppliers")}>
          Suppliers
        </TabBtn>
      </div>

      {tab === "purchases" ? (
        <TableWrap>
          <thead>
            <tr>
              <Th>Date</Th>
              <Th>Supplier</Th>
              <Th>Total</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {purchases.map((p) => (
              <tr key={p.id}>
                <Td>{formatDate(p.purchase_date)}</Td>
                <Td>{p.supplier_name}</Td>
                <Td className="font-mono">{formatBDT(p.total)}</Td>
                <Td>{p.status}</Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      ) : (
        <TableWrap>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Phone</Th>
              <Th>Balance</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {suppliers.map((s) => (
              <tr key={s.id}>
                <Td>{s.name}</Td>
                <Td>{s.phone}</Td>
                <Td className="font-mono">{formatBDT(s.due_balance)}</Td>
                <Td>
                  <Btn variant="ghost" className="text-xs" onClick={() => setPayOpen(s)}>
                    Pay
                  </Btn>
                </Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}

      <Modal open={supOpen} onClose={() => setSupOpen(false)} title="New supplier">
        <Field label="Name">
          <Input value={supForm.name} onChange={(e) => setSupForm({ ...supForm, name: e.target.value })} />
        </Field>
        <Field label="Phone">
          <Input value={supForm.phone} onChange={(e) => setSupForm({ ...supForm, phone: e.target.value })} />
        </Field>
        <Field label="Address">
          <Input value={supForm.address} onChange={(e) => setSupForm({ ...supForm, address: e.target.value })} />
        </Field>
        <Btn className="mt-3" onClick={() => void addSupplier()}>
          Save
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

      <Modal open={purOpen} onClose={() => setPurOpen(false)} title="New purchase" wide>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Supplier">
            <Select value={purForm.supplier_id} onChange={(e) => setPurForm({ ...purForm, supplier_id: e.target.value })}>
              <option value="">—</option>
              {suppliers.map((s) => (
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
          <Field label="Paid amount">
            <Input value={purForm.paid_amount} onChange={(e) => setPurForm({ ...purForm, paid_amount: e.target.value })} />
          </Field>
        </div>
        <div className="mt-4 space-y-2">
          {purForm.lines.map((line, i) => (
            <div key={i} className="grid grid-cols-3 gap-2">
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
              <Input placeholder="Qty" value={line.quantity} onChange={(e) => {
                const lines = [...purForm.lines];
                lines[i] = { ...line, quantity: e.target.value };
                setPurForm({ ...purForm, lines });
              }} />
              <Input placeholder="Unit cost" value={line.unit_cost} onChange={(e) => {
                const lines = [...purForm.lines];
                lines[i] = { ...line, unit_cost: e.target.value };
                setPurForm({ ...purForm, lines });
              }} />
            </div>
          ))}
          <Btn variant="secondary" className="text-xs" onClick={() => setPurForm({ ...purForm, lines: [...purForm.lines, { product_id: "", quantity: "1", unit_cost: "" }] })}>
            + Line
          </Btn>
        </div>
        <Btn className="mt-4" onClick={() => void createPurchase()}>
          Save purchase
        </Btn>
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
