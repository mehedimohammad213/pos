"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import type { Customer, CustomerHistory, Sale } from "@/lib/types";
import { Alert, Btn, Field, Input, PageHeader, Select, TableWrap, Td, Th } from "@/components/ui";
import { formatBDT, formatDate, formatDateTime } from "@/lib/format";

function CustomerDetailContent() {
  const { id } = useParams<{ id: string }>();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [history, setHistory] = useState<CustomerHistory | null>(null);
  const [edit, setEdit] = useState({ name: "", phone: "", address: "", nid: "", credit_limit: "" });
  const [pay, setPay] = useState({ amount: "", method: "cash", notes: "" });
  const [allocations, setAllocations] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"sales" | "ledger" | "collect">("sales");
  const [saving, setSaving] = useState(false);

  async function load() {
    const c = await api<Customer>(`/customers/${id}`);
    setCustomer(c);
    setEdit({
      name: c.name || "",
      phone: c.phone || "",
      address: c.address || "",
      nid: c.nid || "",
      credit_limit: String(c.credit_limit ?? ""),
    });
    const h = await api<CustomerHistory>(`/customers/${id}/history`);
    setHistory(h);
    const init: Record<string, string> = {};
    for (const s of h.sales || []) {
      if (Number(s.due_amount || 0) > 0 && s.status === "completed") init[s.id] = "";
    }
    setAllocations(init);
  }

  useEffect(() => {
    void load().catch((e) => setError(e instanceof Error ? e.message : "Load failed"));
  }, [id]);

  const openInvoices: Sale[] = (history?.sales || []).filter(
    (s) => Number(s.due_amount || 0) > 0 && s.status === "completed"
  );

  async function saveProfile() {
    setSaving(true);
    setError("");
    try {
      await api(`/customers/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: edit.name.trim(),
          phone: edit.phone.trim(),
          address: edit.address.trim() || undefined,
          nid: edit.nid.trim() || undefined,
          credit_limit: Number(edit.credit_limit) || 0,
        }),
      });
      setMsg("Customer updated");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setSaving(false);
    }
  }

  async function collectDue() {
    setSaving(true);
    setError("");
    try {
      const allocEntries = Object.entries(allocations)
        .filter(([, v]) => Number(v) > 0)
        .map(([sale_id, v]) => ({ sale_id, amount: Number(v) }));
      await api("/customers/collect-due", {
        method: "POST",
        body: JSON.stringify({
          customer_id: id,
          amount: Number(pay.amount),
          method: pay.method,
          notes: pay.notes || undefined,
          allocations: allocEntries.length ? allocEntries : undefined,
        }),
      });
      setMsg("Payment recorded");
      setPay({ amount: "", method: "cash", notes: "" });
      await load();
      setTab("ledger");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Collection failed");
    } finally {
      setSaving(false);
    }
  }

  if (!customer) return <p className="text-slate-500">Loading…</p>;

  return (
    <div>
      <PageHeader title={customer.name}>
        <Link href="/customers">
          <Btn variant="secondary">Back</Btn>
        </Link>
      </PageHeader>
      {msg ? <Alert tone="success">{msg}</Alert> : null}
      {error ? <Alert tone="error">{error}</Alert> : null}

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <section className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-2">
          <h2 className="font-semibold text-slate-800">Profile</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Name">
              <Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
            </Field>
            <Field label="Phone">
              <Input value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} />
            </Field>
            <Field label="Address" className="sm:col-span-2">
              <Input value={edit.address} onChange={(e) => setEdit({ ...edit, address: e.target.value })} />
            </Field>
            <Field label="NID">
              <Input value={edit.nid} onChange={(e) => setEdit({ ...edit, nid: e.target.value })} />
            </Field>
            <Field label="Credit limit">
              <Input
                type="number"
                min={0}
                value={edit.credit_limit}
                onChange={(e) => setEdit({ ...edit, credit_limit: e.target.value })}
              />
            </Field>
          </div>
          <Btn className="mt-4" disabled={saving} onClick={() => void saveProfile()}>
            Save profile
          </Btn>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="font-semibold text-slate-800">Balances</h2>
          <dl className="mt-3 space-y-3 text-sm">
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">Due balance</dt>
              <dd className="font-mono font-semibold text-rose-700">{formatBDT(customer.due_balance)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">Credit limit</dt>
              <dd className="font-mono">{formatBDT(customer.credit_limit)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">Open invoices</dt>
              <dd className="font-mono">{openInvoices.length}</dd>
            </div>
          </dl>
          {Number(customer.due_balance || 0) > 0 ? (
            <Btn className="mt-4 w-full" onClick={() => setTab("collect")}>
              Collect due
            </Btn>
          ) : null}
        </section>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {(
          [
            { id: "sales", label: "Purchase history" },
            { id: "ledger", label: "Ledger" },
            { id: "collect", label: "Collect due" },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-lg px-3 py-2 text-sm font-medium ${
              tab === t.id ? "bg-teal-600 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "sales" ? (
        <TableWrap>
          <thead>
            <tr>
              <Th>Invoice</Th>
              <Th className="hidden sm:table-cell">Date</Th>
              <Th className="hidden sm:table-cell">Type</Th>
              <Th>Total</Th>
              <Th className="hidden md:table-cell">Due</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {(history?.sales || []).map((s) => (
              <tr key={s.id}>
                <Td className="max-w-[9rem]">
                  <Link href={`/sales/${s.id}`} className="block truncate font-mono text-teal-700 hover:underline">
                    {s.invoice_no}
                  </Link>
                  <span className="mt-0.5 block text-[11px] text-slate-500 sm:hidden">
                    {formatDate(s.sale_date)} · {s.sale_type}
                  </span>
                </Td>
                <Td className="hidden sm:table-cell">{formatDate(s.sale_date)}</Td>
                <Td className="hidden sm:table-cell">{s.sale_type}</Td>
                <Td className="font-mono">{formatBDT(s.total)}</Td>
                <Td className="hidden font-mono md:table-cell">{formatBDT(s.due_amount)}</Td>
                <Td>{s.payment_status || s.status}</Td>
              </tr>
            ))}
            {!history?.sales?.length ? (
              <tr>
                <Td colSpan={6} className="text-slate-500">
                  No sales yet
                </Td>
              </tr>
            ) : null}
          </tbody>
        </TableWrap>
      ) : null}

      {tab === "ledger" ? (
        <TableWrap>
          <thead>
            <tr>
              <Th>When</Th>
              <Th>Type</Th>
              <Th>Amount</Th>
              <Th>Notes</Th>
            </tr>
          </thead>
          <tbody>
            {(history?.ledger || []).map((e) => (
              <tr key={e.id}>
                <Td>{formatDateTime(e.created_at)}</Td>
                <Td>{e.entry_type}</Td>
                <Td className="font-mono">{formatBDT(e.amount)}</Td>
                <Td className="max-w-[12rem] truncate text-slate-600" title={e.description || e.notes || undefined}>
                  {e.description || e.notes || "—"}
                </Td>
              </tr>
            ))}
            {!history?.ledger?.length ? (
              <tr>
                <Td colSpan={4} className="text-slate-500">
                  No ledger entries
                </Td>
              </tr>
            ) : null}
          </tbody>
        </TableWrap>
      ) : null}

      {tab === "collect" ? (
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="font-semibold text-slate-800">Collect due</h2>
          <div className="mt-3 grid max-w-xl gap-3 sm:grid-cols-2">
            <Field label="Amount">
              <Input value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} />
            </Field>
            <Field label="Method">
              <Select value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })}>
                <option value="cash">Cash</option>
                <option value="card">Card</option>
                <option value="bkash">bKash</option>
                <option value="nagad">Nagad</option>
                <option value="rocket">Rocket</option>
              </Select>
            </Field>
            <Field label="Notes" className="sm:col-span-2">
              <Input value={pay.notes} onChange={(e) => setPay({ ...pay, notes: e.target.value })} />
            </Field>
          </div>

          {openInvoices.length ? (
            <div className="mt-4">
              <p className="mb-2 text-sm font-medium">Allocate to invoices (optional)</p>
              <TableWrap>
                <thead>
                  <tr>
                    <Th>Invoice</Th>
                    <Th>Date</Th>
                    <Th>Due</Th>
                    <Th>Apply</Th>
                  </tr>
                </thead>
                <tbody>
                  {openInvoices.map((s) => (
                    <tr key={s.id}>
                      <Td className="font-mono text-xs">{s.invoice_no}</Td>
                      <Td>{formatDate(s.sale_date)}</Td>
                      <Td className="font-mono">{formatBDT(s.due_amount)}</Td>
                      <Td>
                        <Input
                          type="number"
                          min={0}
                          className="w-28"
                          value={allocations[s.id] || ""}
                          onChange={(e) => setAllocations({ ...allocations, [s.id]: e.target.value })}
                        />
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
              <p className="mt-1 text-xs text-slate-500">Leave blank to auto-allocate oldest first.</p>
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-500">No open invoice dues.</p>
          )}

          <Btn className="mt-4" disabled={saving || !(Number(pay.amount) > 0)} onClick={() => void collectDue()}>
            {saving ? "Saving…" : "Record payment"}
          </Btn>
        </section>
      ) : null}
    </div>
  );
}

export default function CustomerDetailPage() {
  return (
    <Suspense fallback={<div className="p-6 text-slate-500">Loading customer…</div>}>
      <CustomerDetailContent />
    </Suspense>
  );
}
