"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Customer, PaginatedResponse, Sale } from "@/lib/types";
import { Alert, Btn, Field, Input, Modal, PageHeader, Pagination, Select, TableWrap, Td, Th } from "@/components/ui";
import { formatBDT } from "@/lib/format";

type AgingRow = {
  id: string;
  name: string;
  phone?: string;
  due_balance: number;
  d0_30?: number;
  d31_60?: number;
  d61_90?: number;
  d90_plus?: number;
};

const emptyForm = { name: "", phone: "", address: "", nid: "", credit_limit: "" };

export default function CustomersPage() {
  const [rows, setRows] = useState<Customer[]>([]);
  const [aging, setAging] = useState<AgingRow[]>([]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [collect, setCollect] = useState<Customer | null>(null);
  const [openInvoices, setOpenInvoices] = useState<Sale[]>([]);
  const [allocations, setAllocations] = useState<Record<string, string>>({});
  const [form, setForm] = useState(emptyForm);
  const [pay, setPay] = useState({ amount: "", method: "cash", notes: "" });
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [showAging, setShowAging] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const PAGE_SIZE = 20;

  async function load(p = page) {
    const qs = new URLSearchParams({ page: String(p), limit: String(PAGE_SIZE) });
    if (q) qs.set("q", q);
    const data = await api<PaginatedResponse<Customer>>(`/customers?${qs}`);
    setRows(data.items);
    setTotal(data.total);
    setTotalPages(data.totalPages);
    setPage(data.page);
  }

  useEffect(() => {
    setPage(1);
    const t = setTimeout(() => void load(1), 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    void api<AgingRow[]>("/customers/due-aging").then(setAging);
  }, []);

  function openCreate() {
    setEditId(null);
    setForm(emptyForm);
    setError("");
    setOpen(true);
  }

  function openEdit(c: Customer) {
    setEditId(c.id);
    setForm({
      name: c.name || "",
      phone: c.phone || "",
      address: c.address || "",
      nid: c.nid || "",
      credit_limit: c.credit_limit != null ? String(c.credit_limit) : "",
    });
    setError("");
    setOpen(true);
  }

  async function save() {
    setError("");
    setSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        phone: form.phone.trim(),
        address: form.address.trim() || undefined,
        nid: form.nid.trim() || undefined,
        credit_limit: form.credit_limit ? Number(form.credit_limit) : 0,
      };
      if (editId) {
        await api(`/customers/${editId}`, { method: "PATCH", body: JSON.stringify(body) });
        setMsg("Customer updated");
      } else {
        await api("/customers", { method: "POST", body: JSON.stringify(body) });
        setMsg("Customer added");
      }
      setOpen(false);
      setEditId(null);
      setForm(emptyForm);
      await load(page);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    setError("");
    try {
      await api(`/customers/${deleteTarget.id}`, { method: "DELETE" });
      setMsg(`Deleted "${deleteTarget.name}"`);
      setDeleteTarget(null);
      await load(page);
      setAging(await api<AgingRow[]>("/customers/due-aging"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleteBusy(false);
    }
  }

  async function openCollect(c: Customer) {
    setCollect(c);
    setPay({ amount: String(c.due_balance || ""), method: "cash", notes: "" });
    setAllocations({});
    setError("");
    try {
      const hist = await api<{ sales: Sale[] }>(`/customers/${c.id}/history`);
      const dues = (hist.sales || []).filter((s) => Number(s.due_amount || 0) > 0 && s.status === "completed");
      setOpenInvoices(dues);
      const init: Record<string, string> = {};
      for (const s of dues) init[s.id] = "";
      setAllocations(init);
    } catch {
      setOpenInvoices([]);
    }
  }

  function allocatedTotal() {
    return Object.values(allocations).reduce((sum, v) => sum + (Number(v) || 0), 0);
  }

  async function collectDue() {
    if (!collect) return;
    setSaving(true);
    setError("");
    try {
      const amount = Number(pay.amount);
      const allocEntries = Object.entries(allocations)
        .filter(([, v]) => Number(v) > 0)
        .map(([sale_id, v]) => ({ sale_id, amount: Number(v) }));
      await api("/customers/collect-due", {
        method: "POST",
        body: JSON.stringify({
          customer_id: collect.id,
          amount,
          method: pay.method,
          notes: pay.notes || undefined,
          allocations: allocEntries.length ? allocEntries : undefined,
        }),
      });
      setCollect(null);
      await load(page);
      setAging(await api<AgingRow[]>("/customers/due-aging"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader title="Customers">
        <Btn variant="secondary" onClick={() => setShowAging((v) => !v)}>
          {showAging ? "Hide aging" : "Due aging"}
        </Btn>
        <Btn onClick={openCreate}>Add customer</Btn>
      </PageHeader>
      {error && !collect && !open && !deleteTarget ? <Alert tone="error">{error}</Alert> : null}
      {msg ? <Alert tone="success">{msg}</Alert> : null}
      <Input className="mb-4 max-w-md" placeholder="Search name or phone…" value={q} onChange={(e) => setQ(e.target.value)} />

      {showAging ? (
        <TableWrap className="mb-6">
          <thead>
            <tr>
              <Th>Customer</Th>
              <Th className="hidden sm:table-cell">Phone</Th>
              <Th>Total due</Th>
              <Th className="hidden md:table-cell">0–30d</Th>
              <Th className="hidden md:table-cell">31–60d</Th>
              <Th className="hidden lg:table-cell">61+d</Th>
            </tr>
          </thead>
          <tbody>
            {aging.map((a) => (
              <tr key={a.id}>
                <Td>
                  <Link href={`/customers/${a.id}`} className="font-medium text-teal-700 hover:underline">
                    {a.name}
                  </Link>
                  <span className="mt-0.5 block font-mono text-[11px] text-slate-500 sm:hidden">{a.phone}</span>
                </Td>
                <Td className="hidden font-mono sm:table-cell">{a.phone}</Td>
                <Td className="font-mono">{formatBDT(a.due_balance)}</Td>
                <Td className="hidden font-mono md:table-cell">{formatBDT(a.d0_30)}</Td>
                <Td className="hidden font-mono md:table-cell">{formatBDT(a.d31_60)}</Td>
                <Td className="hidden font-mono lg:table-cell">
                  {formatBDT(Number(a.d61_90 || 0) + Number(a.d90_plus || 0))}
                </Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      ) : null}

      <TableWrap>
        <thead>
          <tr>
            <Th>Name</Th>
            <Th className="hidden sm:table-cell">Phone</Th>
            <Th className="hidden md:table-cell">Credit limit</Th>
            <Th>Due balance</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id}>
              <Td className="max-w-[10rem]">
                <Link href={`/customers/${c.id}`} className="block truncate font-medium text-teal-700 hover:underline">
                  {c.name}
                </Link>
                <span className="mt-0.5 block font-mono text-[11px] text-slate-500 sm:hidden">{c.phone}</span>
              </Td>
              <Td className="hidden font-mono sm:table-cell">{c.phone}</Td>
              <Td className="hidden font-mono md:table-cell">{formatBDT(c.credit_limit)}</Td>
              <Td className="font-mono">{formatBDT(c.due_balance)}</Td>
              <Td>
                <div className="flex flex-wrap justify-end gap-1">
                  <Link href={`/customers/${c.id}`}>
                    <Btn variant="ghost" className="text-xs">
                      Open
                    </Btn>
                  </Link>
                  <Btn variant="ghost" className="text-xs" onClick={() => openEdit(c)}>
                    Edit
                  </Btn>
                  <Btn
                    variant="ghost"
                    className="text-xs"
                    disabled={!(c.due_balance && Number(c.due_balance) > 0)}
                    onClick={() => void openCollect(c)}
                  >
                    Collect
                  </Btn>
                  <Btn
                    variant="ghost"
                    className="text-xs text-red-600 hover:text-red-700"
                    onClick={() => {
                      setError("");
                      setDeleteTarget(c);
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
          setEditId(null);
        }}
        title={editId ? "Edit customer" : "New customer"}
      >
        {error && open ? <Alert tone="error">{error}</Alert> : null}
        <Field label="Name">
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="Phone">
          <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </Field>
        <Field label="Address">
          <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        </Field>
        <Field label="NID (optional)">
          <Input value={form.nid} onChange={(e) => setForm({ ...form, nid: e.target.value })} />
        </Field>
        <Field label="Credit limit (BDT)">
          <Input
            type="number"
            min={0}
            value={form.credit_limit}
            onChange={(e) => setForm({ ...form, credit_limit: e.target.value })}
          />
        </Field>
        <Btn className="mt-3" disabled={saving} onClick={() => void save()}>
          {saving ? "Saving…" : "Save"}
        </Btn>
      </Modal>

      <Modal
        open={!!deleteTarget}
        onClose={() => {
          if (!deleteBusy) setDeleteTarget(null);
        }}
        title="Delete customer"
      >
        <div className="space-y-4">
          {error && deleteTarget ? <Alert tone="error">{error}</Alert> : null}
          <p className="text-sm text-slate-600">
            Delete customer <span className="font-medium text-slate-900">{deleteTarget?.name}</span>
            {deleteTarget?.phone ? (
              <>
                {" "}
                (<span className="font-mono text-xs">{deleteTarget.phone}</span>)
              </>
            ) : null}
            ? Past sales stay unchanged.
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Btn variant="secondary" disabled={deleteBusy} onClick={() => setDeleteTarget(null)}>
              Keep customer
            </Btn>
            <Btn variant="danger" disabled={deleteBusy} onClick={() => void confirmDelete()}>
              {deleteBusy ? "Deleting…" : "Yes, delete"}
            </Btn>
          </div>
        </div>
      </Modal>

      <Modal open={!!collect} onClose={() => setCollect(null)} title={`Collect due — ${collect?.name || ""}`}>
        {error && collect ? <Alert tone="error">{error}</Alert> : null}
        <p className="mb-3 text-sm text-slate-600">
          Outstanding: <span className="font-mono font-medium">{formatBDT(collect?.due_balance)}</span>
        </p>
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
        <Field label="Notes">
          <Input value={pay.notes} onChange={(e) => setPay({ ...pay, notes: e.target.value })} />
        </Field>

        {openInvoices.length ? (
          <div className="mt-4">
            <p className="mb-2 text-sm font-medium text-slate-700">
              Allocate to invoices (optional) — allocated {formatBDT(allocatedTotal())}
            </p>
            <TableWrap className="max-h-56 overflow-auto border-0 shadow-none">
              <thead>
                <tr>
                  <Th>Invoice</Th>
                  <Th>Due</Th>
                  <Th>Apply</Th>
                </tr>
              </thead>
              <tbody>
                {openInvoices.map((s) => (
                  <tr key={s.id}>
                    <Td className="font-mono text-xs">{s.invoice_no}</Td>
                    <Td className="font-mono">{formatBDT(s.due_amount)}</Td>
                    <Td>
                      <Input
                        type="number"
                        min={0}
                        max={Number(s.due_amount || 0)}
                        className="w-28"
                        value={allocations[s.id] || ""}
                        onChange={(e) => setAllocations({ ...allocations, [s.id]: e.target.value })}
                      />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
            <p className="mt-1 text-xs text-slate-500">Leave blank to auto-allocate oldest invoices first.</p>
          </div>
        ) : null}

        <Btn className="mt-3" disabled={saving} onClick={() => void collectDue()}>
          {saving ? "Saving…" : "Record payment"}
        </Btn>
      </Modal>
    </div>
  );
}
