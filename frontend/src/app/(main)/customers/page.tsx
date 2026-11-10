"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Customer } from "@/lib/types";
import { Alert, Btn, Field, Input, Modal, PageHeader, TableWrap, Td, Th } from "@/components/ui";
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

export default function CustomersPage() {
  const [rows, setRows] = useState<Customer[]>([]);
  const [aging, setAging] = useState<AgingRow[]>([]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [collect, setCollect] = useState<Customer | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", address: "" });
  const [pay, setPay] = useState({ amount: "", method: "cash", notes: "" });
  const [error, setError] = useState("");
  const [showAging, setShowAging] = useState(false);

  async function load() {
    const qs = q ? `?q=${encodeURIComponent(q)}` : "";
    setRows(await api<Customer[]>(`/customers${qs}`));
  }

  useEffect(() => {
    const t = setTimeout(() => void load(), 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    void api<AgingRow[]>("/customers/due-aging").then(setAging);
  }, []);

  async function save() {
    try {
      await api("/customers", { method: "POST", body: JSON.stringify(form) });
      setOpen(false);
      setForm({ name: "", phone: "", address: "" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  }

  async function collectDue() {
    if (!collect) return;
    try {
      await api("/customers/collect-due", {
        method: "POST",
        body: JSON.stringify({
          customer_id: collect.id,
          amount: Number(pay.amount),
          method: pay.method,
          notes: pay.notes || undefined,
        }),
      });
      setCollect(null);
      await load();
      setAging(await api<AgingRow[]>("/customers/due-aging"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  }

  return (
    <div>
      <PageHeader title="Customers">
        <Btn variant="secondary" onClick={() => setShowAging((v) => !v)}>
          {showAging ? "Hide aging" : "Due aging"}
        </Btn>
        <Btn onClick={() => setOpen(true)}>Add customer</Btn>
      </PageHeader>
      {error ? <Alert tone="error">{error}</Alert> : null}
      <Input className="mb-4 max-w-md" placeholder="Search name or phone…" value={q} onChange={(e) => setQ(e.target.value)} />

      {showAging ? (
        <TableWrap className="mb-6">
          <thead>
            <tr>
              <Th>Customer</Th>
              <Th>Phone</Th>
              <Th>Total due</Th>
              <Th>0–30d</Th>
              <Th>31–60d</Th>
              <Th>61+d</Th>
            </tr>
          </thead>
          <tbody>
            {aging.map((a) => (
              <tr key={a.id}>
                <Td>{a.name}</Td>
                <Td className="font-mono">{a.phone}</Td>
                <Td className="font-mono">{formatBDT(a.due_balance)}</Td>
                <Td className="font-mono">{formatBDT(a.d0_30)}</Td>
                <Td className="font-mono">{formatBDT(a.d31_60)}</Td>
                <Td className="font-mono">{formatBDT(Number(a.d61_90 || 0) + Number(a.d90_plus || 0))}</Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      ) : null}

      <TableWrap>
        <thead>
          <tr>
            <Th>Name</Th>
            <Th>Phone</Th>
            <Th>Due balance</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id}>
              <Td>{c.name}</Td>
              <Td className="font-mono">{c.phone}</Td>
              <Td className="font-mono">{formatBDT(c.due_balance)}</Td>
              <Td>
                <Btn
                  variant="ghost"
                  className="text-xs"
                  disabled={!(c.due_balance && Number(c.due_balance) > 0)}
                  onClick={() => setCollect(c)}
                >
                  Collect due
                </Btn>
              </Td>
            </tr>
          ))}
        </tbody>
      </TableWrap>

      <Modal open={open} onClose={() => setOpen(false)} title="New customer">
        <Field label="Name">
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="Phone">
          <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </Field>
        <Field label="Address">
          <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        </Field>
        <Btn className="mt-3" onClick={() => void save()}>
          Save
        </Btn>
      </Modal>

      <Modal open={!!collect} onClose={() => setCollect(null)} title="Collect due">
        <Field label="Amount">
          <Input value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} />
        </Field>
        <Field label="Method">
          <Input value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })} />
        </Field>
        <Btn className="mt-3" onClick={() => void collectDue()}>
          Record payment
        </Btn>
      </Modal>
    </div>
  );
}
