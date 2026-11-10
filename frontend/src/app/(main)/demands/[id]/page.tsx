"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { PurchaseDemand, Supplier } from "@/lib/types";
import { Alert, Btn, Field, Input, PageHeader, Select, TableWrap, Td, Th } from "@/components/ui";
import { formatBDT } from "@/lib/format";

const STATUSES = ["draft", "ordered", "partially_received", "received", "cancelled"];

export default function DemandDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [demand, setDemand] = useState<PurchaseDemand | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [status, setStatus] = useState("");
  const [convertOpen, setConvertOpen] = useState(false);
  const [supplierId, setSupplierId] = useState("");
  const [costs, setCosts] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const d = await api<PurchaseDemand>(`/purchases/demands/${id}`);
    setDemand(d);
    setStatus(d.status);
    if (d.preferred_supplier_id) setSupplierId(d.preferred_supplier_id);
    const init: Record<string, string> = {};
    for (const item of d.items || []) {
      init[item.product_id] = String(item.last_cost ?? "");
    }
    setCosts(init);
  }

  useEffect(() => {
    void load();
    void api<Supplier[]>("/purchases/suppliers").then(setSuppliers);
  }, [id]);

  async function saveStatus() {
    await api(`/purchases/demands/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
    setMsg("Status updated");
    await load();
  }

  async function convertToPurchase() {
    if (!demand?.items?.length) return;
    setError("");
    try {
      const items = demand.items.map((item) => ({
        product_id: item.product_id,
        quantity: item.requested_qty,
        unit_cost: Number(costs[item.product_id] || item.last_cost || 0),
      }));
      const purchase = await api<{ id: string }>("/purchases", {
        method: "POST",
        body: JSON.stringify({
          demand_id: id,
          supplier_id: supplierId || undefined,
          notes: `From demand ${demand.demand_no || id.slice(0, 8)}`,
          items,
        }),
      });
      setConvertOpen(false);
      setMsg(`Purchase ${purchase.id.slice(0, 8)} created`);
      router.push("/purchases");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Convert failed");
    }
  }

  if (!demand) return <p className="text-slate-500">Loading…</p>;

  return (
    <div>
      <PageHeader title={`Demand ${demand.demand_no || id.slice(0, 8)}`}>
        <Btn onClick={() => setConvertOpen(true)}>Convert to purchase</Btn>
      </PageHeader>
      {msg ? <Alert tone="success">{msg}</Alert> : null}
      {error ? <Alert tone="error">{error}</Alert> : null}
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Field label="Status">
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </Field>
        <Btn onClick={() => void saveStatus()}>Update status</Btn>
      </div>
      {demand.notes ? <p className="mb-4 text-sm text-slate-600">{demand.notes}</p> : null}
      <TableWrap>
        <thead>
          <tr>
            <Th>Product</Th>
            <Th>Requested qty</Th>
            <Th>Last cost</Th>
          </tr>
        </thead>
        <tbody>
          {(demand.items || []).map((item) => (
            <tr key={item.product_id}>
              <Td>{item.product_name || item.product_id}</Td>
              <Td className="font-mono">{item.requested_qty}</Td>
              <Td className="font-mono">{item.last_cost != null ? formatBDT(item.last_cost) : "—"}</Td>
            </tr>
          ))}
        </tbody>
      </TableWrap>

      {convertOpen ? (
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
          <h3 className="font-semibold">Create purchase from demand</h3>
          <Field label="Supplier">
            <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">—</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <TableWrap className="mt-3 border-0 shadow-none">
            <thead>
              <tr>
                <Th>Product</Th>
                <Th>Qty</Th>
                <Th>Unit cost</Th>
              </tr>
            </thead>
            <tbody>
              {(demand.items || []).map((item) => (
                <tr key={item.product_id}>
                  <Td>{item.product_name}</Td>
                  <Td className="font-mono">{item.requested_qty}</Td>
                  <Td>
                    <Input
                      value={costs[item.product_id] ?? ""}
                      onChange={(e) => setCosts({ ...costs, [item.product_id]: e.target.value })}
                    />
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
          <div className="mt-3 flex gap-2">
            <Btn onClick={() => void convertToPurchase()}>Create purchase</Btn>
            <Btn variant="secondary" onClick={() => setConvertOpen(false)}>
              Cancel
            </Btn>
          </div>
        </div>
      ) : null}
    </div>
  );
}
