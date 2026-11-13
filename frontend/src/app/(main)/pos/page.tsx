"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BarcodeScanner } from "@/components/BarcodeScanner";
import { Alert, Btn, Field, Input, Modal, Select } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatBDT } from "@/lib/format";
import { useTodayState } from "@/lib/use-client-date";
import type { CartItem, Customer, Product, Sale, Serial, ShopSettings } from "@/lib/types";
import { InvoicePreview } from "@/components/InvoicePreview";
import { PAYMENT_METHODS } from "@/lib/types";

type PayRow = { method: string; amount: string; reference: string };

export default function PosPage() {
  const { hasPermission } = useAuth();
  const [q, setQ] = useState("");
  const [barcode, setBarcode] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [saleType, setSaleType] = useState<"retail" | "wholesale">("retail");
  const [saleDate, setSaleDate] = useTodayState();
  const [discount, setDiscount] = useState("");
  const [notes, setNotes] = useState("");
  const [customerQ, setCustomerQ] = useState("");
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [customerNotFound, setCustomerNotFound] = useState(false);
  const [customerSearching, setCustomerSearching] = useState(false);
  const [addCustomerOpen, setAddCustomerOpen] = useState(false);
  const [customerSaving, setCustomerSaving] = useState(false);
  const [customerModalError, setCustomerModalError] = useState("");
  const [newCustomer, setNewCustomer] = useState({ name: "", phone: "", address: "" });
  const [payments, setPayments] = useState<PayRow[]>([{ method: "cash", amount: "", reference: "" }]);
  const [installment, setInstallment] = useState({ down: "", months: "3" });
  const [useInstallment, setUseInstallment] = useState(false);
  const [held, setHeld] = useState<Sale[]>([]);
  const [scanOpen, setScanOpen] = useState(false);
  const [serialModal, setSerialModal] = useState<{ idx: number; product: Product; picked: string[] } | null>(
    null
  );
  const [availableSerials, setAvailableSerials] = useState<Serial[]>([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [shop, setShop] = useState<ShopSettings | null>(null);
  const [receipt, setReceipt] = useState<Sale | null>(null);
  const barcodeRef = useRef<HTMLInputElement>(null);

  const subtotal = cart.reduce((s, l) => s + l.unit_price * l.quantity - l.discount_amount, 0);
  const discountAmt = Number(discount) || 0;
  const total = Math.max(0, subtotal - discountAmt);
  const paidTotal = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);

  const loadProducts = useCallback(async (search: string) => {
    const qs = new URLSearchParams();
    if (search) qs.set("q", search);
    const rows = await api<Product[]>(`/catalog/products?${qs}`);
    setProducts(rows.slice(0, 30));
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void loadProducts(q), 250);
    return () => clearTimeout(t);
  }, [q, loadProducts]);

  useEffect(() => {
    void api<Sale[]>("/sales/held").then(setHeld).catch(() => setHeld([]));
    void api<ShopSettings>("/shop").then(setShop).catch(() => setShop(null));
  }, []);

  async function addProduct(p: Product) {
    const price =
      saleType === "wholesale" && p.wholesale_price != null ? Number(p.wholesale_price) : Number(p.retail_price);
  const existing = cart.find((c) => c.product.id === p.id);
    if (existing && !p.serial_required) {
      setCart(cart.map((c) => (c.product.id === p.id ? { ...c, quantity: c.quantity + 1 } : c)));
      return;
    }
    if (p.serial_required) {
      const serials = await api<Serial[]>(`/catalog/serials?product_id=${p.id}&status=in_stock`);
      setAvailableSerials(serials);
      setSerialModal({ idx: cart.length, product: p, picked: [] });
      return;
    }
    setCart([...cart, { product: p, quantity: 1, unit_price: price, discount_amount: 0, serial_ids: [] }]);
  }

  async function onBarcodeSubmit(e: React.FormEvent) {
    e.preventDefault();
    const code = barcode.trim();
    if (!code) return;
    try {
      const p = await api<Product>(`/catalog/products/barcode/${encodeURIComponent(code)}`);
      await addProduct(p);
      setBarcode("");
    } catch {
      setError(`No product for barcode: ${code}`);
    }
    barcodeRef.current?.focus();
  }

  async function searchCustomer() {
    const q = customerQ.trim();
    if (!q) return;
    setError("");
    setCustomerSearching(true);
    setCustomerNotFound(false);
    try {
      const c = await api<Customer>(`/customers/by-phone/${encodeURIComponent(q)}`);
      setCustomer(c);
      setCustomerNotFound(false);
    } catch {
      setCustomer(null);
      setCustomerNotFound(true);
    } finally {
      setCustomerSearching(false);
    }
  }

  function openAddCustomer() {
    setNewCustomer({ name: "", phone: customerQ.trim(), address: "" });
    setCustomerModalError("");
    setAddCustomerOpen(true);
  }

  async function saveCustomer(e: React.FormEvent) {
    e.preventDefault();
    setCustomerModalError("");
    if (!newCustomer.name.trim()) {
      setCustomerModalError("Customer name is required");
      return;
    }
    if (!newCustomer.phone.trim()) {
      setCustomerModalError("Customer phone is required");
      return;
    }
    setCustomerSaving(true);
    try {
      const created = await api<Customer>("/customers", {
        method: "POST",
        body: JSON.stringify({
          name: newCustomer.name.trim(),
          phone: newCustomer.phone.trim(),
          address: newCustomer.address.trim() || undefined,
        }),
      });
      setCustomer(created);
      setCustomerQ(created.phone);
      setCustomerNotFound(false);
      setAddCustomerOpen(false);
      setSuccess(`Customer "${created.name}" added and selected`);
    } catch (err) {
      setCustomerModalError(err instanceof Error ? err.message : "Failed to add customer");
    } finally {
      setCustomerSaving(false);
    }
  }

  async function completeSale(hold = false) {
    setError("");
    setSuccess("");
    if (!cart.length) {
      setError("Cart is empty");
      return;
    }
    try {
      const body: Record<string, unknown> = {
        sale_type: saleType,
        discount_amount: discountAmt,
        notes,
        items: cart.map((l) => ({
          product_id: l.product.id,
          quantity: l.quantity,
          unit_price: l.unit_price,
          discount_amount: l.discount_amount,
          serial_ids: l.serial_ids.length ? l.serial_ids : undefined,
        })),
      };
      if (hasPermission("backdate_sale") && saleDate) body.sale_date = saleDate;
      if (customer) body.customer_id = customer.id;
      if (hold) {
        body.hold = true;
        body.hold_name = notes || `Hold ${new Date().toLocaleTimeString()}`;
      } else if (useInstallment) {
        const down = Number(installment.down) || 0;
        body.installment = {
          down_payment: down,
          months: Number(installment.months) || 3,
        };
        body.payments = down > 0 ? [{ method: "cash", amount: down }] : [];
      } else {
        body.payments = payments
          .filter((p) => Number(p.amount) > 0)
          .map((p) => ({ method: p.method, amount: Number(p.amount), reference: p.reference || undefined }));
      }
      const sale = await api<Sale>("/sales", { method: "POST", body: JSON.stringify(body) });
      setSuccess(hold ? `Held as ${sale.invoice_no || sale.id}` : `Sale ${sale.invoice_no || sale.id} complete`);
      if (!hold) setReceipt(sale);
      setCart([]);
      setDiscount("");
      setPayments([{ method: "cash", amount: "", reference: "" }]);
      if (hold) void api<Sale[]>("/sales/held").then(setHeld);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sale failed");
    }
  }

  async function recall(id: string) {
    try {
      await api(`/sales/${id}/recall`, { method: "POST", body: JSON.stringify({}) });
      setSuccess("Hold recalled — check sales list");
      setHeld(await api<Sale[]>("/sales/held"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Recall failed");
    }
  }

  function applySerials() {
    if (!serialModal) return;
    const price =
      saleType === "wholesale" && serialModal.product.wholesale_price != null
        ? Number(serialModal.product.wholesale_price)
        : Number(serialModal.product.retail_price);
    setCart([
      ...cart,
      {
        product: serialModal.product,
        quantity: serialModal.picked.length,
        unit_price: price,
        discount_amount: 0,
        serial_ids: serialModal.picked,
      },
    ]);
    setSerialModal(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-slate-900">Point of Sale</h1>
        <div className="flex flex-wrap gap-2">
          <Btn variant="secondary" onClick={() => setScanOpen(true)}>
            Camera scan
          </Btn>
          <Btn variant="secondary" onClick={() => barcodeRef.current?.focus()}>
            Barcode focus
          </Btn>
        </div>
      </div>

      {error ? <Alert tone="error">{error}</Alert> : null}
      {success ? <Alert tone="success">{success}</Alert> : null}

      <PosTopBar
        saleType={saleType}
        setSaleType={setSaleType}
        saleDate={saleDate}
        setSaleDate={setSaleDate}
        hasPermission={hasPermission}
        barcode={barcode}
        setBarcode={setBarcode}
        onBarcodeSubmit={onBarcodeSubmit}
        barcodeRef={barcodeRef}
        q={q}
        setQ={setQ}
      />

      <div className="grid gap-4 lg:grid-cols-5">
        <PosProductGrid products={products} addProduct={addProduct} saleType={saleType} />
        <PosCartPanel
          cart={cart}
          setCart={setCart}
          subtotal={subtotal}
          discount={discount}
          setDiscount={discountAmt}
          discountInput={discount}
          setDiscountInput={setDiscount}
          total={total}
          customerQ={customerQ}
          setCustomerQ={setCustomerQ}
          searchCustomer={searchCustomer}
          customer={customer}
          setCustomer={setCustomer}
          customerNotFound={customerNotFound}
          setCustomerNotFound={setCustomerNotFound}
          customerSearching={customerSearching}
          onOpenAddCustomer={openAddCustomer}
          payments={payments}
          setPayments={setPayments}
          paidTotal={paidTotal}
          useInstallment={useInstallment}
          setUseInstallment={setUseInstallment}
          installment={installment}
          setInstallment={setInstallment}
          notes={notes}
          setNotes={setNotes}
          completeSale={completeSale}
          held={held}
          recall={recall}
        />
      </div>

      <Modal open={addCustomerOpen} onClose={() => setAddCustomerOpen(false)} title="New customer">
        <form onSubmit={saveCustomer} className="space-y-3">
          {customerModalError ? <Alert tone="error">{customerModalError}</Alert> : null}
          <Field label="Phone">
            <Input
              required
              placeholder="e.g. 01XXXXXXXXX"
              value={newCustomer.phone}
              onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })}
            />
          </Field>
          <Field label="Name">
            <Input
              required
              autoFocus
              placeholder="Full name"
              value={newCustomer.name}
              onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })}
            />
          </Field>
          <Field label="Address (optional)">
            <Input
              placeholder="Address / Area"
              value={newCustomer.address}
              onChange={(e) => setNewCustomer({ ...newCustomer, address: e.target.value })}
            />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Btn variant="secondary" type="button" onClick={() => setAddCustomerOpen(false)}>
              Cancel
            </Btn>
            <Btn type="submit" disabled={customerSaving}>
              {customerSaving ? "Adding…" : "Add customer"}
            </Btn>
          </div>
        </form>
      </Modal>

      <Modal open={!!receipt} onClose={() => setReceipt(null)} title="Receipt" wide>
        {receipt ? <InvoicePreview sale={receipt} shop={shop} /> : null}
      </Modal>

      <Modal open={scanOpen} onClose={() => setScanOpen(false)} title="Scan barcode" wide>
        <BarcodeScanner
          onScan={(code) => {
            setScanOpen(false);
            setBarcode(code);
            void api<Product>(`/catalog/products/barcode/${encodeURIComponent(code)}`)
              .then(addProduct)
              .catch(() => setError("Product not found"));
          }}
          onClose={() => setScanOpen(false)}
        />
      </Modal>

      <Modal open={!!serialModal} onClose={() => setSerialModal(null)} title="Pick serials" wide>
        {serialModal ? (
          <div>
            <p className="text-sm text-slate-600">{serialModal.product.name}</p>
            <ul className="mt-3 max-h-60 space-y-1 overflow-y-auto">
              {availableSerials.map((s) => {
                const on = serialModal.picked.includes(s.id);
                return (
                  <li key={s.id}>
                    <label className="flex cursor-pointer items-center gap-2 rounded border border-slate-200 px-3 py-2">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() =>
                          setSerialModal({
                            ...serialModal,
                            picked: on
                              ? serialModal.picked.filter((x) => x !== s.id)
                              : [...serialModal.picked, s.id],
                          })
                        }
                      />
                      <span className="font-mono text-sm">{s.serial_number}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
            <Btn className="mt-4" disabled={!serialModal.picked.length} onClick={applySerials}>
              Add to cart
            </Btn>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

function PosTopBar(props: {
  saleType: "retail" | "wholesale";
  setSaleType: (v: "retail" | "wholesale") => void;
  saleDate: string;
  setSaleDate: (v: string) => void;
  hasPermission: (p: "backdate_sale" | "wholesale_price") => boolean;
  barcode: string;
  setBarcode: (v: string) => void;
  onBarcodeSubmit: (e: React.FormEvent) => void;
  barcodeRef: React.RefObject<HTMLInputElement | null>;
  q: string;
  setQ: (v: string) => void;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-4">
      <Field label="Sale type">
        <Select
          value={props.saleType}
          onChange={(e) => props.setSaleType(e.target.value as "retail" | "wholesale")}
          disabled={!props.hasPermission("wholesale_price")}
        >
          <option value="retail">Retail</option>
          <option value="wholesale">Wholesale</option>
        </Select>
      </Field>
      {props.hasPermission("backdate_sale") ? (
        <Field label="Sale date">
          <Input type="date" value={props.saleDate} onChange={(e) => props.setSaleDate(e.target.value)} />
        </Field>
      ) : null}
      <Field label="Barcode (USB wedge)">
        <form onSubmit={props.onBarcodeSubmit}>
          <Input
            ref={props.barcodeRef}
            value={props.barcode}
            onChange={(e) => props.setBarcode(e.target.value)}
            placeholder="Scan or type…"
            className="text-lg"
          />
        </form>
      </Field>
      <Field label="Search products">
        <Input value={props.q} onChange={(e) => props.setQ(e.target.value)} placeholder="Name, SKU…" className="text-lg" />
      </Field>
    </div>
  );
}

function PosProductGrid({
  products,
  addProduct,
  saleType,
}: {
  products: Product[];
  addProduct: (p: Product) => void;
  saleType: string;
}) {
  return (
    <div className="lg:col-span-2">
      <div className="grid max-h-[420px] gap-2 overflow-y-auto sm:grid-cols-2">
        {products.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => void addProduct(p)}
            className="rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-teal-400 active:scale-[0.98]"
          >
            <p className="font-medium">{p.name}</p>
            <p className="font-mono text-lg text-teal-700">
              {formatBDT(saleType === "wholesale" ? p.wholesale_price ?? p.retail_price : p.retail_price)}
            </p>
            <p className="text-xs text-slate-500">Stock: {Number(p.stock_qty ?? 0)}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

function PosCartPanel(props: {
  cart: CartItem[];
  setCart: (c: CartItem[]) => void;
  subtotal: number;
  discount: string;
  setDiscount: number;
  discountInput: string;
  setDiscountInput: (v: string) => void;
  total: number;
  customerQ: string;
  setCustomerQ: (v: string) => void;
  searchCustomer: () => void;
  customer: Customer | null;
  setCustomer: (c: Customer | null) => void;
  customerNotFound: boolean;
  setCustomerNotFound: (v: boolean) => void;
  customerSearching: boolean;
  onOpenAddCustomer: () => void;
  payments: PayRow[];
  setPayments: (p: PayRow[]) => void;
  paidTotal: number;
  useInstallment: boolean;
  setUseInstallment: (v: boolean) => void;
  installment: { down: string; months: string };
  setInstallment: (v: { down: string; months: string }) => void;
  notes: string;
  setNotes: (v: string) => void;
  completeSale: (hold?: boolean) => void;
  held: Sale[];
  recall: (id: string) => void;
}) {
  return (
    <div className="lg:col-span-3 space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="font-semibold">Cart</h2>
      <ul className="max-h-48 space-y-2 overflow-y-auto">
        {props.cart.map((line, i) => (
          <li key={`${line.product.id}-${i}`} className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
            <div>
              <p className="font-medium">{line.product.name}</p>
              {line.serial_ids.length ? (
                <p className="text-xs text-slate-500">{line.serial_ids.length} serial(s)</p>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                className="w-16"
                value={line.quantity}
                onChange={(e) => {
                  const next = [...props.cart];
                  next[i] = { ...line, quantity: Number(e.target.value) || 1 };
                  props.setCart(next);
                }}
              />
              <span className="font-mono">{formatBDT(line.unit_price * line.quantity)}</span>
              <Btn variant="ghost" className="text-red-600" onClick={() => props.setCart(props.cart.filter((_, j) => j !== i))}>
                ✕
              </Btn>
            </div>
          </li>
        ))}
      </ul>
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="Order discount">
          <Input value={props.discountInput} onChange={(e) => props.setDiscountInput(e.target.value)} />
        </Field>
        <div className="flex items-end justify-end font-mono text-xl font-semibold">{formatBDT(props.total)}</div>
      </div>
      <Field label="Customer">
        {props.customer ? (
          <div className="flex items-center justify-between rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-sm text-teal-900">
            <div className="min-w-0">
              <span className="font-medium text-teal-950">{props.customer.name}</span>
              <span className="ml-2 font-mono text-xs text-teal-700">({props.customer.phone})</span>
              {Number(props.customer.due_balance) > 0 ? (
                <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">
                  Due: {formatBDT(Number(props.customer.due_balance))}
                </span>
              ) : null}
            </div>
            <Btn
              variant="ghost"
              className="text-xs text-red-600 hover:text-red-700"
              onClick={() => {
                props.setCustomer(null);
                props.setCustomerNotFound(false);
              }}
            >
              Change
            </Btn>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              <Input
                placeholder="Customer phone"
                value={props.customerQ}
                onChange={(e) => {
                  props.setCustomerQ(e.target.value);
                  if (props.customerNotFound) props.setCustomerNotFound(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void props.searchCustomer();
                  }
                }}
                className="max-w-xs"
              />
              <Btn variant="secondary" onClick={() => void props.searchCustomer()} disabled={props.customerSearching}>
                {props.customerSearching ? "Searching…" : "Find customer"}
              </Btn>
              <Btn variant="secondary" onClick={props.onOpenAddCustomer}>
                + Add customer
              </Btn>
            </div>

            {props.customerNotFound ? (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <span>Customer not found for &quot;{props.customerQ}&quot;</span>
                <Btn
                  variant="primary"
                  className="px-2.5 py-1 text-xs"
                  onClick={props.onOpenAddCustomer}
                >
                  Add customer
                </Btn>
              </div>
            ) : null}
          </div>
        )}
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={props.useInstallment} onChange={(e) => props.setUseInstallment(e.target.checked)} />
        Installment plan
      </label>
      {props.useInstallment ? (
        <InstallmentFields installment={props.installment} setInstallment={props.setInstallment} />
      ) : (
        <PaymentFields payments={props.payments} setPayments={props.setPayments} total={props.total} paidTotal={props.paidTotal} />
      )}
      <Field label="Notes">
        <Input value={props.notes} onChange={(e) => props.setNotes(e.target.value)} />
      </Field>
      <CartActions completeSale={props.completeSale} />
      {props.held.length ? (
        <PurHolds held={props.held} recall={props.recall} />
      ) : null}
    </div>
  );
}

function InstallmentFields({
  installment,
  setInstallment,
}: {
  installment: { down: string; months: string };
  setInstallment: (v: { down: string; months: string }) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <Field label="Down payment">
        <Input value={installment.down} onChange={(e) => setInstallment({ ...installment, down: e.target.value })} />
      </Field>
      <Field label="Months">
        <Input value={installment.months} onChange={(e) => setInstallment({ ...installment, months: e.target.value })} />
      </Field>
    </div>
  );
}

function PaymentFields({
  payments,
  setPayments,
  total,
  paidTotal,
}: {
  payments: PayRow[];
  setPayments: (p: PayRow[]) => void;
  total: number;
  paidTotal: number;
}) {
  return (
    <div className="space-y-2">
      {payments.map((p, i) => (
        <div key={i} className="grid grid-cols-3 gap-2">
          <Select
            value={p.method}
            onChange={(e) => {
              const next = [...payments];
              next[i] = { ...p, method: e.target.value };
              setPayments(next);
            }}
          >
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </Select>
          <Input
            placeholder="Amount"
            value={p.amount}
            onChange={(e) => {
              const next = [...payments];
              next[i] = { ...p, amount: e.target.value };
              setPayments(next);
            }}
          />
          <Input
            placeholder="Ref"
            value={p.reference}
            onChange={(e) => {
              const next = [...payments];
              next[i] = { ...p, reference: e.target.value };
              setPayments(next);
            }}
          />
        </div>
      ))}
      <Btn
        variant="secondary"
        className="text-xs"
        onClick={() => setPayments([...payments, { method: "cash", amount: String(Math.max(0, total - paidTotal)), reference: "" }])}
      >
        + Split payment
      </Btn>
    </div>
  );
}

function CartActions({ completeSale }: { completeSale: (hold?: boolean) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3 pt-2">
      <Btn className="py-4 text-lg" onClick={() => void completeSale(false)}>
        Pay & complete
      </Btn>
      <Btn variant="secondary" className="py-4 text-lg" onClick={() => void completeSale(true)}>
        Hold sale
      </Btn>
    </div>
  );
}

function PurHolds({ held, recall }: { held: Sale[]; recall: (id: string) => void }) {
  return (
    <div className="border-t pt-3">
      <p className="text-xs font-medium uppercase text-slate-500">Held sales</p>
      {held.map((h) => (
        <div key={h.id} className="mt-2 flex items-center justify-between text-sm">
          <span>{h.hold_name || h.invoice_no || h.id.slice(0, 8)}</span>
          <Btn variant="ghost" onClick={() => void recall(h.id)}>
            Recall
          </Btn>
        </div>
      ))}
    </div>
  );
}
