"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Customer, PaginatedResponse, Product } from "@/lib/types";
import { Alert, Btn, Field, Input, PageHeader, Select, TableWrap, Td, Th } from "@/components/ui";
import { formatBDT } from "@/lib/format";

type ReturnLine = { product_id: string; quantity: string; unit_price: string; condition: "restock" | "defective" };
type NewLine = { product_id: string; quantity: string; unit_price: string };

export default function WalkInExchangePage() {
  const { hasPermission, user } = useAuth();
  const router = useRouter();
  const canWalkIn = hasPermission("walkin_exchange") || user?.role === "admin";

  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [saleType, setSaleType] = useState<"retail" | "wholesale">("retail");
  const [returnLines, setReturnLines] = useState<ReturnLine[]>([
    { product_id: "", quantity: "1", unit_price: "", condition: "restock" },
  ]);
  const [newLines, setNewLines] = useState<NewLine[]>([{ product_id: "", quantity: "1", unit_price: "" }]);
  const [fee, setFee] = useState("0");
  const [discount, setDiscount] = useState("0");
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("cash");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void api<Product[]>("/catalog/products").then(setProducts);
    void api<Customer[] | PaginatedResponse<Customer>>("/customers").then((data) => {
      setCustomers(Array.isArray(data) ? data : data.items || []);
    });
  }, []);

  function priceFor(productId: string) {
    const p = products.find((x) => x.id === productId);
    if (!p) return 0;
    return saleType === "wholesale" ? Number(p.wholesale_price || p.retail_price) : Number(p.retail_price);
  }

  function setReturnProduct(idx: number, product_id: string) {
    const next = [...returnLines];
    next[idx] = { ...next[idx], product_id, unit_price: String(priceFor(product_id) || "") };
    setReturnLines(next);
  }

  function setNewProduct(idx: number, product_id: string) {
    const next = [...newLines];
    next[idx] = { ...next[idx], product_id, unit_price: String(priceFor(product_id) || "") };
    setNewLines(next);
  }

  const returnedValue = returnLines.reduce(
    (s, l) => s + (Number(l.unit_price) || 0) * (Number(l.quantity) || 0),
    0
  );
  const newValue = newLines.reduce((s, l) => s + (Number(l.unit_price) || 0) * (Number(l.quantity) || 0), 0);
  const net = Math.round((newValue - returnedValue - (Number(discount) || 0) + (Number(fee) || 0)) * 100) / 100;

  async function submit() {
    if (!canWalkIn) {
      setError("Walk-in exchange permission required");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const return_items = returnLines
        .filter((l) => l.product_id && Number(l.quantity) > 0)
        .map((l) => ({
          product_id: l.product_id,
          quantity: Number(l.quantity),
          unit_price: Number(l.unit_price) || 0,
          condition: l.condition,
        }));
      const new_items = newLines
        .filter((l) => l.product_id && Number(l.quantity) > 0)
        .map((l) => ({
          product_id: l.product_id,
          quantity: Number(l.quantity),
          unit_price: Number(l.unit_price) || 0,
        }));
      if (!return_items.length || !new_items.length) {
        throw new Error("Add at least one return item and one new item");
      }
      const paid = payAmount !== "" ? Number(payAmount) : Math.max(net, 0);
      const result = await api<{ new_sale?: { id: string } }>("/sales/exchanges", {
        method: "POST",
        body: JSON.stringify({
          customer_id: customerId || undefined,
          sale_type: saleType,
          fee_amount: Number(fee) || 0,
          discount_amount: Number(discount) || 0,
          notes: notes || undefined,
          return_items,
          new_items,
          payments: [{ method: payMethod, amount: paid }],
        }),
      });
      setMsg("Walk-in exchange completed");
      if (result.new_sale?.id) router.push(`/sales/${result.new_sale.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Exchange failed");
    } finally {
      setSaving(false);
    }
  }

  if (!canWalkIn) {
    return (
      <div>
        <PageHeader title="Walk-in exchange" />
        <Alert tone="error">You do not have permission for walk-in exchanges.</Alert>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Walk-in exchange" />
      {msg ? <Alert tone="success">{msg}</Alert> : null}
      {error ? <Alert tone="error">{error}</Alert> : null}

      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <Field label="Customer (optional)">
          <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            <option value="">Walk-in</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.phone})
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Price mode">
          <Select value={saleType} onChange={(e) => setSaleType(e.target.value as "retail" | "wholesale")}>
            <option value="retail">Retail</option>
            <option value="wholesale">Wholesale</option>
          </Select>
        </Field>
        <Field label="Notes">
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>

      <section className="mb-6 rounded-xl border border-slate-200 bg-white p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Items returned</h2>
          <Btn
            variant="secondary"
            onClick={() =>
              setReturnLines([...returnLines, { product_id: "", quantity: "1", unit_price: "", condition: "restock" }])
            }
          >
            Add line
          </Btn>
        </div>
        <TableWrap className="border-0 shadow-none">
          <thead>
            <tr>
              <Th>Product</Th>
              <Th>Qty</Th>
              <Th>Unit price</Th>
              <Th className="hidden sm:table-cell">Condition</Th>
            </tr>
          </thead>
          <tbody>
            {returnLines.map((line, idx) => (
              <tr key={idx}>
                <Td className="min-w-0">
                  <Select value={line.product_id} onChange={(e) => setReturnProduct(idx, e.target.value)} className="min-w-0">
                    <option value="">Select…</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </Select>
                </Td>
                <Td>
                  <Input
                    className="w-20"
                    value={line.quantity}
                    onChange={(e) => {
                      const next = [...returnLines];
                      next[idx] = { ...line, quantity: e.target.value };
                      setReturnLines(next);
                    }}
                  />
                </Td>
                <Td>
                  <Input
                    className="w-28"
                    value={line.unit_price}
                    onChange={(e) => {
                      const next = [...returnLines];
                      next[idx] = { ...line, unit_price: e.target.value };
                      setReturnLines(next);
                    }}
                  />
                </Td>
                <Td className="hidden sm:table-cell">
                  <Select
                    value={line.condition}
                    onChange={(e) => {
                      const next = [...returnLines];
                      next[idx] = { ...line, condition: e.target.value as "restock" | "defective" };
                      setReturnLines(next);
                    }}
                  >
                    <option value="restock">Restock</option>
                    <option value="defective">Defective</option>
                  </Select>
                </Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      </section>

      <section className="mb-6 rounded-xl border border-slate-200 bg-white p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">New items</h2>
          <Btn
            variant="secondary"
            onClick={() => setNewLines([...newLines, { product_id: "", quantity: "1", unit_price: "" }])}
          >
            Add line
          </Btn>
        </div>
        <TableWrap className="border-0 shadow-none">
          <thead>
            <tr>
              <Th>Product</Th>
              <Th>Qty</Th>
              <Th>Unit price</Th>
            </tr>
          </thead>
          <tbody>
            {newLines.map((line, idx) => (
              <tr key={idx}>
                <Td>
                  <Select value={line.product_id} onChange={(e) => setNewProduct(idx, e.target.value)}>
                    <option value="">Select…</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </Select>
                </Td>
                <Td>
                  <Input
                    className="w-20"
                    value={line.quantity}
                    onChange={(e) => {
                      const next = [...newLines];
                      next[idx] = { ...line, quantity: e.target.value };
                      setNewLines(next);
                    }}
                  />
                </Td>
                <Td>
                  <Input
                    className="w-28"
                    value={line.unit_price}
                    onChange={(e) => {
                      const next = [...newLines];
                      next[idx] = { ...line, unit_price: e.target.value };
                      setNewLines(next);
                    }}
                  />
                </Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      </section>

      <section className="mb-6 grid gap-3 rounded-xl border border-slate-200 bg-white p-5 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Exchange fee">
          <Input type="number" min={0} value={fee} onChange={(e) => setFee(e.target.value)} />
        </Field>
        <Field label="Discount">
          <Input type="number" min={0} value={discount} onChange={(e) => setDiscount(e.target.value)} />
        </Field>
        <Field label="Pay now">
          <Input
            type="number"
            min={0}
            value={payAmount}
            placeholder={String(Math.max(net, 0))}
            onChange={(e) => setPayAmount(e.target.value)}
          />
        </Field>
        <Field label="Payment method">
          <Select value={payMethod} onChange={(e) => setPayMethod(e.target.value)}>
            <option value="cash">Cash</option>
            <option value="card">Card</option>
            <option value="bkash">bKash</option>
            <option value="nagad">Nagad</option>
          </Select>
        </Field>
        <div className="sm:col-span-2 lg:col-span-4 rounded-lg bg-slate-50 p-3 text-sm">
          <p>
            Returned {formatBDT(returnedValue)} · New {formatBDT(newValue)} · Net payable{" "}
            <span className="font-semibold font-mono">{formatBDT(net)}</span>
          </p>
        </div>
        <div className="sm:col-span-2 lg:col-span-4">
          <Btn disabled={saving} onClick={() => void submit()}>
            {saving ? "Saving…" : "Complete exchange"}
          </Btn>
        </div>
      </section>
    </div>
  );
}
