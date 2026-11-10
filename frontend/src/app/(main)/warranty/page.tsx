"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Alert, Btn, Field, Input, Modal, PageHeader, Select, TableWrap, Td, Th } from "@/components/ui";
import { formatDate } from "@/lib/format";

type WarrantyRow = {
  id: string;
  serial_number?: string;
  product_name?: string;
  customer_name?: string;
  status: string;
  issue_description?: string;
  created_at?: string;
};

export default function WarrantyPage() {
  const [rows, setRows] = useState<WarrantyRow[]>([]);
  const [open, setOpen] = useState(false);
  const [resolve, setResolve] = useState<WarrantyRow | null>(null);
  const [form, setForm] = useState({ serial_id: "", issue_description: "", notes: "" });
  const [resolution, setResolution] = useState("repair");
  const [error, setError] = useState("");

  async function load() {
    setRows(await api<WarrantyRow[]>("/warranty"));
  }

  useEffect(() => {
    void load();
  }, []);

  async function createClaim() {
    try {
      await api("/warranty", {
        method: "POST",
        body: JSON.stringify({
          serial_id: form.serial_id,
          issue_description: form.issue_description,
          notes: form.notes || undefined,
        }),
      });
      setOpen(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  }

  async function resolveClaim() {
    if (!resolve) return;
    try {
      await api(`/warranty/${resolve.id}/resolve`, {
        method: "PATCH",
        body: JSON.stringify({ resolution, status: "resolved" }),
      });
      setResolve(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  }

  return (
    <div>
      <PageHeader title="Warranty claims">
        <Btn onClick={() => setOpen(true)}>New claim</Btn>
      </PageHeader>
      {error ? <Alert tone="error">{error}</Alert> : null}
      <TableWrap>
        <thead>
          <tr>
            <Th>Date</Th>
            <Th>Product</Th>
            <Th>Serial</Th>
            <Th>Customer</Th>
            <Th>Status</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {rows.map((w) => (
            <tr key={w.id}>
              <Td>{formatDate(w.created_at)}</Td>
              <Td>{w.product_name}</Td>
              <Td className="font-mono text-xs">{w.serial_number}</Td>
              <Td>{w.customer_name}</Td>
              <Td>{w.status}</Td>
              <Td>
                {w.status !== "resolved" ? (
                  <Btn variant="ghost" className="text-xs" onClick={() => setResolve(w)}>
                    Resolve
                  </Btn>
                ) : null}
              </Td>
            </tr>
          ))}
        </tbody>
      </TableWrap>

      <Modal open={open} onClose={() => setOpen(false)} title="Warranty claim">
        <Field label="Serial ID (UUID)">
          <Input value={form.serial_id} onChange={(e) => setForm({ ...form, serial_id: e.target.value })} />
        </Field>
        <Field label="Issue">
          <Input value={form.issue_description} onChange={(e) => setForm({ ...form, issue_description: e.target.value })} />
        </Field>
        <Field label="Notes">
          <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </Field>
        <Btn className="mt-3" onClick={() => void createClaim()}>
          Submit
        </Btn>
      </Modal>

      <Modal open={!!resolve} onClose={() => setResolve(null)} title="Resolve claim">
        <Field label="Resolution">
          <Select value={resolution} onChange={(e) => setResolution(e.target.value)}>
            <option value="repair">Repair</option>
            <option value="replace">Replace</option>
            <option value="reject">Reject</option>
          </Select>
        </Field>
        <Btn className="mt-3" onClick={() => void resolveClaim()}>
          Confirm
        </Btn>
      </Modal>
    </div>
  );
}
