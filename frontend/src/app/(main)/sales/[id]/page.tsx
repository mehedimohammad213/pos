"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Product, Sale, ShopSettings } from "@/lib/types";
import { Alert, Btn, Input, PageHeader, TableWrap, Td, Th } from "@/components/ui";
import { InvoicePreview } from "@/components/InvoicePreview";
import { formatDate } from "@/lib/format";

function SaleDetailContent() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { hasPermission } = useAuth();
  const [sale, setSale] = useState<Sale | null>(null);
  const [shop, setShop] = useState<ShopSettings | null>(null);
  const [returnQty, setReturnQty] = useState<Record<string, string>>({});
  const [products, setProducts] = useState<Product[]>([]);
  const [exchangeNew, setExchangeNew] = useState({ product_id: "", quantity: "1" });
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setSale(await api<Sale>(`/sales/${id}`));
  }

  useEffect(() => {
    void load();
    void api<ShopSettings>("/shop").then(setShop);
    void api<Product[]>("/catalog/products").then(setProducts);
  }, [id]);

  async function voidSale() {
    if (!hasPermission("void")) {
      setError("No permission to void");
      return;
    }
    await api(`/sales/${id}/void`, { method: "POST" });
    setMsg("Sale voided");
    await load();
  }

  async function doExchange() {
    if (!sale?.items?.length) return;
    const return_items = sale.items
      .filter((i) => i.id && i.product_id && Number(returnQty[i.id] || 0) > 0)
      .map((i) => ({
        sale_item_id: i.id,
        product_id: i.product_id!,
        quantity: Number(returnQty[i.id!]),
        unit_price: Number(i.unit_price),
        condition: "restock" as const,
      }));
    if (!return_items.length) {
      setError("Enter quantities to exchange out");
      return;
    }
    const newProd = products.find((p) => p.id === exchangeNew.product_id);
    if (!newProd) {
      setError("Select replacement product");
      return;
    }
    try {
      await api("/sales/exchanges", {
        method: "POST",
        body: JSON.stringify({
          original_sale_id: id,
          customer_id: sale.customer_id,
          return_items,
          new_items: [
            {
              product_id: newProd.id,
              quantity: Number(exchangeNew.quantity) || 1,
              unit_price: Number(newProd.retail_price),
            },
          ],
          payments: [{ method: "cash", amount: 0 }],
        }),
      });
      setMsg("Exchange completed");
      router.push("/sales");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Exchange failed");
    }
  }

  async function doReturn() {
    if (!sale?.items?.length) return;
    const items = sale.items
      .filter((i) => i.id && Number(returnQty[i.id] || 0) > 0)
      .map((i) => ({
        sale_item_id: i.id!,
        quantity: Number(returnQty[i.id!]),
        condition: "restock" as const,
      }));
    if (!items.length) {
      setError("Enter return quantities");
      return;
    }
    try {
      await api("/sales/returns", {
        method: "POST",
        body: JSON.stringify({ sale_id: id, items, restock: true }),
      });
      setMsg("Return recorded");
      router.push("/sales");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Return failed");
    }
  }

  if (!sale) return <p>Loading…</p>;

  return (
    <div>
      <PageHeader title={`Invoice ${sale.invoice_no || id.slice(0, 8)}`}>
        {hasPermission("void") && sale.status === "completed" ? (
          <Btn variant="danger" className="no-print" onClick={() => void voidSale()}>
            Void
          </Btn>
        ) : null}
      </PageHeader>
      {msg ? <Alert tone="success">{msg}</Alert> : null}
      {error ? <Alert tone="error">{error}</Alert> : null}

      <InvoicePreview sale={sale} shop={shop} />

      {sale.status === "completed" ? (
        <div className="no-print mt-8">
          <h3 className="font-medium">Return items</h3>
          <TableWrap className="mt-2">
            <thead>
              <tr>
                <Th>Product</Th>
                <Th>Max</Th>
                <Th>Return qty</Th>
              </tr>
            </thead>
            <tbody>
              {(sale.items || []).map((line) =>
                line.id ? (
                  <tr key={line.id}>
                    <Td>{line.product_name}</Td>
                    <Td className="font-mono">{line.quantity}</Td>
                    <Td>
                      <Input
                        type="number"
                        min={0}
                        max={line.quantity}
                        className="w-24"
                        value={returnQty[line.id] || ""}
                        onChange={(e) => setReturnQty({ ...returnQty, [line.id!]: e.target.value })}
                      />
                    </Td>
                  </tr>
                ) : null
              )}
            </tbody>
          </TableWrap>
          <Btn className="mt-3" onClick={() => void doReturn()}>
            Submit return
          </Btn>

          <h3 className="mt-8 font-medium">Exchange</h3>
          <p className="text-sm text-slate-600">Use return qty above for items going back, then pick replacement.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <select
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              value={exchangeNew.product_id}
              onChange={(e) => setExchangeNew({ ...exchangeNew, product_id: e.target.value })}
            >
              <option value="">Replacement product</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <Input
              type="number"
              min={1}
              className="w-24"
              value={exchangeNew.quantity}
              onChange={(e) => setExchangeNew({ ...exchangeNew, quantity: e.target.value })}
            />
            <Btn onClick={() => void doExchange()}>Submit exchange</Btn>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function SaleDetailPage() {
  return (
    <Suspense fallback={<div className="p-6 text-slate-500">Loading sale details…</div>}>
      <SaleDetailContent />
    </Suspense>
  );
}

function SaleMetaInfo({ sale }: { sale: Sale }) {
  return (
    <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
      <p>
        <span className="text-slate-500">Date:</span> {formatDate(sale.sale_date)}
      </p>
      <p>
        <span className="text-slate-500">Customer:</span> {sale.customer_name || "Walk-in"}
      </p>
      <p>
        <span className="text-slate-500">Type:</span> {sale.sale_type}
      </p>
      <p>
        <span className="text-slate-500">Cashier:</span> {sale.cashier_name || "—"}
      </p>
    </div>
  );
}
