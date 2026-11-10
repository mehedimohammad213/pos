"use client";

import { Html5QrcodeScanner } from "html5-qrcode";
import { useEffect, useRef } from "react";

export function BarcodeScanner({
  onScan,
  onClose,
}: {
  onScan: (code: string) => void;
  onClose: () => void;
}) {
  const done = useRef(false);

  useEffect(() => {
    const scanner = new Html5QrcodeScanner(
      "hw-pos-scanner",
      { fps: 10, qrbox: { width: 250, height: 150 }, rememberLastUsedCamera: true },
      false
    );
    scanner.render(
      (text) => {
        if (done.current) return;
        done.current = true;
        scanner.clear().catch(() => {});
        onScan(text.trim());
      },
      () => {}
    );
    return () => {
      scanner.clear().catch(() => {});
    };
  }, [onScan]);

  return (
    <div>
      <div id="hw-pos-scanner" className="overflow-hidden rounded-lg" />
      <button type="button" onClick={onClose} className="mt-3 text-sm text-slate-600 underline">
        Cancel scan
      </button>
    </div>
  );
}
