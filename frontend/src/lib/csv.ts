import type { Product } from "./types";

export interface ParsedCSV {
  headers: string[];
  rows: Record<string, string>[];
}

export function parseCSV(text: string): ParsedCSV {
  // Strip BOM if present
  const cleaned = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  if (!cleaned.trim()) return { headers: [], rows: [] };

  // Detect delimiter from the first non-empty line
  const lines = cleaned.split(/\r\n|\n|\r/);
  const firstLine = lines.find((l) => l.trim().length > 0) || "";
  let delimiter = ",";
  const commaCount = (firstLine.match(/,/g) || []).length;
  const tabCount = (firstLine.match(/\t/g) || []).length;
  const semiCount = (firstLine.match(/;/g) || []).length;
  if (tabCount > commaCount && tabCount > semiCount) delimiter = "\t";
  else if (semiCount > commaCount && semiCount > tabCount) delimiter = ";";

  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = "";
  let inQuotes = false;
  let i = 0;

  while (i < cleaned.length) {
    const char = cleaned[i];
    const nextChar = cleaned[i + 1];

    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          currentField += '"';
          i += 2;
          continue;
        } else {
          inQuotes = false;
          i++;
          continue;
        }
      } else {
        currentField += char;
        i++;
        continue;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
        i++;
        continue;
      } else if (char === delimiter) {
        currentRow.push(currentField.trim());
        currentField = "";
        i++;
        continue;
      } else if (char === "\r") {
        if (nextChar === "\n") i++;
        currentRow.push(currentField.trim());
        if (currentRow.some((c) => c !== "")) rows.push(currentRow);
        currentRow = [];
        currentField = "";
        i++;
        continue;
      } else if (char === "\n") {
        currentRow.push(currentField.trim());
        if (currentRow.some((c) => c !== "")) rows.push(currentRow);
        currentRow = [];
        currentField = "";
        i++;
        continue;
      } else {
        currentField += char;
        i++;
        continue;
      }
    }
  }

  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some((c) => c !== "")) rows.push(currentRow);
  }

  if (rows.length === 0) return { headers: [], rows: [] };

  const rawHeaders = rows[0];
  const headers = rawHeaders.map((h) => h.trim());
  const dataRows: Record<string, string>[] = [];

  for (let r = 1; r < rows.length; r++) {
    const rowValues = rows[r];
    const record: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) {
      const header = headers[c];
      if (header) {
        record[header] = rowValues[c] ?? "";
      }
    }
    dataRows.push(record);
  }

  return { headers, rows: dataRows };
}

export function generateSampleCSV(): string {
  const sample = [
    [
      "name",
      "sku",
      "barcode",
      "category",
      "brand",
      "retail_price",
      "wholesale_price",
      "cost",
      "initial_qty",
      "unit",
      "reorder_level",
      "warranty_months",
      "serial_required",
    ],
    [
      "Hikvision 2MP IP Dome Camera",
      "CAM-HK-2MP",
      "2001002003001",
      "CCTV",
      "Hikvision",
      "3200",
      "2850",
      "2500",
      "20",
      "pcs",
      "5",
      "24",
      "true",
    ],
    [
      "Dell 24-inch IPS FHD Monitor",
      "MON-DELL-24",
      "2001002003002",
      "Monitor",
      "Dell",
      "16500",
      "15200",
      "14000",
      "10",
      "pcs",
      "3",
      "36",
      "true",
    ],
    [
      "Cat6 UTP Network Cable 305m",
      "CBL-CAT6-305",
      "2001002003003",
      "Cable",
      "D-Link",
      "7500",
      "6800",
      "6000",
      "15",
      "roll",
      "2",
      "0",
      "false",
    ],
    [
      "TP-Link Archer C6 AC1200 Router",
      "RTR-TPL-C6",
      "2001002003004",
      "Router",
      "TP-Link",
      "2950",
      "2650",
      "2400",
      "25",
      "pcs",
      "5",
      "12",
      "true",
    ],
    [
      "Logitech B100 Optical USB Mouse",
      "ACC-LOG-B100",
      "2001002003005",
      "Accessory",
      "Logitech",
      "380",
      "320",
      "280",
      "50",
      "pcs",
      "10",
      "12",
      "false",
    ],
    [
      "Samsung 32-inch Smart HD LED TV",
      "TV-SAM-32",
      "2001002003006",
      "TV",
      "Samsung",
      "24500",
      "22800",
      "21000",
      "8",
      "pcs",
      "2",
      "24",
      "true",
    ],
  ];

  return sample
    .map((row) =>
      row
        .map((val) => {
          const str = String(val);
          if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        })
        .join(",")
    )
    .join("\r\n");
}

export function exportProductsToCSV(products: Product[]): string {
  const headers = [
    "name",
    "sku",
    "barcode",
    "category",
    "brand",
    "retail_price",
    "wholesale_price",
    "cost",
    "stock_qty",
    "unit",
    "reorder_level",
    "warranty_months",
    "serial_required",
  ];

  const rows = products.map((p) => [
    p.name || "",
    p.sku || "",
    p.barcode || "",
    p.category_name || "",
    p.brand_name || "",
    String(p.retail_price ?? 0),
    String(p.wholesale_price ?? 0),
    String(p.cost ?? 0),
    String(p.stock_qty ?? 0),
    p.unit || "pcs",
    String(p.reorder_level ?? 0),
    String(p.warranty_months ?? 0),
    p.serial_required ? "true" : "false",
  ]);

  return [headers, ...rows]
    .map((row) =>
      row
        .map((val) => {
          const str = String(val);
          if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        })
        .join(",")
    )
    .join("\r\n");
}

export function downloadCSV(content: string, filename: string): void {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

