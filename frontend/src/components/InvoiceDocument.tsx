"use client";

import { Document, Font, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { Sale, ShopSettings } from "@/lib/types";

Font.registerHyphenationCallback((word) => [word]);

const PAGE_WIDTH = 226.77;

const styles = StyleSheet.create({
  page: {
    width: PAGE_WIDTH,
    paddingTop: 16,
    paddingBottom: 18,
    paddingHorizontal: 14,
    fontFamily: "Helvetica",
    fontSize: 9,
    color: "#111",
  },
  shopName: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 8,
    textAlign: "center",
    color: "#333",
    marginBottom: 8,
  },
  title: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
    marginBottom: 8,
  },
  meta: {
    fontSize: 9,
    marginBottom: 1,
  },
  rule: {
    borderBottomWidth: 1,
    borderBottomColor: "#222",
    borderStyle: "dashed",
    marginVertical: 5,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  head: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
  },
  product: {
    flex: 1,
    paddingRight: 4,
  },
  rate: {
    width: 52,
    textAlign: "right",
  },
  qty: {
    width: 30,
    textAlign: "right",
  },
  amount: {
    width: 58,
    textAlign: "right",
  },
  itemName: {
    fontSize: 9,
    marginBottom: 1,
  },
  serial: {
    fontSize: 7,
    color: "#333",
    marginBottom: 1,
  },
  totalLabel: {
    flex: 1,
    fontFamily: "Helvetica-Bold",
  },
  totalValue: {
    width: 140,
    textAlign: "right",
    fontFamily: "Helvetica-Bold",
  },
  thanks: {
    marginTop: 8,
    textAlign: "center",
    fontSize: 9,
  },
  voided: {
    marginTop: 6,
    textAlign: "center",
    fontFamily: "Helvetica-Bold",
    fontSize: 11,
  },
});

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

function shopSubtitle(shop: ShopSettings | null | undefined): string {
  return [shop?.address, shop?.phone].filter(Boolean).join("  ·  ");
}

export function receiptPageHeight(sale: Sale): number {
  const items = sale.items || [];
  const nameLines = items.reduce((sum, item, index) => {
    const name = `${index + 1}.${item.product_name || "Item"}`;
    const wrapped = Math.max(1, Math.ceil(name.length / 32));
    return sum + wrapped + (item.serials?.length ? 1 : 0);
  }, 0);
  let extra = 0;
  if (Number(sale.discount_amount) > 0) extra += 14;
  if (Number(sale.tax_amount) > 0) extra += 14;
  if (Number(sale.due_amount) > 0) extra += 28;
  if (sale.customer_name) extra += 12;
  if (sale.status === "voided") extra += 16;
  return 240 + nameLines * 12 + items.length * 22 + extra;
}

export function InvoiceDocument({
  sale,
  shop,
}: {
  sale: Sale;
  shop?: ShopSettings | null;
}) {
  return <PosInvoiceDocument sale={sale} shop={shop} />;
}

export function PosInvoiceDocument({
  sale,
  shop,
}: {
  sale: Sale;
  shop?: ShopSettings | null;
}) {
  const mark = currencyMark(shop?.currency);
  const subtitle = shopSubtitle(shop);
  const time = formatReceiptTime(sale.created_at);
  const invoiceNo = sale.invoice_no || sale.id.slice(0, 8);
  const discount = Number(sale.discount_amount) || 0;
  const tax = Number(sale.tax_amount) || 0;
  const due = Number(sale.due_amount) || 0;
  const paid = Number(sale.paid_amount) || 0;

  return (
    <Document title={`Invoice ${invoiceNo}`}>
      <Page size={{ width: PAGE_WIDTH, height: receiptPageHeight(sale) }} style={styles.page}>
        <Text style={styles.shopName}>{shop?.name || "Shop Name"}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        <Text style={styles.title}>INVOICE</Text>
        <Text style={styles.meta}>Invoice Number: #{invoiceNo}</Text>
        <Text style={styles.meta}>Date: {formatReceiptDate(sale.sale_date)}</Text>
        {time ? <Text style={styles.meta}>Time: {time}</Text> : null}
        {sale.customer_name ? <Text style={styles.meta}>Customer: {sale.customer_name}</Text> : null}

        <View style={styles.rule} />
        <View style={styles.row}>
          <Text style={[styles.product, styles.head]}>Product</Text>
          <Text style={[styles.rate, styles.head]}>Rate</Text>
          <Text style={[styles.qty, styles.head]}>QTY</Text>
          <Text style={[styles.amount, styles.head]}>Amount</Text>
        </View>
        <View style={styles.rule} />

        {(sale.items || []).map((item, index) => {
          const serials = (item.serials || []).map((s) => s.serial_number).filter(Boolean);
          const line = item.line_total ?? Number(item.unit_price) * Number(item.quantity);
          return (
            <View key={item.id || index} wrap={false}>
              <Text style={styles.itemName}>
                {index + 1}.{item.product_name || "Item"}
              </Text>
              {serials.length ? <Text style={styles.serial}>{serials.join(", ")}</Text> : null}
              <View style={styles.row}>
                <Text style={styles.product}> </Text>
                <Text style={styles.rate}>{money(item.unit_price)}</Text>
                <Text style={styles.qty}>{qty(item.quantity)}</Text>
                <Text style={styles.amount}>{money(line)}</Text>
              </View>
              <View style={styles.rule} />
            </View>
          );
        })}

        {discount > 0 ? (
          <View style={styles.row}>
            <Text style={styles.product}>Discount</Text>
            <Text style={styles.totalValue}>{money(discount)}</Text>
          </View>
        ) : null}
        {tax > 0 ? (
          <View style={styles.row}>
            <Text style={styles.product}>Tax</Text>
            <Text style={styles.totalValue}>{money(tax)}</Text>
          </View>
        ) : null}
        <View style={styles.row}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>
            {mark}
            {money(sale.total)}
          </Text>
        </View>
        {due > 0 ? (
          <>
            <View style={styles.row}>
              <Text style={styles.product}>Paid</Text>
              <Text style={styles.totalValue}>{money(paid)}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.totalLabel}>Due</Text>
              <Text style={styles.totalValue}>
                {mark}
                {money(due)}
              </Text>
            </View>
          </>
        ) : null}
        <View style={styles.rule} />
        {sale.status === "voided" ? <Text style={styles.voided}>VOID</Text> : null}
        <Text style={styles.thanks}>Thank you for your purchase!</Text>
      </Page>
    </Document>
  );
}

const normalStyles = StyleSheet.create({
  page: {
    padding: 36,
    fontFamily: "Helvetica",
    fontSize: 9,
    color: "#1e293b",
    lineHeight: 1.4,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    borderBottomWidth: 1.5,
    borderBottomColor: "#0d9488",
    paddingBottom: 14,
    marginBottom: 16,
  },
  shopName: {
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
    color: "#0f172a",
    marginBottom: 3,
  },
  shopInfo: {
    fontSize: 8.5,
    color: "#64748b",
    maxWidth: 260,
    marginBottom: 1,
  },
  invoiceBadge: {
    alignItems: "flex-end",
  },
  invoiceTitle: {
    fontSize: 22,
    fontFamily: "Helvetica-Bold",
    color: "#0d9488",
    letterSpacing: 1,
    marginBottom: 3,
  },
  invoiceMetaText: {
    fontSize: 8.5,
    color: "#475569",
    textAlign: "right",
    marginBottom: 1,
  },
  metaGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
    backgroundColor: "#f8fafc",
    padding: 10,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  metaCol: {
    flex: 1,
  },
  metaLabel: {
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    color: "#64748b",
    textTransform: "uppercase",
    marginBottom: 2,
  },
  metaVal: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: "#0f172a",
  },
  metaSub: {
    fontSize: 8.5,
    color: "#475569",
  },
  table: {
    marginBottom: 16,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#f1f5f9",
    borderBottomWidth: 1,
    borderBottomColor: "#cbd5e1",
    paddingVertical: 6,
    paddingHorizontal: 8,
    fontFamily: "Helvetica-Bold",
    fontSize: 8.5,
    color: "#334155",
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
    paddingVertical: 6,
    paddingHorizontal: 8,
    fontSize: 8.5,
  },
  colSl: { width: 26 },
  colDesc: { flex: 1, paddingRight: 8 },
  colRate: { width: 70, textAlign: "right" },
  colQty: { width: 45, textAlign: "center" },
  colAmount: { width: 80, textAlign: "right" },
  itemTitle: {
    fontFamily: "Helvetica-Bold",
    color: "#0f172a",
  },
  itemSerial: {
    fontSize: 7.5,
    color: "#64748b",
    marginTop: 1,
  },
  summarySection: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 8,
  },
  summaryBox: {
    width: 220,
    backgroundColor: "#f8fafc",
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 10,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 3,
    fontSize: 8.5,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "#cbd5e1",
    paddingTop: 5,
    marginTop: 3,
    fontSize: 10.5,
    fontFamily: "Helvetica-Bold",
    color: "#0f172a",
  },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 36,
    right: 36,
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
    paddingTop: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  footerText: {
    fontSize: 7.5,
    color: "#94a3b8",
  },
});

export function NormalInvoiceDocument({
  sale,
  shop,
}: {
  sale: Sale;
  shop?: ShopSettings | null;
}) {
  const mark = currencyMark(shop?.currency);
  const time = formatReceiptTime(sale.created_at);
  const invoiceNo = sale.invoice_no || sale.id.slice(0, 8);
  const discount = Number(sale.discount_amount) || 0;
  const tax = Number(sale.tax_amount) || 0;
  const due = Number(sale.due_amount) || 0;
  const paid = Number(sale.paid_amount) || 0;
  const subtotal = (sale.items || []).reduce(
    (sum, item) => sum + (item.line_total ?? Number(item.unit_price) * Number(item.quantity)),
    0
  );

  return (
    <Document title={`Invoice ${invoiceNo}`}>
      <Page size="A4" style={normalStyles.page}>
        <View style={normalStyles.headerRow}>
          <View>
            <Text style={normalStyles.shopName}>{shop?.name || "Shop Name"}</Text>
            {shop?.address ? <Text style={normalStyles.shopInfo}>{shop.address}</Text> : null}
            {shop?.phone ? <Text style={normalStyles.shopInfo}>Phone: {shop.phone}</Text> : null}
          </View>
          <View style={normalStyles.invoiceBadge}>
            <Text style={normalStyles.invoiceTitle}>INVOICE</Text>
            <Text style={normalStyles.invoiceMetaText}>Invoice #: {invoiceNo}</Text>
            <Text style={normalStyles.invoiceMetaText}>Date: {formatReceiptDate(sale.sale_date)}</Text>
            {time ? <Text style={normalStyles.invoiceMetaText}>Time: {time}</Text> : null}
            <Text style={normalStyles.invoiceMetaText}>
              Type: {sale.sale_type === "wholesale" ? "Wholesale" : "Retail"}
            </Text>
          </View>
        </View>

        <View style={normalStyles.metaGrid}>
          <View style={normalStyles.metaCol}>
            <Text style={normalStyles.metaLabel}>Bill To / Customer:</Text>
            <Text style={normalStyles.metaVal}>{sale.customer_name || "Walk-in Customer"}</Text>
            {sale.customer_phone ? (
              <Text style={normalStyles.metaSub}>Phone: {sale.customer_phone}</Text>
            ) : null}
          </View>
          {sale.cashier_name ? (
            <View style={[normalStyles.metaCol, { alignItems: "flex-end" }]}>
              <Text style={normalStyles.metaLabel}>Cashier:</Text>
              <Text style={normalStyles.metaVal}>{sale.cashier_name}</Text>
            </View>
          ) : null}
        </View>

        <View style={normalStyles.table}>
          <View style={normalStyles.tableHeader}>
            <Text style={normalStyles.colSl}>#</Text>
            <Text style={normalStyles.colDesc}>Product</Text>
            <Text style={normalStyles.colRate}>Unit Price</Text>
            <Text style={normalStyles.colQty}>Qty</Text>
            <Text style={normalStyles.colAmount}>Total ({mark})</Text>
          </View>

          {(sale.items || []).map((item, index) => {
            const serials = (item.serials || []).map((s) => s.serial_number).filter(Boolean);
            const line = item.line_total ?? Number(item.unit_price) * Number(item.quantity);
            return (
              <View key={item.id || index} style={normalStyles.tableRow} wrap={false}>
                <Text style={normalStyles.colSl}>{index + 1}</Text>
                <View style={normalStyles.colDesc}>
                  <Text style={normalStyles.itemTitle}>{item.product_name || "Item"}</Text>
                  {serials.length ? (
                    <Text style={normalStyles.itemSerial}>S/N: {serials.join(", ")}</Text>
                  ) : null}
                </View>
                <Text style={normalStyles.colRate}>{money(item.unit_price)}</Text>
                <Text style={normalStyles.colQty}>{qty(item.quantity)}</Text>
                <Text style={normalStyles.colAmount}>{money(line)}</Text>
              </View>
            );
          })}
        </View>

        <View style={normalStyles.summarySection}>
          <View style={normalStyles.summaryBox}>
            <View style={normalStyles.summaryRow}>
              <Text style={{ color: "#64748b" }}>Subtotal:</Text>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>
                {mark}{money(subtotal)}
              </Text>
            </View>
            {discount > 0 ? (
              <View style={normalStyles.summaryRow}>
                <Text style={{ color: "#64748b" }}>Discount:</Text>
                <Text style={{ color: "#dc2626" }}>-{mark}{money(discount)}</Text>
              </View>
            ) : null}
            {tax > 0 ? (
              <View style={normalStyles.summaryRow}>
                <Text style={{ color: "#64748b" }}>Tax:</Text>
                <Text>{mark}{money(tax)}</Text>
              </View>
            ) : null}
            <View style={normalStyles.totalRow}>
              <Text>Total Payable:</Text>
              <Text>
                {mark}{money(sale.total)}
              </Text>
            </View>
            <View style={[normalStyles.summaryRow, { marginTop: 5 }]}>
              <Text style={{ color: "#64748b" }}>Paid:</Text>
              <Text style={{ color: "#16a34a", fontFamily: "Helvetica-Bold" }}>
                {mark}{money(paid)}
              </Text>
            </View>
            {due > 0 ? (
              <View style={normalStyles.summaryRow}>
                <Text style={{ color: "#dc2626", fontFamily: "Helvetica-Bold" }}>Due Balance:</Text>
                <Text style={{ color: "#dc2626", fontFamily: "Helvetica-Bold" }}>
                  {mark}{money(due)}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        {sale.status === "voided" ? (
          <Text
            style={{
              textAlign: "center",
              color: "#dc2626",
              fontFamily: "Helvetica-Bold",
              fontSize: 14,
              marginTop: 14,
            }}
          >
            *** VOIDED INVOICE ***
          </Text>
        ) : null}

        <View style={normalStyles.footer}>
          <Text style={normalStyles.footerText}>Thank you for your business!</Text>
          <Text style={normalStyles.footerText}>Computer generated invoice</Text>
        </View>
      </Page>
    </Document>
  );
}
