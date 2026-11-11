"use client";

import JsBarcode from "jsbarcode";
import { useEffect, useRef } from "react";

export type ProductLabelItem = {
  name: string;
  barcode?: string;
  price: number;
  sku?: string;
};

function BarcodeSvg({ value }: { value: string }) {
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!ref.current || !value) return;
    try {
      JsBarcode(ref.current, value, {
        format: "CODE128",
        displayValue: false,
        margin: 0,
        width: 1.6,
        height: 42,
        background: "#ffffff",
        lineColor: "#000000",
      });
    } catch {
      // Invalid characters for CODE128 — still show the text above.
      ref.current.innerHTML = "";
    }
  }, [value]);

  return <svg ref={ref} className="label-barcode mx-auto block" />;
}

function LabelCard({ barcode, sku, name }: ProductLabelItem) {
  const code = barcode || sku || name;
  return (
    <div className="label-card">
      <p className="label-code">{code}</p>
      <BarcodeSvg value={code} />
    </div>
  );
}

export function ProductLabelPrint({
  name,
  barcode,
  price,
  sku,
}: ProductLabelItem) {
  return (
    <div className="label-sheet print-only">
      <LabelCard name={name} barcode={barcode} price={price} sku={sku} />
    </div>
  );
}

export function ProductLabelsPrint({ items }: { items: ProductLabelItem[] }) {
  if (!items.length) return null;
  return (
    <div className="label-sheet print-only">
      {items.map((item, i) => (
        <LabelCard
          key={`${item.barcode || item.sku || item.name}-${i}`}
          name={item.name}
          barcode={item.barcode}
          price={item.price}
          sku={item.sku}
        />
      ))}
    </div>
  );
}
