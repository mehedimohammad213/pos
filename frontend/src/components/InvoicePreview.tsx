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
  return pdf(createElement(InvoiceDocument, { sale, shop })).toBlob();
}

export function InvoicePreview({
  sale,
  shop,
  showActions = true,
}: {
  sale: Sale;
  shop?: ShopSettings | null;
  showActions?: boolean;
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState("");

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
    const frame = frameRef.current?.contentWindow;
    if (!frame) return;
    frame.focus();
    frame.print();
  }

  function downloadInvoice() {
    if (!url) return;
    const link = document.createElement("a");
    link.href = url;
    link.download = `invoice-${sale.invoice_no || sale.id}.pdf`;
    link.click();
  }

  return (
    <div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {!url && !error ? <p className="text-sm text-slate-500">Preparing invoice…</p> : null}
      {url ? (
        <div className="mx-auto w-full max-w-sm overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <iframe
            ref={frameRef}
            title={`Invoice ${sale.invoice_no || ""}`}
            src={`${url}#toolbar=0&navpanes=0`}
            className="h-[680px] w-full bg-white"
          />
        </div>
      ) : null}
      {showActions && url ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Btn onClick={printInvoice}>Print</Btn>
          <Btn variant="secondary" onClick={downloadInvoice}>
            Download PDF
          </Btn>
        </div>
      ) : null}
    </div>
  );
}
