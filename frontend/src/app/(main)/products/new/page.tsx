"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BarcodeInputs, generateEAN13 } from "@/components/BarcodeInputs";
import { Alert, Btn, Card, Field, Input, Modal, PageHeader, Select } from "@/components/ui";
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

export default function NewProductPage() {
  const router = useRouter();
  const { user, canSeeCost } = useAuth();
  const scannerRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState(defaultProduct);
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);

  // Modals for inline creation
  const [newCatOpen, setNewCatOpen] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [newBrandOpen, setNewBrandOpen] = useState(false);
  const [newBrandName, setNewBrandName] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Check roles
  const canManageProducts =
    user?.role === "admin" || user?.role === "manager" || user?.role === "stock";

  useEffect(() => {
    void api<Category[]>("/catalog/categories").then(setCategories);
    void api<Brand[]>("/catalog/brands").then(setBrands);
  }, []);

  function focusBarcodeScanner() {
    scannerRef.current?.focus();
    scannerRef.current?.select();
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

  async function saveProduct(andAddAnother = false) {
    setError("");
    setSuccess("");

    if (!form.name.trim()) {
      setError("Product name is required");
      return;
    }
    if (!form.sku.trim()) {
      setError("SKU is required (use 'Generate SKU' if not provided)");
      return;
    }
    if (!form.barcode.trim()) {
      setError("Barcode is required (use manual input, scanner, or 'Generate random')");
      focusBarcodeScanner();
      return;
    }
    if (!form.retail_price || Number(form.retail_price) < 0) {
      setError("Valid retail price is required");
      return;
    }

    setLoading(true);
    try {
      const body = {
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

      const created = await api<Product>("/catalog/products", {
        method: "POST",
        body: JSON.stringify(body),
      });

      if (andAddAnother) {
        setSuccess(`Product "${created.name}" created! Ready for next product.`);
        setForm({
          ...defaultProduct,
          category_id: form.category_id, // keep category for convenience
          brand_id: form.brand_id, // keep brand for convenience
          unit: form.unit,
        });
        setTimeout(() => {
          focusBarcodeScanner();
        }, 150);
      } else {
        router.push("/products");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create product");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Back button & page header */}
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
              Add a new product to inventory with dual barcode options (manual & POS focus scanner)
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Btn
              type="button"
              variant="secondary"
              onClick={focusBarcodeScanner}
              className="border-teal-500 bg-teal-50 text-teal-800 font-medium hover:bg-teal-100"
            >
              🎯 Barcode focus
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
              Cancel
            </Btn>
            <Btn
              type="button"
              disabled={loading || !canManageProducts}
              onClick={() => void saveProduct(false)}
            >
              {loading ? "Saving…" : "Save product"}
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

      <div className="grid gap-6">
        {/* Section 1: Barcode Details with Dual Input Fields */}
        <Card className="p-5">
          <BarcodeInputs
            barcode={form.barcode}
            onChange={(val) => setForm((prev) => ({ ...prev, barcode: val }))}
            scannerRef={scannerRef}
          />
        </Card>

        {/* Section 2: Basic Product Information */}
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
                <option value="pcs">Pieces (pcs)</option>
                <option value="box">Box</option>
                <option value="meter">Meter</option>
                <option value="kg">Kilogram (kg)</option>
                <option value="set">Set</option>
                <option value="pkt">Packet (pkt)</option>
                <option value="roll">Roll</option>
                <option value="feet">Feet</option>
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

        {/* Section 3: Pricing & Inventory */}
        <Card className="p-5 space-y-4">
          <h2 className="text-base font-semibold text-slate-900 border-b border-slate-100 pb-2">
            Pricing & Inventory
          </h2>
          <div className="grid gap-4 sm:grid-cols-3">
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

        {/* Action bar at bottom */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <Btn
            type="button"
            variant="ghost"
            onClick={() => router.push("/products")}
          >
            Cancel
          </Btn>
          <div className="flex flex-wrap items-center gap-3">
            <Btn
              type="button"
              variant="secondary"
              disabled={loading || !canManageProducts}
              onClick={() => void saveProduct(true)}
              title="Save this product and stay on page to scan the next product"
            >
              Save & Add Another
            </Btn>
            <Btn
              type="button"
              disabled={loading || !canManageProducts}
              onClick={() => void saveProduct(false)}
            >
              {loading ? "Saving…" : "Save Product"}
            </Btn>
          </div>
        </div>
      </div>

      {/* Quick Add Category Modal */}
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

      {/* Quick Add Brand Modal */}
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
    </div>
  );
}
