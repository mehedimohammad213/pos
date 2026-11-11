"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Alert, Btn, Field, Input, Modal, PageHeader, Select, TableWrap, Td, Th } from "@/components/ui";
import { formatBDT, formatDate, todayISO } from "@/lib/format";
import { useMonthStartState, useTodayState } from "@/lib/use-client-date";

type ExpenseRow = { id: string; amount: number; note?: string; expense_date?: string; category_name?: string };
type ExpenseCategory = { id: string; name: string };

export default function ExpensesPage() {
  const [rows, setRows] = useState<ExpenseRow[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [from, setFrom] = useMonthStartState();
  const [to, setTo] = useTodayState();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ category_id: "", amount: "", expense_date: "", note: "" });
  const [error, setError] = useState("");

  async function load() {
    const qs = new URLSearchParams({ from, to });
    setRows(await api<ExpenseRow[]>(`/expenses?${qs}`));
  }

  useEffect(() => {
    void api<ExpenseCategory[]>("/expenses/categories").then(setCategories);
  }, []);

  useEffect(() => {
    setForm((f) => (f.expense_date ? f : { ...f, expense_date: todayISO() }));
  }, []);

  useEffect(() => {
    if (!from || !to) return;
    void load();
  }, [from, to]);

  async function save() {
    try {
      await api("/expenses", {
        method: "POST",
        body: JSON.stringify({
          category_id: form.category_id || undefined,
          amount: Number(form.amount),
          expense_date: form.expense_date,
          note: form.note || undefined,
        }),
      });
      setOpen(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  }

  return (
    <div>
      <PageHeader title="Expenses">
        <Btn onClick={() => setOpen(true)}>Add expense</Btn>
      </PageHeader>
      {error ? <Alert tone="error">{error}</Alert> : null}
      <div className="mb-4 grid max-w-md gap-3 sm:grid-cols-2">
        <Field label="From">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="To">
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
      </div>
      <TableWrap>
        <thead>
          <tr>
            <Th>Date</Th>
            <Th>Category</Th>
            <Th>Amount</Th>
            <Th>Note</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((e) => (
            <tr key={e.id}>
              <Td>{formatDate(e.expense_date)}</Td>
              <Td>{e.category_name || "—"}</Td>
              <Td className="font-mono">{formatBDT(e.amount)}</Td>
              <Td>{e.note}</Td>
            </tr>
          ))}
        </tbody>
      </TableWrap>

      <Modal open={open} onClose={() => setOpen(false)} title="New expense">
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
        <Field label="Amount">
          <Input value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
        </Field>
        <Field label="Date">
          <Input type="date" value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })} />
        </Field>
        <Field label="Note">
          <Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        </Field>
        <Btn className="mt-3" onClick={() => void save()}>
          Save
        </Btn>
      </Modal>
    </div>
  );
}
