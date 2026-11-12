"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, Btn, Card, Field, Input, PageHeader, TableWrap, Td, Th } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { downloadCSV, exportProductsToCSV, generateSampleCSV, parseCSV } from "@/lib/csv";
import { formatBDT } from "@/lib/format";
import type { BulkImportResult, Product } from "@/lib/types";

interface NormalizedRow {
  rowNum: number;
  name: string;
  sku: string;
  barcode: string;
  category: string;
  brand: string;
  retail_price: number | string;
  wholesale_price: number | string;
  cost: number | string;
  initial_qty: number | string;
  unit: string;
  reorder_level: number | string;
  warranty_months: number | string;
  serial_required: boolean;
  errors: string[];
  raw: Record<string, string>;
}

export default function BulkProductUploadPage() {
  const router = useRouter();
  const { user, canSeeCost } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // User input modes
  const [file, setFile] = useState<File | null>(null);
  const [rawText, setRawText] = useState("");
  const [inputMode, setInputMode] = useState<"file" | "paste">("file");
  const [isDragging, setIsDragging] = useState(false);

  // Options
  const [updateExisting, setUpdateExisting] = useState(false);
  const [autoCreateCategories, setAutoCreateCategories] = useState(true);
  const [autoCreateBrands, setAutoCreateBrands] = useState(true);
  const [autoGenerateSku, setAutoGenerateSku] = useState(true);
  const [autoGenerateBarcode, setAutoGenerateBarcode] = useState(true);

  // Preview filtering & search
  const [previewFilter, setPreviewFilter] = useState<"all" | "valid" | "errors">("all");
  const [previewSearch, setPreviewSearch] = useState("");

  // Execution state
  const [loading, setLoading] = useState(false);
  const [globalError, setGlobalError] = useState("");
  const [importResult, setImportResult] = useState<BulkImportResult | null>(null);

  const canManageProducts =
    user?.role === "admin" || user?.role === "manager" || user?.role === "stock";

  // Parse CSV whenever file or rawText changes
  const parsedData = useMemo(() => {
    const text = inputMode === "file" ? rawText : rawText;
    if (!text.trim()) return { headers: [], rows: [] };
    return parseCSV(text);
  }, [rawText, inputMode]);

  // Normalize and validate rows on client-side
  const normalizedRows: NormalizedRow[] = useMemo(() => {
    if (!parsedData.rows.length) return [];

    const seenSkus = new Set<string>();
    const seenBarcodes = new Set<string>();

    return parsedData.rows.map((row, idx) => {
      const rowNum = idx + 1;
      const errors: string[] = [];

      // Helper to find value by various column aliases
      const getVal = (...keys: string[]): string => {
        for (const k of keys) {
          const matchKey = Object.keys(row).find(
            (rk) => rk.trim().toLowerCase().replace(/[\s\-_]+/g, "") === k.toLowerCase().replace(/[\s\-_]+/g, "")
          );
          if (matchKey && row[matchKey] !== undefined && row[matchKey] !== null) {
            return String(row[matchKey]).trim();
          }
        }
        return "";
      };

      const name = getVal("name", "productname", "itemname", "title", "product");
      const sku = getVal("sku", "itemcode", "code", "productcode");
      const barcode = getVal("barcode", "upc", "ean", "barcodevalue");
      const category = getVal("category", "categoryname", "categoryid");
      const brand = getVal("brand", "brandname", "brandid");
      const unit = getVal("unit", "uom") || "pcs";
      const retailStr = getVal("retailprice", "price", "sellingprice", "mrp", "retail");
      const wholesaleStr = getVal("wholesaleprice", "wholesale", "dealerprice", "tradeprice");
      const costStr = getVal("cost", "costprice", "purchaseprice", "buyingprice");
      const qtyStr = getVal("initialqty", "stock", "quantity", "qty", "stockqty", "initialstock");
      const reorderStr = getVal("reorderlevel", "alertqty", "minstock", "reorderqty");
      const warrantyStr = getVal("warrantymonths", "warranty", "warrantyperiod");
      const serialStr = getVal("serialrequired", "trackserial", "serialtrack", "hasserial", "serial");

      if (!name) {
        errors.push("Product name is required");
      }

      if (sku) {
        const lowerSku = sku.toLowerCase();
        if (seenSkus.has(lowerSku)) {
          errors.push(`Duplicate SKU "${sku}" in this file`);
        } else {
          seenSkus.add(lowerSku);
        }
      } else if (!autoGenerateSku) {
        errors.push("SKU is missing (or enable auto-generate SKU)");
      }

      if (barcode) {
        const lowerBc = barcode.toLowerCase();
        if (seenBarcodes.has(lowerBc)) {
          errors.push(`Duplicate Barcode "${barcode}" in this file`);
        } else {
          seenBarcodes.add(lowerBc);
        }
      }

      const retailNum = retailStr ? Number(retailStr) : 0;
      if (retailStr && (isNaN(retailNum) || retailNum < 0)) {
        errors.push("Retail price must be a positive number");
      }

      const wholesaleNum = wholesaleStr ? Number(wholesaleStr) : 0;
      if (wholesaleStr && (isNaN(wholesaleNum) || wholesaleNum < 0)) {
        errors.push("Wholesale price must be a valid number");
      }

      const costNum = costStr ? Number(costStr) : 0;
      if (costStr && (isNaN(costNum) || costNum < 0)) {
        errors.push("Cost price must be a valid number");
      }

      const qtyNum = qtyStr ? Number(qtyStr) : 0;
      if (qtyStr && (isNaN(qtyNum) || qtyNum < 0)) {
        errors.push("Initial quantity must be a valid number");
      }

      const serialRequired = ["true", "1", "yes", "y"].includes(serialStr.toLowerCase());

      return {
        rowNum,
        name,
        sku,
        barcode,
        category,
        brand,
        retail_price: retailNum,
        wholesale_price: wholesaleNum,
        cost: costNum,
        initial_qty: qtyNum,
        unit,
        reorder_level: reorderStr ? Number(reorderStr) || 0 : 0,
        warranty_months: warrantyStr ? parseInt(warrantyStr, 10) || 0 : 0,
        serial_required: serialRequired,
        errors,
        raw: row,
      };
    });
  }, [parsedData.rows, autoGenerateSku]);

  // Statistics
  const validRows = useMemo(() => normalizedRows.filter((r) => r.errors.length === 0), [normalizedRows]);
  const errorRows = useMemo(() => normalizedRows.filter((r) => r.errors.length > 0), [normalizedRows]);

  // Filtered rows for the preview table
  const displayedRows = useMemo(() => {
    let list = normalizedRows;
    if (previewFilter === "valid") list = validRows;
    else if (previewFilter === "errors") list = errorRows;

    if (previewSearch.trim()) {
      const q = previewSearch.toLowerCase();
      list = list.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.sku.toLowerCase().includes(q) ||
          r.barcode.toLowerCase().includes(q) ||
          r.category.toLowerCase().includes(q) ||
          r.brand.toLowerCase().includes(q)
      );
    }
    return list;
  }, [normalizedRows, validRows, errorRows, previewFilter, previewSearch]);

  function handleFileSelected(selectedFile: File) {
    setGlobalError("");
    setImportResult(null);
    setFile(selectedFile);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      setRawText(text || "");
    };
    reader.onerror = () => {
      setGlobalError("Failed to read file.");
    };
    reader.readAsText(selectedFile);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelected(e.dataTransfer.files[0]);
    }
  }

  function clearFile() {
    setFile(null);
    setRawText("");
    setImportResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleDownloadTemplate() {
    const csv = generateSampleCSV();
    downloadCSV(csv, "products_template.csv");
  }

  async function handleExportCurrentProducts() {
    try {
      setLoading(true);
      const products = await api<Product[]>("/catalog/products?include_inactive=1");
      const csv = exportProductsToCSV(products);
      downloadCSV(csv, `products-catalog-${new Date().toISOString().slice(0, 10)}.csv`);
    } catch (e) {
      setGlobalError(e instanceof Error ? e.message : "Failed to export products");
    } finally {
      setLoading(false);
    }
  }

  function handleDownloadFailedRows() {
    if (!importResult || !importResult.errors.length) return;
    const headers = ["row", "name", "sku", "barcode", "error"];
    const rows = importResult.errors.map((err) => [
      String(err.row),
      `"${(err.name || "").replace(/"/g, '""')}"`,
      `"${(err.sku || "").replace(/"/g, '""')}"`,
      `"${(err.barcode || "").replace(/"/g, '""')}"`,
      `"${err.error.replace(/"/g, '""')}"`,
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");
    downloadCSV(csv, "failed_products_import.csv");
  }

  async function executeImport() {
    if (!normalizedRows.length) return;
    setGlobalError("");
    setLoading(true);

    try {
      // Send raw records so backend normalizer can handle all variations
      const payloadRows = normalizedRows.map((r) => r.raw);
      const res = await api<BulkImportResult>("/catalog/products/import", {
        method: "POST",
        body: JSON.stringify({
          rows: payloadRows,
          options: {
            updateExisting,
            autoCreateCategories,
            autoCreateBrands,
            autoGenerateSku,
            autoGenerateBarcode,
          },
        }),
      });

      setImportResult(res);
    } catch (e) {
      setGlobalError(e instanceof Error ? e.message : "Bulk import failed. Please check your data.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-12">
      {/* Header and Back Link */}
      <div>
        <Link
          href="/products"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 transition hover:text-teal-700"
        >
          <span>←</span> Back to products
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Bulk Product Upload</h1>
            <p className="text-sm text-slate-500">
              Import or update hundreds of products at once with CSV spreadsheet upload, automatic barcode/SKU generation, and instant validation.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Btn variant="secondary" onClick={handleDownloadTemplate} title="Download a pre-formatted CSV template">
              📥 Sample CSV template
            </Btn>
            <Btn
              variant="secondary"
              onClick={() => void handleExportCurrentProducts()}
              title="Export all existing inventory to CSV"
            >
              📤 Export catalog
            </Btn>
          </div>
        </div>
      </div>

      {globalError ? <Alert tone="error">{globalError}</Alert> : null}

      {!canManageProducts ? (
        <Alert tone="error">
          You do not have permission to import products. Only Admin, Manager, or Stock roles can perform bulk uploads.
        </Alert>
      ) : null}

      {/* Result Card when Import Finishes */}
      {importResult ? (
        <Card className="border-teal-200 bg-teal-50/50 p-6 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-teal-900">
                🎉 Bulk Import Completed!
              </h2>
              <p className="mt-1 text-sm text-teal-800">
                Successfully processed <strong>{importResult.successCount}</strong> of <strong>{importResult.total}</strong> products
                ({importResult.createdCount} created, {importResult.updatedCount} updated).
              </p>
            </div>
            <div className="flex gap-2">
              <Btn variant="secondary" onClick={() => router.push("/products")}>
                View in catalog
              </Btn>
              <Btn
                onClick={() => {
                  setImportResult(null);
                  clearFile();
                }}
              >
                Upload another file
              </Btn>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 pt-2">
            <div className="rounded-lg bg-white p-3 border border-teal-100 shadow-sm">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Rows</div>
              <div className="text-xl font-bold text-slate-800">{importResult.total}</div>
            </div>
            <div className="rounded-lg bg-white p-3 border border-emerald-100 shadow-sm">
              <div className="text-xs font-semibold text-emerald-600 uppercase tracking-wider">New Created</div>
              <div className="text-xl font-bold text-emerald-700">{importResult.createdCount}</div>
            </div>
            <div className="rounded-lg bg-white p-3 border border-blue-100 shadow-sm">
              <div className="text-xs font-semibold text-blue-600 uppercase tracking-wider">Updated</div>
              <div className="text-xl font-bold text-blue-700">{importResult.updatedCount}</div>
            </div>
            <div className="rounded-lg bg-white p-3 border border-red-100 shadow-sm">
              <div className="text-xs font-semibold text-red-600 uppercase tracking-wider">Errors / Skipped</div>
              <div className="text-xl font-bold text-red-700">{importResult.failedCount}</div>
            </div>
          </div>

          {/* Error breakdown if any failed */}
          {importResult.errors.length > 0 ? (
            <div className="mt-4 rounded-xl border border-red-200 bg-white p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-red-900 text-sm">
                  ⚠️ {importResult.errors.length} row(s) encountered issues:
                </span>
                <Btn
                  variant="secondary"
                  className="text-xs px-2.5 py-1 text-red-700 border-red-200 hover:bg-red-50"
                  onClick={handleDownloadFailedRows}
                >
                  Download failed rows (CSV)
                </Btn>
              </div>
              <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 text-xs">
                {importResult.errors.map((err, i) => (
                  <div key={i} className="py-2 flex items-start gap-2">
                    <span className="font-mono font-semibold text-red-600 w-16 shrink-0">Row {err.row}:</span>
                    <span className="font-medium text-slate-800 shrink-0">
                      {err.name || err.sku || "Product"}
                    </span>
                    <span className="text-slate-500">—</span>
                    <span className="text-red-700">{err.error}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </Card>
      ) : null}

      {/* Step 1: Upload / Input File */}
      <Card className="p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Step 1: Choose or Paste CSV File</h2>
            <p className="text-xs text-slate-500">
              Columns supported: Name, SKU, Barcode, Category, Brand, Retail Price, Wholesale Price, Cost, Stock, Unit, Reorder Level, Warranty, Serials.
            </p>
          </div>
          <div className="flex rounded-lg border border-slate-200 p-0.5 bg-slate-50 text-xs">
            <button
              type="button"
              className={`rounded-md px-3 py-1 font-medium transition ${
                inputMode === "file" ? "bg-white text-teal-800 shadow-sm" : "text-slate-600 hover:text-slate-900"
              }`}
              onClick={() => setInputMode("file")}
            >
              Upload File
            </button>
            <button
              type="button"
              className={`rounded-md px-3 py-1 font-medium transition ${
                inputMode === "paste" ? "bg-white text-teal-800 shadow-sm" : "text-slate-600 hover:text-slate-900"
              }`}
              onClick={() => setInputMode("paste")}
            >
              Paste CSV Text
            </button>
          </div>
        </div>

        {inputMode === "file" ? (
          <div>
            {!file ? (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center transition ${
                  isDragging
                    ? "border-teal-500 bg-teal-50/50"
                    : "border-slate-300 bg-slate-50 hover:border-teal-400 hover:bg-teal-50/20"
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv, .tsv, .txt, text/csv, text/tab-separated-values"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      handleFileSelected(e.target.files[0]);
                    }
                  }}
                />
                <div className="mb-3 text-3xl">📄</div>
                <p className="text-sm font-semibold text-slate-800">
                  Click to browse or drag and drop your CSV file here
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Supports comma-separated (.csv), tab-separated (.tsv), or exported spreadsheets up to 5,000 rows
                </p>
              </div>
            ) : (
              <div className="flex items-center justify-between rounded-xl border border-teal-200 bg-teal-50/40 p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-600 text-white font-bold">
                    CSV
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{file.name}</p>
                    <p className="text-xs text-slate-500">
                      {(file.size / 1024).toFixed(1)} KB • {normalizedRows.length} rows detected
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Btn variant="secondary" className="text-xs px-3 py-1.5" onClick={() => fileInputRef.current?.click()}>
                    Replace file
                  </Btn>
                  <Btn variant="ghost" className="text-xs text-red-600 hover:bg-red-50" onClick={clearFile}>
                    Remove
                  </Btn>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv, .tsv, .txt, text/csv, text/tab-separated-values"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        handleFileSelected(e.target.files[0]);
                      }
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <textarea
              className="w-full h-40 rounded-lg border border-slate-300 p-3 font-mono text-xs outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
              placeholder={`name,sku,barcode,category,brand,retail_price,cost,initial_qty\nHikvision 2MP Camera,CAM-01,2001002003001,CCTV,Hikvision,3200,2500,10`}
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
            />
            <div className="flex justify-between items-center text-xs text-slate-500">
              <span>{normalizedRows.length} rows detected</span>
              {rawText ? (
                <button
                  type="button"
                  className="text-red-600 hover:underline"
                  onClick={() => setRawText("")}
                >
                  Clear text
                </button>
              ) : null}
            </div>
          </div>
        )}

        {/* Import Settings Checklist */}
        <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-600">
            Import Options & Automation
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex items-start gap-2.5 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5 rounded text-teal-600 focus:ring-teal-500"
                checked={updateExisting}
                onChange={(e) => setUpdateExisting(e.target.checked)}
              />
              <span>
                <strong>Update existing products</strong>
                <span className="block text-slate-500">
                  If SKU or Barcode matches an existing product, update its prices/details and add stock.
                </span>
              </span>
            </label>

            <label className="flex items-start gap-2.5 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5 rounded text-teal-600 focus:ring-teal-500"
                checked={autoCreateCategories}
                onChange={(e) => setAutoCreateCategories(e.target.checked)}
              />
              <span>
                <strong>Auto-create missing Categories</strong>
                <span className="block text-slate-500">
                  Automatically create new categories in database if they don’t already exist.
                </span>
              </span>
            </label>

            <label className="flex items-start gap-2.5 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5 rounded text-teal-600 focus:ring-teal-500"
                checked={autoCreateBrands}
                onChange={(e) => setAutoCreateBrands(e.target.checked)}
              />
              <span>
                <strong>Auto-create missing Brands</strong>
                <span className="block text-slate-500">
                  Automatically create new brand names in database if they don’t already exist.
                </span>
              </span>
            </label>

            <label className="flex items-start gap-2.5 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5 rounded text-teal-600 focus:ring-teal-500"
                checked={autoGenerateSku}
                onChange={(e) => setAutoGenerateSku(e.target.checked)}
              />
              <span>
                <strong>Auto-generate SKU if blank</strong>
                <span className="block text-slate-500">
                  Generates unique product SKUs (e.g. <code>PRD-9482</code>) if omitted in CSV.
                </span>
              </span>
            </label>

            <label className="flex items-start gap-2.5 text-xs text-slate-700 cursor-pointer sm:col-span-2">
              <input
                type="checkbox"
                className="mt-0.5 rounded text-teal-600 focus:ring-teal-500"
                checked={autoGenerateBarcode}
                onChange={(e) => setAutoGenerateBarcode(e.target.checked)}
              />
              <span>
                <strong>Auto-generate EAN-13 Barcodes</strong>
                <span className="block text-slate-500">
                  Generates valid 13-digit retail barcodes for items without barcodes, ready for printing.
                </span>
              </span>
            </label>
          </div>
        </div>
      </Card>

      {/* Step 2: Interactive Table Preview & Client Validation */}
      {normalizedRows.length > 0 ? (
        <Card className="p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Step 2: Review & Validate Data</h2>
              <p className="text-xs text-slate-500">
                Check preview before importing. Issues are highlighted with details.
              </p>
            </div>

            {/* Filter buttons */}
            <div className="flex items-center gap-2">
              <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs">
                <button
                  type="button"
                  className={`rounded-md px-2.5 py-1 font-medium transition ${
                    previewFilter === "all" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
                  }`}
                  onClick={() => setPreviewFilter("all")}
                >
                  All ({normalizedRows.length})
                </button>
                <button
                  type="button"
                  className={`rounded-md px-2.5 py-1 font-medium transition ${
                    previewFilter === "valid" ? "bg-emerald-600 text-white shadow-sm" : "text-emerald-700 hover:bg-emerald-50"
                  }`}
                  onClick={() => setPreviewFilter("valid")}
                >
                  ✓ Ready ({validRows.length})
                </button>
                <button
                  type="button"
                  className={`rounded-md px-2.5 py-1 font-medium transition ${
                    previewFilter === "errors" ? "bg-red-600 text-white shadow-sm" : "text-red-700 hover:bg-red-50"
                  }`}
                  onClick={() => setPreviewFilter("errors")}
                >
                  ✕ Issues ({errorRows.length})
                </button>
              </div>

              <Input
                placeholder="Filter preview…"
                className="w-44 text-xs py-1"
                value={previewSearch}
                onChange={(e) => setPreviewSearch(e.target.value)}
              />
            </div>
          </div>

          {/* Validation Alert Summary */}
          {errorRows.length > 0 ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 flex items-center justify-between">
              <span>
                ⚠️ <strong>{errorRows.length}</strong> row(s) have validation issues and might fail unless corrected.
                You can still proceed to import all valid rows ({validRows.length}).
              </span>
              <button
                type="button"
                className="underline font-semibold hover:text-amber-950"
                onClick={() => setPreviewFilter("errors")}
              >
                Inspect issues
              </button>
            </div>
          ) : null}

          {/* Table Preview */}
          <TableWrap className="max-h-96">
            <thead>
              <tr>
                <Th>#</Th>
                <Th>Status</Th>
                <Th>Product Name</Th>
                <Th>SKU</Th>
                <Th>Barcode</Th>
                <Th>Category</Th>
                <Th>Brand</Th>
                <Th>Retail</Th>
                <Th>Wholesale</Th>
                {canSeeCost ? <Th>Cost</Th> : null}
                <Th>Stock</Th>
                <Th>Unit</Th>
                <Th>Issues</Th>
              </tr>
            </thead>
            <tbody>
              {displayedRows.slice(0, 100).map((row) => {
                const hasErrors = row.errors.length > 0;
                return (
                  <tr
                    key={row.rowNum}
                    className={hasErrors ? "bg-red-50/50 hover:bg-red-50" : "hover:bg-slate-50"}
                  >
                    <Td className="font-mono text-xs text-slate-500">{row.rowNum}</Td>
                    <Td>
                      {hasErrors ? (
                        <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
                          Issue
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                          Ready
                        </span>
                      )}
                    </Td>
                    <Td className="font-medium text-slate-900 max-w-xs truncate">{row.name || "—"}</Td>
                    <Td className="font-mono text-xs text-slate-600">
                      {row.sku || (autoGenerateSku ? <span className="text-slate-400 italic">Auto</span> : "—")}
                    </Td>
                    <Td className="font-mono text-xs text-slate-600">
                      {row.barcode || (autoGenerateBarcode ? <span className="text-slate-400 italic">Auto</span> : "—")}
                    </Td>
                    <Td className="text-xs text-slate-600">{row.category || "—"}</Td>
                    <Td className="text-xs text-slate-600">{row.brand || "—"}</Td>
                    <Td className="font-mono text-xs">{formatBDT(row.retail_price)}</Td>
                    <Td className="font-mono text-xs">{formatBDT(row.wholesale_price)}</Td>
                    {canSeeCost ? <Td className="font-mono text-xs">{formatBDT(row.cost)}</Td> : null}
                    <Td className="font-mono text-xs font-semibold">{row.initial_qty}</Td>
                    <Td className="text-xs text-slate-500">{row.unit}</Td>
                    <Td className="text-xs text-red-600 max-w-xs">
                      {row.errors.length > 0 ? row.errors.join("; ") : "—"}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>

          {displayedRows.length > 100 ? (
            <p className="text-center text-xs text-slate-500">
              Showing first 100 of {displayedRows.length} rows
            </p>
          ) : null}

          {/* Step 3: Execution Button Bar */}
          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 pt-4">
            <div className="text-sm text-slate-600">
              Ready to import <strong>{normalizedRows.length}</strong> product(s) ({validRows.length} valid)
            </div>
            <div className="flex gap-2">
              <Btn variant="secondary" onClick={clearFile} disabled={loading}>
                Reset
              </Btn>
              <Btn
                disabled={loading || normalizedRows.length === 0 || !canManageProducts}
                onClick={() => void executeImport()}
                className="px-6 py-2.5 font-semibold shadow"
              >
                {loading ? "Importing products…" : `🚀 Upload & Import ${normalizedRows.length} Products`}
              </Btn>
            </div>
          </div>
        </Card>
      ) : null}
    </div>
  );
}

