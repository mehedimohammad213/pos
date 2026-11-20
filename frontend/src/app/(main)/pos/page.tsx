"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { BarcodeScanner } from "@/components/BarcodeScanner";
import { Alert, Btn, Field, Input, Modal, Select } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatBDT, todayISO } from "@/lib/format";
import { useTodayState } from "@/lib/use-client-date";
import type { CartItem, Customer, Product, Sale, Serial, ShopSettings } from "@/lib/types";
import { InvoicePreview } from "@/components/InvoicePreview";
import { PAYMENT_METHODS } from "@/lib/types";

type PayRow = { method: string; amount: string; reference: string };

const EMPTY_PAYMENT: PayRow = { method: "cash", amount: "", reference: "" };

export default function PosPage() {
  const { hasPermission } = useAuth();
  const [q, setQ] = useState("");
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
  const [payments, setPayments] = useState<PayRow[]>([{ ...EMPTY_PAYMENT }]);
  const [installment, setInstallment] = useState({ down: "", months: "3" });
  const [useInstallment, setUseInstallment] = useState(false);
  const [held, setHeld] = useState<Sale[]>([]);
  const [activeHoldId, setActiveHoldId] = useState<string | null>(null);
  const [cancelHoldTarget, setCancelHoldTarget] = useState<Sale | null>(null);
  const [cancelHoldBusy, setCancelHoldBusy] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [serialModal, setSerialModal] = useState<{ idx: number; product: Product; picked: string[] } | null>(
    null
  );
  const [availableSerials, setAvailableSerials] = useState<Serial[]>([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [shop, setShop] = useState<ShopSettings | null>(null);
  const [receipt, setReceipt] = useState<Sale | null>(null);
  const [mobilePane, setMobilePane] = useState<"products" | "cart">("products");
  const searchRef = useRef<HTMLInputElement>(null);
  const pendingCompleteMsgRef = useRef("");
  const successClearTimerRef = useRef<number | null>(null);
  const modalOpen = scanOpen || !!serialModal || !!receipt || addCustomerOpen || !!cancelHoldTarget;

  const subtotal = cart.reduce((s, l) => s + l.unit_price * l.quantity - l.discount_amount, 0);
  const discountAmt = Number(discount) || 0;
  const total = Math.max(0, subtotal - discountAmt);
  const paidTotal = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const prevTotalRef = useRef(total);

  // cacheComponents keeps this route mounted (Activity hidden). Clear sale entry when leaving
  // so returning to POS always starts a fresh cart / transaction.
  useLayoutEffect(() => {
    return () => {
      setQ("");
      setCart([]);
      setSaleType("retail");
      setSaleDate(todayISO());
      setDiscount("");
      setNotes("");
      setCustomerQ("");
      setCustomer(null);
      setCustomerNotFound(false);
      setCustomerSearching(false);
      setAddCustomerOpen(false);
      setCustomerSaving(false);
      setCustomerModalError("");
      setNewCustomer({ name: "", phone: "", address: "" });
      setPayments([{ ...EMPTY_PAYMENT }]);
      setInstallment({ down: "", months: "3" });
      setUseInstallment(false);
      setScanOpen(false);
      setSerialModal(null);
      setAvailableSerials([]);
      setError("");
      setSuccess("");
      setReceipt(null);
      setActiveHoldId(null);
      setCancelHoldTarget(null);
      setCancelHoldBusy(false);
      pendingCompleteMsgRef.current = "";
      if (successClearTimerRef.current != null) {
        window.clearTimeout(successClearTimerRef.current);
        successClearTimerRef.current = null;
      }
      setMobilePane("products");
      prevTotalRef.current = 0;
    };
  }, [setSaleDate]);

  // Auto-fill payment amount with cart total (single payment row only)
  useEffect(() => {
    const prevTotal = prevTotalRef.current;
    prevTotalRef.current = total;
    setPayments((prev) => {
      if (prev.length !== 1) return prev;
      const current = prev[0].amount;
      const wasEmpty = current === "";
      const matchedPrev = current === String(prevTotal) || Number(current) === prevTotal;
      if (!wasEmpty && !matchedPrev) return prev;
      const nextAmount = total > 0 ? String(total) : "";
      if (current === nextAmount) return prev;
      return [{ ...prev[0], amount: nextAmount }];
    });
  }, [total]);

  const focusSearch = useCallback(
    (force = false) => {
      if (modalOpen) return;
      requestAnimationFrame(() => {
        if (!force) {
          const active = document.activeElement;
          if (
            active instanceof HTMLElement &&
            active !== searchRef.current &&
            (active.tagName === "INPUT" ||
              active.tagName === "TEXTAREA" ||
              active.tagName === "SELECT" ||
              active.isContentEditable)
          ) {
            return;
          }
        }
        searchRef.current?.focus();
      });
    },
    [modalOpen]
  );

  const loadProducts = useCallback(async (search: string) => {
    const qs = new URLSearchParams();
    if (search) qs.set("q", search);
    const rows = await api<Product[]>(`/catalog/products?${qs}`);
    setProducts(rows.slice(0, 30));
  }, []);

  function clearSuccessSoon() {
    if (successClearTimerRef.current != null) {
      window.clearTimeout(successClearTimerRef.current);
    }
    successClearTimerRef.current = window.setTimeout(() => {
      setSuccess("");
      successClearTimerRef.current = null;
      void loadProducts(q);
      searchRef.current?.focus();
    }, 2000);
  }

  function closeReceipt() {
    setReceipt(null);
    const msg = pendingCompleteMsgRef.current;
    pendingCompleteMsgRef.current = "";
    if (msg) {
      setSuccess(msg);
      clearSuccessSoon();
    } else {
      window.setTimeout(() => searchRef.current?.focus(), 0);
    }
  }

  useEffect(() => {
    const t = setTimeout(() => void loadProducts(q), 250);
    return () => clearTimeout(t);
  }, [q, loadProducts]);

  useEffect(() => {
    void api<Sale[]>("/sales/held").then(setHeld).catch(() => setHeld([]));
    void api<ShopSettings>("/shop").then(setShop).catch(() => setShop(null));
  }, []);

  // Focus search as soon as the POS page is entered (and when modals close)
  useEffect(() => {
    focusSearch(true);
    const t1 = window.setTimeout(() => focusSearch(true), 50);
    const t2 = window.setTimeout(() => focusSearch(true), 200);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [focusSearch]);

  useEffect(() => {
    function isEditable(el: Element | null) {
      if (!el || !(el instanceof HTMLElement)) return false;
      if (el === searchRef.current) return true;
      const tag = el.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
      return el.isContentEditable;
    }

    function restoreIfNeeded() {
      if (modalOpen) return;
      if (isEditable(document.activeElement)) return;
      focusSearch();
    }

    const onPointerUp = () => {
      // After clicks on product cards / buttons, return focus to search
      window.setTimeout(restoreIfNeeded, 0);
    };
    const onFocusIn = () => {
      window.setTimeout(restoreIfNeeded, 0);
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") focusSearch();
    };

    document.addEventListener("pointerup", onPointerUp);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("pointerup", onPointerUp);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [focusSearch, modalOpen]);

  async function addProduct(p: Product) {
    const price =
      saleType === "wholesale" && p.wholesale_price != null ? Number(p.wholesale_price) : Number(p.retail_price);
    const existing = cart.find((c) => c.product.id === p.id);
    if (existing && !p.serial_required) {
      setCart(cart.map((c) => (c.product.id === p.id ? { ...c, quantity: c.quantity + 1 } : c)));
      focusSearch(true);
      return;
    }
    if (p.serial_required) {
      const serials = await api<Serial[]>(`/catalog/serials?product_id=${p.id}&status=in_stock`);
      setAvailableSerials(serials);
      setSerialModal({ idx: cart.length, product: p, picked: [] });
      return;
    }
    setCart([...cart, { product: p, quantity: 1, unit_price: price, discount_amount: 0, serial_ids: [] }]);
    focusSearch(true);
  }

  /** Enter / USB / camera: barcode lookup + add to cart first, else name/SKU search. */
  async function handleSearchSubmit(code: string, { requireBarcode = false } = {}) {
    const trimmed = code.trim();
    if (!trimmed) return;
    setError("");
    setQ(trimmed);
    setMobilePane("products");
    try {
      const p = await api<Product>(`/catalog/products/barcode/${encodeURIComponent(trimmed)}`);
      setProducts((prev) => [p, ...prev.filter((x) => x.id !== p.id)].slice(0, 30));
      await addProduct(p);
      setQ("");
      if (!p.serial_required) setMobilePane("cart");
    } catch {
      void loadProducts(trimmed);
      if (requireBarcode) setError(`No product for barcode: ${trimmed}`);
    }
    focusSearch(true);
  }

  async function onSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    await handleSearchSubmit(q);
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
      // Completing or re-holding after recall clears the old hold in the same API transaction.
      if (activeHoldId) {
        body.replace_hold_id = activeHoldId;
      }
      const soldQtyByProduct = new Map<string, number>();
      for (const line of cart) {
        soldQtyByProduct.set(line.product.id, (soldQtyByProduct.get(line.product.id) || 0) + line.quantity);
      }
      const sale = await api<Sale>("/sales", { method: "POST", body: JSON.stringify(body) });
      setActiveHoldId(null);
      if (hold) {
        setSuccess(`Held as ${sale.invoice_no || sale.id}`);
        clearSuccessSoon();
      } else {
        // Open invoice first; show complete message only after the invoice is closed.
        pendingCompleteMsgRef.current = `Sale ${sale.invoice_no || sale.id} complete`;
        setSuccess("");
        setReceipt(sale);
        // Stock is reduced only on completed sales (not holds) — update product cards immediately.
        setProducts((prev) =>
          prev.map((p) => {
            const sold = soldQtyByProduct.get(p.id);
            if (!sold) return p;
            return { ...p, stock_qty: Math.max(0, Number(p.stock_qty ?? 0) - sold) };
          })
        );
        void loadProducts(q);
      }
      setCart([]);
      setDiscount("");
      setNotes("");
      setCustomer(null);
      setCustomerQ("");
      setCustomerNotFound(false);
      setPayments([{ ...EMPTY_PAYMENT }]);
      void api<Sale[]>("/sales/held").then(setHeld).catch(() => setHeld([]));
      if (hold) focusSearch(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sale failed");
    }
  }

  async function recall(id: string) {
    setError("");
    setSuccess("");
    try {
      const heldSale = await api<Sale>(`/sales/${id}/recall`, { method: "POST", body: JSON.stringify({}) });
      const lines = heldSale.items || [];
      if (!lines.length) {
        setError("Held sale has no items");
        return;
      }
      const cartLines: CartItem[] = lines.map((it) => {
        const serials = Array.isArray(it.serials) ? it.serials : [];
        const product: Product = {
          id: String(it.product_id),
          name: it.product_name || "Product",
          sku: it.sku,
          barcode: it.barcode,
          retail_price: Number(it.unit_price),
          serial_required: Boolean(it.serial_required),
        };
        return {
          product,
          quantity: Number(it.quantity),
          unit_price: Number(it.unit_price),
          discount_amount: Number(it.discount_amount || 0),
          serial_ids: serials.map((s) => s.serial_id).filter(Boolean),
        };
      });
      setCart(cartLines);
      setActiveHoldId(heldSale.id);
      setSaleType(heldSale.sale_type === "wholesale" ? "wholesale" : "retail");
      setDiscount(Number(heldSale.discount_amount) > 0 ? String(Number(heldSale.discount_amount)) : "");
      setNotes(heldSale.notes || heldSale.hold_name || "");
      setUseInstallment(false);
      setPayments([{ ...EMPTY_PAYMENT }]);
      if (heldSale.customer_id) {
        setCustomer({
          id: heldSale.customer_id,
          name: heldSale.customer_name || "",
          phone: heldSale.customer_phone || "",
        });
        setCustomerQ(heldSale.customer_phone || "");
        setCustomerNotFound(false);
      } else {
        setCustomer(null);
        setCustomerQ("");
        setCustomerNotFound(false);
      }
      setMobilePane("cart");
      const missingSerials = cartLines.some(
        (l) => l.product.serial_required && l.serial_ids.length !== l.quantity
      );
      setSuccess(
        missingSerials
          ? "Hold loaded — re-select serial numbers before payment"
          : "Hold loaded into cart — take payment when ready"
      );
      focusSearch(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Recall failed");
    }
  }

  async function confirmCancelHold() {
    if (!cancelHoldTarget) return;
    const id = cancelHoldTarget.id;
    setError("");
    setSuccess("");
    setCancelHoldBusy(true);
    try {
      await api(`/sales/${id}/void`, { method: "POST" });
      if (activeHoldId === id) {
        setActiveHoldId(null);
        setCart([]);
        setDiscount("");
        setNotes("");
        setCustomer(null);
        setCustomerQ("");
        setCustomerNotFound(false);
        setPayments([{ ...EMPTY_PAYMENT }]);
      }
      setHeld((prev) => prev.filter((h) => h.id !== id));
      setCancelHoldTarget(null);
      setSuccess("Held sale cancelled");
      focusSearch(true);
      void api<Sale[]>("/sales/held").then(setHeld).catch(() => {
        /* keep optimistic list */
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cancel hold failed");
    } finally {
      setCancelHoldBusy(false);
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
    setMobilePane("cart");
    setSerialModal(null);
    focusSearch(true);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">Point of Sale</h1>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
          <Btn
            variant="secondary"
            className="flex-1 sm:flex-none"
            onClick={() => setScanOpen(true)}
            title="Scan barcode with camera into search"
          >
            Camera scan
          </Btn>
          <Btn
            variant="secondary"
            className="flex-1 sm:flex-none"
            onClick={() => focusSearch(true)}
            title="Focus search for USB barcode wedge"
          >
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
        searchRef={searchRef}
        focusSearch={focusSearch}
        q={q}
        setQ={setQ}
        onSearchSubmit={onSearchSubmit}
      />

      <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-white p-1 lg:hidden">
        <button
          type="button"
          onClick={() => setMobilePane("products")}
          className={`rounded-lg px-3 py-2.5 text-sm font-medium transition ${
            mobilePane === "products" ? "bg-teal-600 text-white" : "text-slate-600 hover:bg-slate-50"
          }`}
        >
          Products
        </button>
        <button
          type="button"
          onClick={() => setMobilePane("cart")}
          className={`rounded-lg px-3 py-2.5 text-sm font-medium transition ${
            mobilePane === "cart" ? "bg-teal-600 text-white" : "text-slate-600 hover:bg-slate-50"
          }`}
        >
          Cart{cart.length ? ` (${cart.length})` : ""}
          {held.length ? ` · ${held.length} held` : ""}
        </button>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-5 lg:items-stretch">
        <div className={`min-h-0 lg:col-span-2 ${mobilePane === "products" ? "block" : "hidden lg:block"}`}>
          <PosProductGrid
            products={products}
            addProduct={async (p) => {
              await addProduct(p);
              if (!p.serial_required) setMobilePane("cart");
            }}
            saleType={saleType}
          />
        </div>
        <div className={`min-h-0 lg:col-span-3 ${mobilePane === "cart" ? "block" : "hidden lg:block"}`}>
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
            onCancelHold={setCancelHoldTarget}
          />
        </div>
      </div>

      <Modal
        open={!!cancelHoldTarget}
        onClose={() => {
          if (!cancelHoldBusy) setCancelHoldTarget(null);
        }}
        title="Cancel held sale"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Cancel{" "}
            <span className="font-medium text-slate-900">
              {cancelHoldTarget?.hold_name || cancelHoldTarget?.invoice_no || "this held sale"}
            </span>
            ? It will be removed and cannot be restored.
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Btn
              variant="secondary"
              disabled={cancelHoldBusy}
              onClick={() => setCancelHoldTarget(null)}
            >
              Keep hold
            </Btn>
            <Btn variant="danger" disabled={cancelHoldBusy} onClick={() => void confirmCancelHold()}>
              {cancelHoldBusy ? "Cancelling…" : "Yes, cancel hold"}
            </Btn>
          </div>
        </div>
      </Modal>

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
          <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
            <Btn variant="secondary" type="button" onClick={() => setAddCustomerOpen(false)}>
              Cancel
            </Btn>
            <Btn type="submit" disabled={customerSaving}>
              {customerSaving ? "Adding…" : "Add customer"}
            </Btn>
          </div>
        </form>
      </Modal>

      <Modal open={!!receipt} onClose={closeReceipt} title="Invoice" wide>
        {receipt ? <InvoicePreview sale={receipt} shop={shop} onClose={closeReceipt} /> : null}
      </Modal>

      <Modal open={scanOpen} onClose={() => setScanOpen(false)} title="Camera barcode scan" wide>
        {scanOpen ? (
          <BarcodeScanner
            onScan={(code) => {
              setScanOpen(false);
              void handleSearchSubmit(code, { requireBarcode: true });
            }}
            onClose={() => setScanOpen(false)}
          />
        ) : null}
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
  searchRef: React.RefObject<HTMLInputElement | null>;
  focusSearch: (force?: boolean) => void;
  q: string;
  setQ: (v: string) => void;
  onSearchSubmit: (e: React.FormEvent) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
      <Field label="Search products" className="sm:col-span-2 lg:col-span-1">
        <form onSubmit={props.onSearchSubmit}>
          <Input
            ref={props.searchRef}
            autoFocus
            value={props.q}
            onChange={(e) => props.setQ(e.target.value)}
            placeholder="Name, SKU, or scan barcode…"
            className="text-base sm:text-lg"
            autoComplete="off"
            onBlur={() => {
              window.setTimeout(() => props.focusSearch(), 0);
            }}
          />
        </form>
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
  // ~10 products visible (5 rows × 2 cols); remaining scroll
  return (
    <div className="grid max-h-[min(34rem,calc(100dvh-14rem))] content-start gap-2 overflow-y-auto overscroll-contain sm:grid-cols-2 lg:max-h-[min(40rem,calc(100dvh-12rem))] lg:h-full">
      {products.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => void addProduct(p)}
          className="min-w-0 rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-teal-400 active:scale-[0.98] sm:p-4"
        >
          <p className="line-clamp-2 font-medium leading-snug">{p.name}</p>
          <p className="font-mono text-base text-teal-700 sm:text-lg">
            {formatBDT(saleType === "wholesale" ? p.wholesale_price ?? p.retail_price : p.retail_price)}
          </p>
          <p className="text-xs text-slate-500">Stock: {Number(p.stock_qty ?? 0)}</p>
        </button>
      ))}
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
  onCancelHold: (sale: Sale) => void;
}) {
  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4 lg:max-h-[min(40rem,calc(100dvh-12rem))] lg:overflow-y-auto">
      <h2 className="font-semibold">Cart</h2>
      <ul className="max-h-48 space-y-2 overflow-y-auto overscroll-contain sm:max-h-56">
        {props.cart.length === 0 ? (
          <li className="rounded-lg border border-dashed border-slate-200 px-3 py-6 text-center text-sm text-slate-500">
            No items yet. Add products, or recall a held sale.
          </li>
        ) : null}
        {props.cart.map((line, i) => (
          <li key={`${line.product.id}-${i}`} className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
            <div className="min-w-0 flex-1 basis-[10rem]">
              <p className="truncate font-medium">{line.product.name}</p>
              {line.serial_ids.length ? (
                <p className="text-xs text-slate-500">{line.serial_ids.length} serial(s)</p>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-2">
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
              <span className="min-w-[4.5rem] text-right font-mono text-sm">{formatBDT(line.unit_price * line.quantity)}</span>
              <Btn variant="ghost" className="px-2 text-red-600" onClick={() => props.setCart(props.cart.filter((_, j) => j !== i))}>
                ✕
              </Btn>
            </div>
          </li>
        ))}
      </ul>
      <div className="grid gap-2 sm:grid-cols-2 sm:items-end">
        <Field label="Order discount">
          <Input value={props.discountInput} onChange={(e) => props.setDiscountInput(e.target.value)} />
        </Field>
        <div className="flex items-end justify-between gap-2 sm:justify-end">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500 sm:hidden">Total</span>
          <span className="font-mono text-xl font-semibold">{formatBDT(props.total)}</span>
        </div>
      </div>
      <Field label="Customer">
        {props.customer ? (
          <div className="flex flex-col gap-2 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-sm text-teal-900 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-teal-950">{props.customer.name}</p>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <span className="font-mono text-xs text-teal-700">({props.customer.phone})</span>
                {Number(props.customer.due_balance) > 0 ? (
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">
                    Due: {formatBDT(Number(props.customer.due_balance))}
                  </span>
                ) : null}
              </div>
            </div>
            <Btn
              variant="ghost"
              className="shrink-0 self-end text-xs text-red-600 hover:text-red-700 sm:self-auto"
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
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
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
                className="w-full sm:max-w-xs"
              />
              <div className="flex flex-wrap gap-2">
                <Btn variant="secondary" className="flex-1 sm:flex-none" onClick={() => void props.searchCustomer()} disabled={props.customerSearching}>
                  {props.customerSearching ? "Searching…" : "Find customer"}
                </Btn>
                <Btn variant="secondary" className="flex-1 sm:flex-none" onClick={props.onOpenAddCustomer}>
                  + Add customer
                </Btn>
              </div>
            </div>

            {props.customerNotFound ? (
              <div className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 sm:flex-row sm:items-center sm:justify-between">
                <span className="min-w-0 break-words">Customer not found for &quot;{props.customerQ}&quot;</span>
                <Btn
                  variant="primary"
                  className="shrink-0 px-2.5 py-1 text-xs"
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
        <PurHolds held={props.held} recall={props.recall} onCancelHold={props.onCancelHold} />
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
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
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
        <div key={i} className="flex flex-col gap-2 sm:flex-row sm:items-start">
          <div className="grid min-w-0 flex-1 grid-cols-1 gap-2 sm:grid-cols-3">
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
          {payments.length > 1 ? (
            <Btn
              variant="ghost"
              className="shrink-0 px-2 text-red-600 sm:mt-1"
              title="Remove this payment"
              onClick={() => setPayments(payments.filter((_, j) => j !== i))}
            >
              ✕
            </Btn>
          ) : null}
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
    <div className="grid grid-cols-1 gap-3 pt-2 sm:grid-cols-2">
      <Btn className="min-h-12 py-3 text-base sm:py-4 sm:text-lg" onClick={() => void completeSale(false)}>
        Pay & complete
      </Btn>
      <Btn variant="secondary" className="min-h-12 py-3 text-base sm:py-4 sm:text-lg" onClick={() => void completeSale(true)}>
        Hold sale
      </Btn>
    </div>
  );
}

function PurHolds({
  held,
  recall,
  onCancelHold,
}: {
  held: Sale[];
  recall: (id: string) => void;
  onCancelHold: (sale: Sale) => void;
}) {
  return (
    <div className="border-t pt-3">
      <p className="text-xs font-medium uppercase text-slate-500">Held sales</p>
      {held.map((h) => (
        <div key={h.id} className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="min-w-0 flex-1 truncate">{h.hold_name || h.invoice_no || h.id.slice(0, 8)}</span>
          <div className="flex shrink-0 gap-1">
            <Btn variant="ghost" onClick={() => void recall(h.id)}>
              Recall
            </Btn>
            <Btn variant="ghost" className="text-red-600 hover:text-red-700" onClick={() => onCancelHold(h)}>
              Cancel
            </Btn>
          </div>
        </div>
      ))}
    </div>
  );
}
