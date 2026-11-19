"use client";

import { useEffect, useRef, useState } from "react";
import { createElement } from "react";
import { api } from "@/lib/api";
import type { InvoiceTemplate, Sale, ShopSettings } from "@/lib/types";
import { Btn } from "@/components/ui";
import { buildPrintableDocument } from "@/lib/invoiceMerge";

export type InvoiceFormat = "pos" | "normal" | `template:${string}`;

async function buildInvoiceBlob(sale: Sale, shop?: ShopSettings | null, format: InvoiceFormat = "pos") {
  const [{ pdf }, { PosInvoiceDocument, NormalInvoiceDocument }] = await Promise.all([
    import("@react-pdf/renderer"),
    import("@/components/InvoiceDocument"),
  ]);
  const DocumentComponent = format === "normal" ? NormalInvoiceDocument : PosInvoiceDocument;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return pdf(createElement(DocumentComponent, { sale, shop }) as any).toBlob();
}

function isTemplateFormat(format: InvoiceFormat): format is `template:${string}` {
  return format.startsWith("template:");
}

function templateIdFromFormat(format: `template:${string}`): string {
  return format.slice("template:".length);
}

export function InvoicePreview({
  sale,
  shop,
  showActions = true,
  onClose,
  initialFormat = "pos",
}: {
  sale: Sale;
  shop?: ShopSettings | null;
  showActions?: boolean;
  onClose?: () => void;
  initialFormat?: InvoiceFormat;
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [templates, setTemplates] = useState<InvoiceTemplate[]>([]);
  const [format, setFormat] = useState<InvoiceFormat>(initialFormat);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [isPrinting, setIsPrinting] = useState(false);
  const [defaultsReady, setDefaultsReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void api<InvoiceTemplate[]>("/documents/templates")
      .then((rows) => {
        if (cancelled) return;
        setTemplates(rows);
        const preferredPaper = initialFormat === "normal" ? "a4" : "pos80";
        const preferred =
          rows.find((t) => t.is_default && t.paper === preferredPaper) ||
          rows.find((t) => t.is_default);
        if (preferred) {
          setFormat(`template:${preferred.id}`);
        }
        setDefaultsReady(true);
      })
      .catch(() => {
        if (!cancelled) setDefaultsReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [initialFormat]);

  useEffect(() => {
    if (!defaultsReady) return;
    let cancelled = false;
    let objectUrl = "";
    setUrl(null);
    setError("");

    async function build() {
      try {
        if (isTemplateFormat(format)) {
          const id = templateIdFromFormat(format);
          let tpl = templates.find((t) => t.id === id);
          if (!tpl) {
            tpl = await api<InvoiceTemplate>(`/documents/templates/${id}`);
          }
          const html = buildPrintableDocument(tpl.content_html, sale, shop, tpl.paper);
          const blob = new Blob([html], { type: "text/html;charset=utf-8" });
          if (cancelled) return;
          objectUrl = URL.createObjectURL(blob);
          setUrl(objectUrl);
          return;
        }

        const blob = await buildInvoiceBlob(sale, shop, format);
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      } catch (err: unknown) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not build invoice");
      }
    }

    void build();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [sale, shop, format, templates, defaultsReady]);

  const activeTemplate = isTemplateFormat(format)
    ? templates.find((t) => t.id === templateIdFromFormat(format))
    : null;
  const isCustom = Boolean(activeTemplate);
  const isPosLike =
    format === "pos" || activeTemplate?.paper === "pos80";

  function printInvoice() {
    if (!url) return;
    setIsPrinting(true);
    try {
      const frame = frameRef.current?.contentWindow;
      if (frame) {
        frame.focus();
        frame.print();
        setTimeout(() => setIsPrinting(false), 1000);
        return;
      }
    } catch {
      // Fallback for isolated iframe cross-origin restrictions in Chromium
    }

    try {
      const win = window.open(url, "_blank");
      if (win) {
        win.focus();
        setTimeout(() => {
          try {
            win.print();
          } catch {}
          setIsPrinting(false);
        }, 500);
        return;
      }
    } catch {}

    setIsPrinting(false);
  }

  function downloadInvoice() {
    if (!url) return;
    const link = document.createElement("a");
    link.href = url;
    if (isCustom) {
      link.download = `invoice-${sale.invoice_no || sale.id}.html`;
    } else {
      link.download = `invoice-${sale.invoice_no || sale.id}-${format}.pdf`;
    }
    link.click();
  }

  return (
    <div className="space-y-3">
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {showActions ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-slate-800">
              Invoice #{sale.invoice_no || sale.id.slice(0, 8)}
            </span>
            <div className="flex items-center gap-1.5">
              <label htmlFor="invoice-format-select" className="text-xs font-medium text-slate-500 whitespace-nowrap">
                Type:
              </label>
              <select
                id="invoice-format-select"
                value={format}
                onChange={(e) => setFormat(e.target.value as InvoiceFormat)}
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-800 shadow-sm outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
              >
                <option value="pos">Built-in POS PDF (80mm)</option>
                <option value="normal">Built-in A4 PDF</option>
                {templates.map((t) => (
                  <option key={t.id} value={`template:${t.id}`}>
                    {t.is_default ? "★ " : ""}
                    {t.name} ({t.paper === "a4" ? "A4" : "POS"})
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Btn
              onClick={printInvoice}
              disabled={!url || isPrinting}
              className="flex items-center gap-1.5 shadow-sm"
              title={isPosLike ? "Print on POS machine" : "Print on printer"}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4H7v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              <span>{isPrinting ? "Printing…" : isPosLike ? "Print to POS" : "Print to Printer"}</span>
            </Btn>
            <Btn variant="secondary" onClick={downloadInvoice} disabled={!url}>
              {isCustom ? "Download HTML" : "Download PDF"}
            </Btn>
            {onClose ? (
              <Btn variant="secondary" onClick={onClose}>
                Close
              </Btn>
            ) : null}
          </div>
        </div>
      ) : null}

      {!url && !error ? (
        <div className="flex h-64 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-slate-500">
          <div className="mb-2 h-6 w-6 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" />
          <p className="text-sm">
            Generating {isCustom ? activeTemplate?.name || "custom" : isPosLike ? "POS (80mm)" : "Normal (A4)"} invoice…
          </p>
        </div>
      ) : null}

      {url ? (
        <div
          className={`mx-auto w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-all ${
            isPosLike ? "max-w-sm" : "max-w-2xl"
          }`}
        >
          <iframe
            ref={frameRef}
            title={`Invoice ${sale.invoice_no || ""}`}
            src={isCustom ? url : `${url}#toolbar=0&navpanes=0`}
            className="h-[520px] w-full bg-white"
          />
        </div>
      ) : null}

      {showActions && url ? (
        <div className="flex flex-wrap justify-center gap-2 border-t border-slate-100 pt-3">
          <Btn onClick={printInvoice} disabled={isPrinting} className="flex items-center gap-1.5">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4H7v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            <span>{isPrinting ? "Printing…" : isPosLike ? "Print to POS" : "Print to Printer"}</span>
          </Btn>
          <Btn variant="secondary" onClick={downloadInvoice}>
            {isCustom ? "Download HTML" : "Download PDF"}
          </Btn>
          {onClose ? (
            <Btn variant="secondary" onClick={onClose}>
              Close
            </Btn>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
