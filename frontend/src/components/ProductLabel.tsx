"use client";

import { QRCodeSVG } from "qrcode.react";

export function ProductLabelPrint({
  name,
  barcode,
  price,
  sku,
}: {
  name: string;
  barcode?: string;
  price: number;
  sku?: string;
}) {
  const code = barcode || sku || name;
  return (
    <div className="label-sheet print-only">
      <div className="inline-block border border-slate-400 p-3 text-center">
        <p className="text-xs font-semibold">{name}</p>
        {sku ? <p className="text-[10px] text-slate-600">SKU: {sku}</p> : null}
        <QRCodeSVG value={code} size={80} className="mx-auto my-2" />
        <p className="font-mono text-sm">{code}</p>
        <p className="text-sm font-semibold">৳{price}</p>
      </div>
    </div>
  );
}
