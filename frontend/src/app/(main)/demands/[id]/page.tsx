"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, downloadBlob } from "@/lib/api";
import type { PurchaseDemand, Supplier } from "@/lib/types";
import { Alert, Btn, Field, Input, PageHeader, Select, TableWrap, Td, Th } from "@/components/ui";
import { formatBDT, formatDate } from "@/lib/format";

const STATUSES = ["draft", "ordered", "partially_received", "received", "cancelled"];

function DemandDetailContent() {
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
      await api<{ id: string }>("/purchases", {
        method: "POST",
        body: JSON.stringify({
          demand_id: id,
          supplier_id: supplierId || undefined,
          notes: `From demand ${demand.demand_no || id.slice(0, 8)}`,
          items,
        }),
      });
      setConvertOpen(false);
      setMsg("Purchase created");
      router.push("/purchases");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Convert failed");
    }
  }

  function exportCsv() {
    if (!demand) return;
    const lines = [
      ["demand_no", "date", "status", "supplier", "product", "qty", "last_cost", "notes"].join(","),
      ...(demand.items || []).map((item) =>
        [
          demand.demand_no || "",
          demand.demand_date || "",
          demand.status,
          demand.supplier_name || "",
          `"${(item.product_name || item.product_id).replace(/"/g, '""')}"`,
          item.requested_qty,
          item.last_cost ?? "",
          `"${(demand.notes || "").replace(/"/g, '""')}"`,
        ].join(",")
      ),
    ];
    downloadBlob(lines.join("\n"), `demand-${demand.demand_no || id}.csv`);
  }

  if (!demand) return <p className="text-slate-500">Loading…</p>;

  const canConvert = !["received", "cancelled"].includes(demand.status);

  return (
    <div>
      <PageHeader title={`Demand ${demand.demand_no || id.slice(0, 8)}`}>
        <Btn variant="secondary" className="no-print flex-1 sm:flex-none" onClick={() => exportCsv()}>
          Export CSV
        </Btn>
        <Btn variant="secondary" className="no-print flex-1 sm:flex-none" onClick={() => window.print()}>
          Print
        </Btn>
        {canConvert ? (
          <Btn className="no-print w-full sm:w-auto" onClick={() => setConvertOpen(true)}>
            Convert to purchase
          </Btn>
        ) : null}
      </PageHeader>
      {msg ? <Alert tone="success">{msg}</Alert> : null}
      {error ? <Alert tone="error">{error}</Alert> : null}

      <div className="demand-print mb-4 space-y-1 text-sm">
        <p>
          <span className="text-slate-500">Date:</span> {formatDate(demand.demand_date || demand.created_at)}
        </p>
        <p>
          <span className="text-slate-500">Status:</span> {demand.status}
        </p>
        <p>
          <span className="text-slate-500">Supplier:</span> {demand.supplier_name || "—"}
        </p>
        {demand.notes ? (
          <p>
            <span className="text-slate-500">Notes:</span> {demand.notes}
          </p>
        ) : null}
      </div>

      <div className="no-print mb-4 flex flex-wrap items-end gap-3">
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
              <Td className="max-w-[12rem] truncate">{item.product_name || item.product_id}</Td>
              <Td className="font-mono">{item.requested_qty}</Td>
              <Td className="font-mono">{item.last_cost != null ? formatBDT(item.last_cost) : "—"}</Td>
            </tr>
          ))}
        </tbody>
      </TableWrap>

      {convertOpen ? (
        <div className="no-print mt-6 rounded-xl border border-slate-200 bg-white p-5">
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

export default function DemandDetailPage() {
  return (
    <Suspense fallback={<div className="p-6 text-slate-500">Loading demand…</div>}>
      <DemandDetailContent />
    </Suspense>
  );
}
