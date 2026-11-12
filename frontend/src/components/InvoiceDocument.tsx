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
