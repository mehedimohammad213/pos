"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Alert, Btn, Field, Input, Modal, PageHeader, Select, TableWrap, Td, Th, Pagination } from "@/components/ui";
import type { PaginatedResponse } from "@/lib/types";
import { formatBDT, formatDate, todayISO } from "@/lib/format";
import { useMonthStartState, useTodayState } from "@/lib/use-client-date";

type ExpenseRow = { id: string; amount: number; note?: string; expense_date?: string; category_id?: string; category_name?: string };
type ExpenseCategory = { id: string; name: string };

const emptyForm = { category_id: "", amount: "", expense_date: "", note: "" };

export default function ExpensesPage() {
  const PAGE_SIZE = 10;
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const [rows, setRows] = useState<ExpenseRow[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [from, setFrom] = useMonthStartState();
  const [to, setTo] = useTodayState();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ExpenseRow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  async function load(p = page) {
    const qs = new URLSearchParams({
      from,
      to,
      page: String(p),
      limit: String(PAGE_SIZE),
    });
    const data = await api<PaginatedResponse<ExpenseRow>>(`/expenses?${qs}`);
    setRows(data.items);
    setTotal(data.total);
    setTotalPages(data.totalPages);
    setPage(data.page);
  }

  useEffect(() => {
    void api<ExpenseCategory[]>("/expenses/categories").then(setCategories);
  }, []);

  useEffect(() => {
    setForm((f) => (f.expense_date ? f : { ...f, expense_date: todayISO() }));
  }, []);

  useEffect(() => {
    if (!from || !to) return;
    void load(1);
  }, [from, to]);

  function openCreate() {
    setEditId(null);
    setForm({ ...emptyForm, expense_date: todayISO() });
    setError("");
    setOpen(true);
  }

  function openEdit(e: ExpenseRow) {
    setEditId(e.id);
    setForm({
      category_id: e.category_id || "",
      amount: String(e.amount ?? ""),
      expense_date: e.expense_date ? String(e.expense_date).slice(0, 10) : todayISO(),
      note: e.note || "",
    });
    setError("");
    setOpen(true);
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      const body = {
        category_id: form.category_id || undefined,
        amount: Number(form.amount),
        expense_date: form.expense_date,
        note: form.note || undefined,
      };
      if (editId) {
        await api(`/expenses/${editId}`, { method: "PATCH", body: JSON.stringify(body) });
        setMsg("Expense updated");
      } else {
        await api("/expenses", { method: "POST", body: JSON.stringify(body) });
        setMsg("Expense added");
      }
      setOpen(false);
      setEditId(null);
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
      await api(`/expenses/${deleteTarget.id}`, { method: "DELETE" });
      setMsg("Expense deleted");
      setDeleteTarget(null);
      await load(page);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <div>
      <PageHeader title="Expenses">
        <Btn onClick={openCreate}>Add expense</Btn>
      </PageHeader>
      {error && !open && !deleteTarget ? <Alert tone="error">{error}</Alert> : null}
      {msg ? <Alert tone="success">{msg}</Alert> : null}
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
            <Th className="hidden sm:table-cell">Note</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {rows.map((e) => (
            <tr key={e.id}>
              <Td>{formatDate(e.expense_date)}</Td>
              <Td>{e.category_name || "—"}</Td>
              <Td className="font-mono">{formatBDT(e.amount)}</Td>
              <Td className="hidden max-w-[12rem] truncate sm:table-cell">{e.note}</Td>
              <Td>
                <div className="flex flex-wrap justify-end gap-1">
                  <Btn variant="ghost" className="min-h-9 px-2 py-1 text-xs" onClick={() => openEdit(e)}>
                    Edit
                  </Btn>
                  <Btn
                    variant="ghost"
                    className="min-h-9 px-2 py-1 text-xs text-red-600 hover:text-red-700"
                    onClick={() => {
                      setError("");
                      setDeleteTarget(e);
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
        title={editId ? "Edit expense" : "New expense"}
      >
        {error && open ? <Alert tone="error">{error}</Alert> : null}
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
        <Btn className="mt-3" disabled={saving} onClick={() => void save()}>
          {saving ? "Saving…" : "Save"}
        </Btn>
      </Modal>

      <Modal
        open={!!deleteTarget}
        onClose={() => {
          if (!deleteBusy) setDeleteTarget(null);
        }}
        title="Delete expense"
      >
        <div className="space-y-4">
          {error && deleteTarget ? <Alert tone="error">{error}</Alert> : null}
          <p className="text-sm text-slate-600">
            Delete expense of{" "}
            <span className="font-mono font-medium text-slate-900">{formatBDT(deleteTarget?.amount)}</span>
            {deleteTarget?.category_name ? <> ({deleteTarget.category_name})</> : null}?
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
