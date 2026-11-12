"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Alert, Btn, Field, Input, Modal, PageHeader, TableWrap, Td, Th, Pagination } from "@/components/ui";
import type { PaginatedResponse } from "@/lib/types";
import { formatBDT, formatDate } from "@/lib/format";

type EmiPlan = {
  id: string;
  sale_id: string;
  customer_name?: string;
  status?: string;
  total_amount?: number;
  monthly_amount?: number;
};

type OverdueDue = {
  id: string;
  plan_id: string;
  customer_name?: string;
  due_date: string;
  amount: number;
  paid_amount: number;
  status: string;
};

export default function InstallmentsPage() {
  const PAGE_SIZE = 10;
  const [plans, setPlans] = useState<EmiPlan[]>([]);
  const [overdue, setOverdue] = useState<OverdueDue[]>([]);
  const [pagePlans, setPagePlans] = useState(1);
  const [totalPagesPlans, setTotalPagesPlans] = useState(1);
  const [totalPlans, setTotalPlans] = useState(0);
  const [pageOverdue, setPageOverdue] = useState(1);
  const [totalPagesOverdue, setTotalPagesOverdue] = useState(1);
  const [totalOverdue, setTotalOverdue] = useState(0);
  const [payTarget, setPayTarget] = useState<OverdueDue | null>(null);
  const [payForm, setPayForm] = useState({ amount: "", method: "cash", notes: "" });
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");


// Load installment plans with pagination
  async function loadPlans(p = pagePlans) {
    const qs = new URLSearchParams({
      page: String(p),
      limit: String(PAGE_SIZE),
    });
    const data = await api<PaginatedResponse<EmiPlan>>(`/installments?${qs}`);
    setPlans(data.items);
    setTotalPlans(data.total);
    setTotalPagesPlans(data.totalPages);
    setPagePlans(data.page);
  }

  // Load overdue installments with pagination
  async function loadOverdue(p = pageOverdue) {
    const qs = new URLSearchParams({
      page: String(p),
      limit: String(PAGE_SIZE),
    });
    const data = await api<PaginatedResponse<OverdueDue>>(`/installments/overdue?${qs}`);
    setOverdue(data.items);
    setTotalOverdue(data.total);
    setTotalPagesOverdue(data.totalPages);
    setPageOverdue(data.page);
  }

  // Initial load for both tables
  useEffect(() => {
    void loadPlans(1);
    void loadOverdue(1);
  }, []);



  async function pay() {
    if (!payTarget) return;
    try {
      await api("/installments/pay", {
        method: "POST",
        body: JSON.stringify({
          due_id: payTarget.id,
          amount: Number(payForm.amount),
          method: payForm.method,
          notes: payForm.notes || undefined,
        }),
      });
      setPayTarget(null);
      setMsg("Payment recorded");
      await Promise.all([loadPlans(pagePlans), loadOverdue(pageOverdue)]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Payment failed");
    }
  }

  return (
    <div>
      <PageHeader title="Installments" />
      {msg ? <Alert tone="success">{msg}</Alert> : null}
      {error ? <Alert tone="error">{error}</Alert> : null}

      <h2 className="mb-2 font-medium text-slate-700">Overdue</h2>
      <div className="mb-8">
      <TableWrap>
        <thead>
          <tr>
            <Th>Customer</Th>
            <Th>Due date</Th>
            <Th>Amount</Th>
            <Th>Paid</Th>
            <Th>Status</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {overdue.map((d) => (
            <tr key={d.id}>
              <Td>{d.customer_name}</Td>
              <Td>{formatDate(d.due_date)}</Td>
              <Td className="font-mono">{formatBDT(d.amount)}</Td>
              <Td className="font-mono">{formatBDT(d.paid_amount)}</Td>
              <Td>{d.status}</Td>
              <Td>
                <Btn variant="ghost" className="text-xs" onClick={() => setPayTarget(d)}>
                  Pay
                </Btn>
              </Td>
            </tr>
          ))}
        </tbody>
      </TableWrap>
      </div>

      <Pagination
        page={pageOverdue}
        totalPages={totalPagesOverdue}
        total={totalOverdue}
        limit={PAGE_SIZE}
        onPage={(p) => { setPageOverdue(p); void loadOverdue(p); }}
      />

      <h2 className="mb-2 font-medium text-slate-700">All plans</h2>
      <TableWrap>
        <thead>
          <tr>
            <Th>Customer</Th>
            <Th>Total</Th>
            <Th>Monthly</Th>
            <Th>Status</Th>
          </tr>
        </thead>
        <tbody>
          {plans.map((p) => (
            <tr key={p.id}>
              <Td>{p.customer_name}</Td>
              <Td className="font-mono">{formatBDT(p.total_amount)}</Td>
              <Td className="font-mono">{formatBDT(p.monthly_amount)}</Td>
              <Td>{p.status}</Td>
            </tr>
          ))}
        </tbody>
      </TableWrap>
      <Pagination
        page={pagePlans}
        totalPages={totalPagesPlans}
        total={totalPlans}
        limit={PAGE_SIZE}
        onPage={(p) => { setPagePlans(p); void loadPlans(p); }}
      />

      <Modal open={!!payTarget} onClose={() => setPayTarget(null)} title="Pay EMI">
        <Field label="Amount">
          <Input value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} />
        </Field>
        <Field label="Method">
          <Input value={payForm.method} onChange={(e) => setPayForm({ ...payForm, method: e.target.value })} />
        </Field>
        <Btn className="mt-3" onClick={() => void pay()}>
          Submit
        </Btn>
      </Modal>
    </div>
  );
}
