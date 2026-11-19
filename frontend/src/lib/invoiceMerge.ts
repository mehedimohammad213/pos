import type { InvoicePaper, Sale, ShopSettings } from "@/lib/types";

export const MERGE_FIELDS = [
  { key: "shop.name", label: "Shop name" },
  { key: "shop.address", label: "Shop address" },
  { key: "shop.phone", label: "Shop phone" },
  { key: "shop.vat_tin", label: "VAT / TIN" },
  { key: "invoice_no", label: "Invoice number" },
  { key: "sale_date", label: "Sale date" },
  { key: "sale_time", label: "Sale time" },
  { key: "sale_type", label: "Sale type" },
  { key: "customer_name", label: "Customer name" },
  { key: "customer_phone", label: "Customer phone" },
  { key: "cashier_name", label: "Cashier" },
  { key: "items_table", label: "Items table" },
  { key: "subtotal", label: "Subtotal" },
  { key: "discount", label: "Discount" },
  { key: "tax", label: "Tax" },
  { key: "total", label: "Total" },
  { key: "paid", label: "Paid" },
  { key: "due", label: "Due" },
  { key: "currency", label: "Currency symbol" },
] as const;

function money(value: number | string | null | undefined): string {
  const n = Number(value ?? 0);
  if (Number.isNaN(n)) return "0.00";
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function qty(value: number | string | null | undefined): string {
  const n = Number(value ?? 0);
  if (Number.isNaN(n)) return "0";
  if (Number.isInteger(n)) return String(n);
  return n.toLocaleString("en-US", { maximumFractionDigits: 3 });
}

function currencyMark(code?: string): string {
  if (!code || code === "BDT") return "৳";
  if (code === "USD") return "$";
  return `${code} `;
}

function dateOnly(value?: string): Date | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatReceiptDate(value?: string): string {
  const date = dateOnly(value);
  if (!date) return "—";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatReceiptTime(value?: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  let hours = date.getHours();
  const suffix = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  const hh = String(hours).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss} ${suffix}`;
}

function buildItemsTable(sale: Sale, paper: InvoicePaper, mark: string): string {
  const items = sale.items || [];
  if (paper === "pos80") {
    const rows = items
      .map((item, index) => {
        const serials = (item.serials || []).map((s) => s.serial_number).filter(Boolean);
        const line = item.line_total ?? Number(item.unit_price) * Number(item.quantity);
        return `<div style="border-top:1px dashed #222;padding:4px 0;text-align:left;">
          <div>${index + 1}.${item.product_name || "Item"}</div>
          ${serials.length ? `<div style="font-size:10px;color:#333;">${serials.join(", ")}</div>` : ""}
          <div style="display:flex;justify-content:space-between;gap:6px;">
            <span></span>
            <span>${money(item.unit_price)}</span>
            <span>${qty(item.quantity)}</span>
            <span>${money(line)}</span>
          </div>
        </div>`;
      })
      .join("");
    return `<div style="border-top:1px dashed #222;border-bottom:1px dashed #222;margin:6px 0;">
      <div style="display:flex;justify-content:space-between;font-weight:700;padding:4px 0;text-align:left;">
        <span style="flex:1;">Product</span><span>Rate</span><span style="width:28px;text-align:right;">Qty</span><span style="width:52px;text-align:right;">Amt</span>
      </div>
      ${rows}
    </div>`;
  }

  const rows = items
    .map((item, index) => {
      const serials = (item.serials || []).map((s) => s.serial_number).filter(Boolean);
      const line = item.line_total ?? Number(item.unit_price) * Number(item.quantity);
      return `<tr>
        <td style="padding:6px 8px;border-bottom:1px solid #f1f5f9;">${index + 1}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #f1f5f9;">
          <div style="font-weight:700;">${item.product_name || "Item"}</div>
          ${serials.length ? `<div style="font-size:11px;color:#64748b;">S/N: ${serials.join(", ")}</div>` : ""}
        </td>
        <td style="padding:6px 8px;border-bottom:1px solid #f1f5f9;text-align:right;">${money(item.unit_price)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #f1f5f9;text-align:center;">${qty(item.quantity)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #f1f5f9;text-align:right;">${money(line)}</td>
      </tr>`;
    })
    .join("");

  return `<table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:8px;">
    <thead>
      <tr style="background:#f1f5f9;">
        <th style="padding:6px 8px;text-align:left;border-bottom:1px solid #cbd5e1;">#</th>
        <th style="padding:6px 8px;text-align:left;border-bottom:1px solid #cbd5e1;">Product</th>
        <th style="padding:6px 8px;text-align:right;border-bottom:1px solid #cbd5e1;">Unit Price</th>
        <th style="padding:6px 8px;text-align:center;border-bottom:1px solid #cbd5e1;">Qty</th>
        <th style="padding:6px 8px;text-align:right;border-bottom:1px solid #cbd5e1;">Total (${mark})</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
}

export function buildMergeMap(sale: Sale, shop?: ShopSettings | null, paper: InvoicePaper = "a4") {
  const mark = currencyMark(shop?.currency);
  const subtotal = (sale.items || []).reduce(
    (sum, item) => sum + (item.line_total ?? Number(item.unit_price) * Number(item.quantity)),
    0
  );
  return {
    "shop.name": shop?.name || "Shop Name",
    "shop.address": shop?.address || "",
    "shop.phone": shop?.phone || "",
    "shop.vat_tin": shop?.vat_tin || "",
    invoice_no: sale.invoice_no || sale.id.slice(0, 8),
    sale_date: formatReceiptDate(sale.sale_date),
    sale_time: formatReceiptTime(sale.created_at),
    sale_type: sale.sale_type === "wholesale" ? "Wholesale" : "Retail",
    customer_name: sale.customer_name || "Walk-in Customer",
    customer_phone: sale.customer_phone || "",
    cashier_name: sale.cashier_name || "",
    items_table: buildItemsTable(sale, paper, mark),
    subtotal: money(subtotal),
    discount: money(sale.discount_amount),
    tax: money(sale.tax_amount),
    total: money(sale.total),
    paid: money(sale.paid_amount),
    due: money(sale.due_amount),
    currency: mark,
  } as Record<string, string>;
}

export function mergeInvoiceHtml(
  templateHtml: string,
  sale: Sale,
  shop?: ShopSettings | null,
  paper: InvoicePaper = "a4"
): string {
  const map = buildMergeMap(sale, shop, paper);
  return templateHtml.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_full, key: string) => {
    return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : `{{${key}}}`;
  });
}

export function paperCss(paper: InvoicePaper): string {
  if (paper === "pos80") {
    return `
      @page { size: 80mm auto; margin: 4mm; }
      body { margin: 0; background: #fff; }
      .invoice-sheet { width: 72mm; margin: 0 auto; }
    `;
  }
  return `
    @page { size: A4; margin: 12mm; }
    body { margin: 0; background: #fff; }
    .invoice-sheet { width: 100%; max-width: 186mm; margin: 0 auto; }
  `;
}

export function buildPrintableDocument(
  templateHtml: string,
  sale: Sale,
  shop?: ShopSettings | null,
  paper: InvoicePaper = "a4"
): string {
  const merged = mergeInvoiceHtml(templateHtml, sale, shop, paper);
  const voidBanner =
    sale.status === "voided"
      ? `<div style="text-align:center;color:#dc2626;font-weight:700;margin:12px 0;">*** VOIDED INVOICE ***</div>`
      : "";
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Invoice ${sale.invoice_no || sale.id.slice(0, 8)}</title>
  <style>
    ${paperCss(paper)}
    * { box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; }
  </style>
</head>
<body>
  <div class="invoice-sheet">${merged}${voidBanner}</div>
</body>
</html>`;
}

export function sampleSale(): Sale {
  return {
    id: "sample-sale",
    invoice_no: "INV-2026-000001",
    sale_type: "retail",
    sale_date: new Date().toISOString().slice(0, 10),
    created_at: new Date().toISOString(),
    status: "completed",
    customer_name: "Sample Customer",
    customer_phone: "01700000000",
    cashier_name: "Cashier",
    discount_amount: 50,
    tax_amount: 0,
    total: 2450,
    paid_amount: 2450,
    due_amount: 0,
    items: [
      {
        product_id: "sample-1",
        product_name: "LED Monitor 24\"",
        quantity: 1,
        unit_price: 1500,
        line_total: 1500,
        serials: [{ serial_id: "1", serial_number: "SN-ABC-001" }],
      },
      {
        product_id: "sample-2",
        product_name: "HDMI Cable 2m",
        quantity: 2,
        unit_price: 500,
        line_total: 1000,
      },
    ],
  };
}

export const DEFAULT_A4_HTML = `<p><strong>{{shop.name}}</strong></p>
<p>{{shop.address}}</p>
<p>Phone: {{shop.phone}}</p>
<p></p>
<h2 style="text-align: center">INVOICE</h2>
<p>Invoice #: {{invoice_no}}</p>
<p>Date: {{sale_date}} · Time: {{sale_time}}</p>
<p>Customer: {{customer_name}} ({{customer_phone}})</p>
<p>Cashier: {{cashier_name}}</p>
<p></p>
<p>{{items_table}}</p>
<p></p>
<p style="text-align: right">Subtotal: {{currency}}{{subtotal}}</p>
<p style="text-align: right">Discount: {{currency}}{{discount}}</p>
<p style="text-align: right">Tax: {{currency}}{{tax}}</p>
<p style="text-align: right"><strong>Total: {{currency}}{{total}}</strong></p>
<p style="text-align: right">Paid: {{currency}}{{paid}}</p>
<p style="text-align: right">Due: {{currency}}{{due}}</p>
<p></p>
<p style="text-align: center">Thank you for your business!</p>`;

export const DEFAULT_POS_HTML = `<p style="text-align: center"><strong>{{shop.name}}</strong></p>
<p style="text-align: center">{{shop.address}}</p>
<p style="text-align: center">{{shop.phone}}</p>
<p style="text-align: center"><strong>INVOICE</strong></p>
<p>Invoice #: {{invoice_no}}</p>
<p>Date: {{sale_date}}</p>
<p>Time: {{sale_time}}</p>
<p>Customer: {{customer_name}}</p>
<p>{{items_table}}</p>
<p><strong>Total: {{currency}}{{total}}</strong></p>
<p>Paid: {{currency}}{{paid}}</p>
<p>Due: {{currency}}{{due}}</p>
<p style="text-align: center">Thank you for your purchase!</p>`;
