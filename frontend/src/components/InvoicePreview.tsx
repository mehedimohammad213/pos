"use client";

import { useEffect, useRef, useState } from "react";
import { createElement } from "react";
import type { Sale, ShopSettings } from "@/lib/types";
import { Btn } from "@/components/ui";

async function buildInvoiceBlob(sale: Sale, shop?: ShopSettings | null) {
  const [{ pdf }, { InvoiceDocument }] = await Promise.all([
    import("@react-pdf/renderer"),
    import("@/components/InvoiceDocument"),
  ]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return pdf(createElement(InvoiceDocument, { sale, shop }) as any).toBlob();
}

export function InvoicePreview({
  sale,
  shop,
  showActions = true,
  onClose,
}: {
  sale: Sale;
  shop?: ShopSettings | null;
  showActions?: boolean;
  onClose?: () => void;
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [isPrinting, setIsPrinting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let objectUrl = "";
    setUrl(null);
    setError("");
    void buildInvoiceBlob(sale, shop)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not build invoice");
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [sale, shop]);

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
    link.download = `invoice-${sale.invoice_no || sale.id}.pdf`;
    link.click();
  }

  return (
    <div className="space-y-3">
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {showActions ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div className="text-sm font-semibold text-slate-800">
            Invoice #{sale.invoice_no || sale.id.slice(0, 8)}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Btn
              onClick={printInvoice}
              disabled={!url || isPrinting}
              className="flex items-center gap-1.5 shadow-sm"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4H7v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              <span>{isPrinting ? "Printing…" : "Print invoice"}</span>
            </Btn>
            <Btn variant="secondary" onClick={downloadInvoice} disabled={!url}>
              Download PDF
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
          <p className="text-sm">Preparing invoice…</p>
        </div>
      ) : null}

      {url ? (
        <div className="mx-auto w-full max-w-sm overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <iframe
            ref={frameRef}
            title={`Invoice ${sale.invoice_no || ""}`}
            src={`${url}#toolbar=0&navpanes=0`}
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
            <span>{isPrinting ? "Printing…" : "Print invoice"}</span>
          </Btn>
          <Btn variant="secondary" onClick={downloadInvoice}>
            Download PDF
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
