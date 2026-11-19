"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BarcodeInputs } from "@/components/BarcodeInputs";
import { Alert, Btn, Card, Drawer, Field, Input, Modal, Select } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Brand, Category, Product } from "@/lib/types";

const defaultProduct = {
  name: "",
  sku: "",
  barcode: "",
  category_id: "",
  brand_id: "",
  unit: "pcs",
  retail_price: "",
  wholesale_price: "",
  cost: "",
  reorder_level: "5",
  initial_qty: "0",
  warranty_months: "0",
  serial_required: false,
};

type ProductForm = typeof defaultProduct;

type SavedProductEntry = {
  product: Product;
  form: ProductForm;
};

const UNIT_OPTIONS = (
  <>
    <option value="pcs">Pieces (pcs)</option>
    <option value="box">Box</option>
    <option value="meter">Meter</option>
    <option value="kg">Kilogram (kg)</option>
    <option value="set">Set</option>
    <option value="pkt">Packet (pkt)</option>
    <option value="roll">Roll</option>
    <option value="feet">Feet</option>
  </>
);

function generateSKU(name?: string): string {
  const prefix = name
    ? name
        .trim()
        .slice(0, 3)
        .toUpperCase()
        .replace(/[^A-Z]/g, "PRD")
    : "PRD";
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${rand}`;
}

function formatMoney(value: string | number | undefined) {
  const n = Number(value ?? 0);
  if (Number.isNaN(n)) return "—";
  return `৳${n.toLocaleString()}`;
}

function validateProductForm(form: ProductForm): string | null {
  if (!form.name.trim()) return "Product name is required";
  if (!form.sku.trim()) return "SKU is required (use 'Generate SKU' if not provided)";
  if (!form.barcode.trim()) {
    return "Barcode is required (use manual input, scanner, or 'Generate random')";
  }
  if (!form.retail_price || Number(form.retail_price) < 0) {
    return "Valid retail price is required";
  }
  return null;
}

function buildCreateBody(form: ProductForm) {
  return {
    name: form.name.trim(),
    sku: form.sku.trim(),
    barcode: form.barcode.trim(),
    category_id: form.category_id || undefined,
    brand_id: form.brand_id || undefined,
    unit: form.unit || "pcs",
    retail_price: Number(form.retail_price) || 0,
    wholesale_price: form.wholesale_price ? Number(form.wholesale_price) : 0,
    cost: form.cost ? Number(form.cost) : 0,
    reorder_level: Number(form.reorder_level) || 0,
    warranty_months: Number(form.warranty_months) || 0,
    serial_required: form.serial_required,
    initial_qty: Number(form.initial_qty) || 0,
  };
}

function buildUpdateBody(form: ProductForm) {
  return {
    name: form.name.trim(),
    sku: form.sku.trim(),
    barcode: form.barcode.trim(),
    category_id: form.category_id || undefined,
    brand_id: form.brand_id || undefined,
    unit: form.unit || "pcs",
    retail_price: Number(form.retail_price) || 0,
    wholesale_price: form.wholesale_price ? Number(form.wholesale_price) : 0,
    cost: form.cost ? Number(form.cost) : 0,
    reorder_level: Number(form.reorder_level) || 0,
    warranty_months: Number(form.warranty_months) || 0,
    serial_required: form.serial_required,
  };
}

export default function NewProductPage() {
  const router = useRouter();
  const { user, canSeeCost } = useAuth();
  const scannerRef = useRef<HTMLInputElement>(null);
  const formTopRef = useRef<HTMLDivElement>(null);

  const [openCameraRequest, setOpenCameraRequest] = useState(0);
  const [form, setForm] = useState<ProductForm>(defaultProduct);
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [savedProducts, setSavedProducts] = useState<SavedProductEntry[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Modals for inline creation
  const [newCatOpen, setNewCatOpen] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [newBrandOpen, setNewBrandOpen] = useState(false);
  const [newBrandName, setNewBrandName] = useState("");

  const [loading, setLoading] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [drawerError, setDrawerError] = useState("");

  const canManageProducts =
    user?.role === "admin" || user?.role === "manager" || user?.role === "stock";

  const editingEntry = editingId
    ? savedProducts.find((s) => s.product.id === editingId) ?? null
    : null;

  useEffect(() => {
    void api<Category[]>("/catalog/categories").then(setCategories);
    void api<Brand[]>("/catalog/brands").then(setBrands);
  }, []);

  function focusBarcodeScanner() {
    scannerRef.current?.focus();
    scannerRef.current?.select();
  }

  function openEditDrawer(id: string) {
    setDrawerError("");
    setEditingId(id);
  }

  function closeEditDrawer() {
    setEditingId(null);
    setDrawerError("");
  }

  function updateSavedForm(id: string, patch: Partial<ProductForm>) {
    setSavedProducts((prev) =>
      prev.map((entry) =>
        entry.product.id === id
          ? { ...entry, form: { ...entry.form, ...patch } }
          : entry
      )
    );
  }

  async function handleCreateCategory() {
    if (!newCatName.trim()) return;
    try {
      const created = await api<Category>("/catalog/categories", {
        method: "POST",
        body: JSON.stringify({ name: newCatName.trim() }),
      });
      setCategories((prev) => [...prev, created]);
      setForm((prev) => ({ ...prev, category_id: created.id }));
      setNewCatName("");
      setNewCatOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add category");
    }
  }

  async function handleCreateBrand() {
    if (!newBrandName.trim()) return;
    try {
      const created = await api<Brand>("/catalog/brands", {
        method: "POST",
        body: JSON.stringify({ name: newBrandName.trim() }),
      });
      setBrands((prev) => [...prev, created]);
      setForm((prev) => ({ ...prev, brand_id: created.id }));
      setNewBrandName("");
      setNewBrandOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add brand");
    }
  }

  function handleAutoSKU() {
    setForm((prev) => ({
      ...prev,
      sku: generateSKU(prev.name),
    }));
  }

  async function addProduct() {
    setError("");
    setSuccess("");

    const validationError = validateProductForm(form);
    if (validationError) {
      setError(validationError);
      if (validationError.includes("Barcode")) focusBarcodeScanner();
      return;
    }

    setLoading(true);
    try {
      const created = await api<Product>("/catalog/products", {
        method: "POST",
        body: JSON.stringify(buildCreateBody(form)),
      });

      setSavedProducts((prev) => [
        ...prev,
        {
          product: created,
          form: { ...form },
        },
      ]);

      setSuccess(`"${created.name}" added. Click it above to edit in the drawer, or add another below.`);
      setForm({
        ...defaultProduct,
        category_id: form.category_id,
        brand_id: form.brand_id,
        unit: form.unit,
      });

      setTimeout(() => {
        formTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        focusBarcodeScanner();
      }, 150);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create product");
    } finally {
      setLoading(false);
    }
  }

  async function updateSavedProduct(id: string) {
    const entry = savedProducts.find((s) => s.product.id === id);
    if (!entry) return;

    setDrawerError("");
    setSuccess("");

    const validationError = validateProductForm(entry.form);
    if (validationError) {
      setDrawerError(validationError);
      return;
    }

    setSavingEdit(true);
    try {
      const updated = await api<Product>(`/catalog/products/${id}`, {
        method: "PATCH",
        body: JSON.stringify(buildUpdateBody(entry.form)),
      });

      setSavedProducts((prev) =>
        prev.map((s) =>
          s.product.id === id
            ? {
                product: { ...s.product, ...updated, name: entry.form.name.trim() },
                form: { ...entry.form },
              }
            : s
        )
      );
      setSuccess(`"${entry.form.name.trim()}" updated.`);
      closeEditDrawer();
    } catch (e) {
      setDrawerError(e instanceof Error ? e.message : "Failed to update product");
    } finally {
      setSavingEdit(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <Link
          href="/products"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 transition hover:text-teal-700"
        >
          <span>←</span> Back to products
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">New Product</h1>
            <p className="text-sm text-slate-500">
              Add products one by one — click a saved product to edit it in the side drawer
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Btn
              type="button"
              variant="secondary"
              onClick={() => setOpenCameraRequest((n) => n + 1)}
              className="border-teal-500 bg-teal-50 text-teal-800 font-medium hover:bg-teal-100"
            >
              Camera scan
            </Btn>
            <Btn
              type="button"
              variant="secondary"
              onClick={focusBarcodeScanner}
              className="border-teal-500 bg-teal-50 text-teal-800 font-medium hover:bg-teal-100"
            >
              Barcode focus
            </Btn>
            <Link href="/products/import">
              <Btn type="button" variant="secondary" title="Import multiple products at once via CSV">
                Bulk upload
              </Btn>
            </Link>
            <Btn
              type="button"
              variant="secondary"
              onClick={() => router.push("/products")}
            >
              {savedProducts.length > 0 ? "Done" : "Cancel"}
            </Btn>
            <Btn
              type="button"
              disabled={loading || !canManageProducts}
              onClick={() => void addProduct()}
            >
              {loading ? "Saving…" : "Add Product"}
            </Btn>
          </div>
        </div>
      </div>

      {error ? <Alert tone="error">{error}</Alert> : null}
      {success ? <Alert tone="success">{success}</Alert> : null}

      {!canManageProducts ? (
        <Alert tone="error">
          You do not have permission to create products. Only Admin, Manager, or Stock roles can add products.
        </Alert>
      ) : null}

      {savedProducts.length > 0 ? (
        <Card className="overflow-hidden p-0">
          <div className="border-b border-slate-100 bg-slate-50/80 px-5 py-3">
            <h2 className="text-sm font-semibold text-slate-900">
              Added products ({savedProducts.length})
            </h2>
            <p className="text-xs text-slate-500">
              Click a product to open the edit drawer from the right
            </p>
          </div>
          <ul className="divide-y divide-slate-100">
            {savedProducts.map((entry, index) => {
              const rowForm = entry.form;
              const isActive = editingId === entry.product.id;
              return (
                <li key={entry.product.id}>
                  <button
                    type="button"
                    onClick={() => openEditDrawer(entry.product.id)}
                    className={`flex w-full items-center gap-3 px-5 py-3 text-left transition hover:bg-slate-50 ${
                      isActive ? "bg-teal-50/60" : ""
                    }`}
                  >
                    <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-xs text-slate-500">
                      ›
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col sm:flex-row sm:items-center sm:gap-3">
                      <span className="truncate font-medium text-slate-900">
                        {index + 1}. {rowForm.name || entry.product.name}
                      </span>
                      <span className="truncate font-mono text-xs text-slate-500">
                        {rowForm.sku} · {rowForm.barcode}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm font-medium text-slate-700">
                      {formatMoney(rowForm.retail_price)}
                    </span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        isActive
                          ? "bg-teal-600 text-white"
                          : "bg-teal-50 text-teal-700"
                      }`}
                    >
                      {isActive ? "Editing" : "Edit"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>
      ) : null}

      <div ref={formTopRef} className="grid gap-6">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">
            {savedProducts.length > 0
              ? `Add another product (#${savedProducts.length + 1})`
              : "Product details"}
          </h2>
          {savedProducts.length > 0 ? (
            <span className="text-xs text-slate-500">
              Click a saved product above to edit in the drawer
            </span>
          ) : null}
        </div>

        <Card className="p-5">
          <BarcodeInputs
            barcode={form.barcode}
            onChange={(val) => setForm((prev) => ({ ...prev, barcode: val }))}
            scannerRef={scannerRef}
            openCameraRequest={openCameraRequest}
          />
        </Card>

        <Card className="p-5 space-y-4">
          <h2 className="text-base font-semibold text-slate-900 border-b border-slate-100 pb-2">
            Basic Information
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field label="Product Name *">
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Samsung 43'' Smart 4K TV"
                  className="text-base"
                />
              </Field>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  SKU *
                </span>
                <button
                  type="button"
                  onClick={handleAutoSKU}
                  className="text-[11px] font-medium text-teal-700 hover:underline"
                >
                  Generate SKU
                </button>
              </div>
              <Input
                value={form.sku}
                onChange={(e) => setForm({ ...form, sku: e.target.value })}
                placeholder="e.g. TV-SAM-43"
                className="font-mono"
              />
            </div>

            <Field label="Unit of Measurement">
              <Select
                value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value })}
              >
                {UNIT_OPTIONS}
              </Select>
            </Field>

            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Category
                </span>
                <button
                  type="button"
                  onClick={() => setNewCatOpen(true)}
                  className="text-[11px] font-medium text-teal-700 hover:underline"
                >
                  + Quick add
                </button>
              </div>
              <Select
                value={form.category_id}
                onChange={(e) => setForm({ ...form, category_id: e.target.value })}
              >
                <option value="">— Select Category —</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Brand
                </span>
                <button
                  type="button"
                  onClick={() => setNewBrandOpen(true)}
                  className="text-[11px] font-medium text-teal-700 hover:underline"
                >
                  + Quick add
                </button>
              </div>
              <Select
                value={form.brand_id}
                onChange={(e) => setForm({ ...form, brand_id: e.target.value })}
              >
                <option value="">— Select Brand —</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        </Card>

        <Card className="p-5 space-y-4">
          <h2 className="text-base font-semibold text-slate-900 border-b border-slate-100 pb-2">
            Pricing & Inventory
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Retail Price (BDT) *">
              <Input
                type="number"
                min="0"
                step="any"
                value={form.retail_price}
                onChange={(e) => setForm({ ...form, retail_price: e.target.value })}
                placeholder="0.00"
                className="font-mono text-base"
              />
            </Field>

            <Field label="Wholesale Price (BDT)">
              <Input
                type="number"
                min="0"
                step="any"
                value={form.wholesale_price}
                onChange={(e) => setForm({ ...form, wholesale_price: e.target.value })}
                placeholder="0.00"
                className="font-mono"
              />
            </Field>

            {canSeeCost ? (
              <Field label="Cost Price (BDT)">
                <Input
                  type="number"
                  min="0"
                  step="any"
                  value={form.cost}
                  onChange={(e) => setForm({ ...form, cost: e.target.value })}
                  placeholder="0.00"
                  className="font-mono"
                />
              </Field>
            ) : null}

            <Field label="Initial Stock Quantity">
              <Input
                type="number"
                min="0"
                value={form.initial_qty}
                onChange={(e) => setForm({ ...form, initial_qty: e.target.value })}
                placeholder="0"
                className="font-mono"
              />
            </Field>

            <Field label="Reorder Level (Low Stock Alert)">
              <Input
                type="number"
                min="0"
                value={form.reorder_level}
                onChange={(e) => setForm({ ...form, reorder_level: e.target.value })}
                placeholder="5"
                className="font-mono"
              />
            </Field>

            <Field label="Warranty (Months)">
              <Input
                type="number"
                min="0"
                value={form.warranty_months}
                onChange={(e) => setForm({ ...form, warranty_months: e.target.value })}
                placeholder="0"
                className="font-mono"
              />
            </Field>
          </div>

          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50/50 p-3">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={form.serial_required}
                onChange={(e) => setForm({ ...form, serial_required: e.target.checked })}
                className="mt-1 h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
              />
              <div>
                <p className="text-sm font-medium text-slate-800">Track Serial Numbers</p>
                <p className="text-xs text-slate-500">
                  Enable this for electronics, laptops, TVs, or items that require tracking individual serial numbers per unit for warranty.
                </p>
              </div>
            </label>
          </div>
        </Card>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <Btn
            type="button"
            variant="ghost"
            onClick={() => router.push("/products")}
          >
            {savedProducts.length > 0 ? "Done" : "Cancel"}
          </Btn>
          <Btn
            type="button"
            disabled={loading || !canManageProducts}
            onClick={() => void addProduct()}
            title="Save this product, minimise it, and open a blank form for the next one"
          >
            {loading ? "Saving…" : "Add Product"}
          </Btn>
        </div>
      </div>

      <Modal open={newCatOpen} onClose={() => setNewCatOpen(false)} title="Quick Add Category">
        <div className="space-y-4">
          <Field label="Category Name">
            <Input
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              placeholder="e.g. Power Tools"
              autoFocus
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Btn variant="secondary" onClick={() => setNewCatOpen(false)}>
              Cancel
            </Btn>
            <Btn onClick={() => void handleCreateCategory()}>Add Category</Btn>
          </div>
        </div>
      </Modal>

      <Modal open={newBrandOpen} onClose={() => setNewBrandOpen(false)} title="Quick Add Brand">
        <div className="space-y-4">
          <Field label="Brand Name">
            <Input
              value={newBrandName}
              onChange={(e) => setNewBrandName(e.target.value)}
              placeholder="e.g. Bosch"
              autoFocus
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Btn variant="secondary" onClick={() => setNewBrandOpen(false)}>
              Cancel
            </Btn>
            <Btn onClick={() => void handleCreateBrand()}>Add Brand</Btn>
          </div>
        </div>
      </Modal>

      <Drawer
        open={!!editingEntry}
        onClose={closeEditDrawer}
        title={editingEntry ? `Edit: ${editingEntry.form.name || "Product"}` : "Edit product"}
        wide
        footer={
          editingEntry ? (
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Btn type="button" variant="secondary" onClick={closeEditDrawer}>
                Cancel
              </Btn>
              <Btn
                type="button"
                disabled={savingEdit || !canManageProducts}
                onClick={() => void updateSavedProduct(editingEntry.product.id)}
              >
                {savingEdit ? "Updating…" : "Update Product"}
              </Btn>
            </div>
          ) : null
        }
      >
        {editingEntry ? (
          <div className="space-y-5">
            {drawerError ? <Alert tone="error">{drawerError}</Alert> : null}

            <Field label="Product Name *">
              <Input
                value={editingEntry.form.name}
                onChange={(e) =>
                  updateSavedForm(editingEntry.product.id, { name: e.target.value })
                }
                className="text-base"
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="SKU *">
                <Input
                  value={editingEntry.form.sku}
                  onChange={(e) =>
                    updateSavedForm(editingEntry.product.id, { sku: e.target.value })
                  }
                  className="font-mono"
                />
              </Field>

              <Field label="Barcode *">
                <Input
                  value={editingEntry.form.barcode}
                  onChange={(e) =>
                    updateSavedForm(editingEntry.product.id, { barcode: e.target.value })
                  }
                  className="font-mono"
                />
              </Field>

              <Field label="Unit of Measurement">
                <Select
                  value={editingEntry.form.unit}
                  onChange={(e) =>
                    updateSavedForm(editingEntry.product.id, { unit: e.target.value })
                  }
                >
                  {UNIT_OPTIONS}
                </Select>
              </Field>

              <Field label="Category">
                <Select
                  value={editingEntry.form.category_id}
                  onChange={(e) =>
                    updateSavedForm(editingEntry.product.id, {
                      category_id: e.target.value,
                    })
                  }
                >
                  <option value="">— Select Category —</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Brand">
                <Select
                  value={editingEntry.form.brand_id}
                  onChange={(e) =>
                    updateSavedForm(editingEntry.product.id, { brand_id: e.target.value })
                  }
                >
                  <option value="">— Select Brand —</option>
                  {brands.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Retail Price (BDT) *">
                <Input
                  type="number"
                  min="0"
                  step="any"
                  value={editingEntry.form.retail_price}
                  onChange={(e) =>
                    updateSavedForm(editingEntry.product.id, {
                      retail_price: e.target.value,
                    })
                  }
                  className="font-mono"
                />
              </Field>

              <Field label="Wholesale Price (BDT)">
                <Input
                  type="number"
                  min="0"
                  step="any"
                  value={editingEntry.form.wholesale_price}
                  onChange={(e) =>
                    updateSavedForm(editingEntry.product.id, {
                      wholesale_price: e.target.value,
                    })
                  }
                  className="font-mono"
                />
              </Field>

              {canSeeCost ? (
                <Field label="Cost Price (BDT)">
                  <Input
                    type="number"
                    min="0"
                    step="any"
                    value={editingEntry.form.cost}
                    onChange={(e) =>
                      updateSavedForm(editingEntry.product.id, { cost: e.target.value })
                    }
                    className="font-mono"
                  />
                </Field>
              ) : null}

              <Field label="Initial Stock (read-only)">
                <Input
                  type="number"
                  value={editingEntry.form.initial_qty}
                  disabled
                  className="bg-slate-100 font-mono"
                  title="Stock was set when the product was created. Adjust stock from the products page."
                />
              </Field>

              <Field label="Reorder Level">
                <Input
                  type="number"
                  min="0"
                  value={editingEntry.form.reorder_level}
                  onChange={(e) =>
                    updateSavedForm(editingEntry.product.id, {
                      reorder_level: e.target.value,
                    })
                  }
                  className="font-mono"
                />
              </Field>

              <Field label="Warranty (Months)">
                <Input
                  type="number"
                  min="0"
                  value={editingEntry.form.warranty_months}
                  onChange={(e) =>
                    updateSavedForm(editingEntry.product.id, {
                      warranty_months: e.target.value,
                    })
                  }
                  className="font-mono"
                />
              </Field>
            </div>

            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-slate-50/50 p-3">
              <input
                type="checkbox"
                checked={editingEntry.form.serial_required}
                onChange={(e) =>
                  updateSavedForm(editingEntry.product.id, {
                    serial_required: e.target.checked,
                  })
                }
                className="mt-1 h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
              />
              <div>
                <p className="text-sm font-medium text-slate-800">Track Serial Numbers</p>
                <p className="text-xs text-slate-500">
                  Enable for items that need individual serial tracking.
                </p>
              </div>
            </label>
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}
