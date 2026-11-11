"use client";

import { useEffect, useRef, useState } from "react";
import { BarcodeScanner } from "@/components/BarcodeScanner";
import { Btn, Input, Modal } from "@/components/ui";
import { api } from "@/lib/api";
import type { Product } from "@/lib/types";

function playBeep() {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.value = 0.08;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
  } catch {
    // Audio context may be restricted by browser until user gesture
  }
}

export function generateEAN13(): string {
  const prefix = "200";
  let code = prefix;
  while (code.length < 12) {
    code += Math.floor(Math.random() * 10).toString();
  }
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = parseInt(code[i], 10);
    sum += i % 2 === 0 ? digit : digit * 3;
  }
  const check = (10 - (sum % 10)) % 10;
  return code + check;
}

export function BarcodeInputs({
  barcode,
  onChange,
  excludeProductId,
  scannerRef: externalScannerRef,
}: {
  barcode: string;
  onChange: (val: string) => void;
  excludeProductId?: string;
  scannerRef?: React.RefObject<HTMLInputElement | null>;
}) {
  const internalScannerRef = useRef<HTMLInputElement>(null);
  const scannerRef = externalScannerRef || internalScannerRef;
  const [scannerVal, setScannerVal] = useState(barcode);
  const [isScannerFocused, setIsScannerFocused] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [lastScanned, setLastScanned] = useState<string | null>(null);

  useEffect(() => {
    setScannerVal(barcode);
  }, [barcode]);

  // Check duplicate barcode in DB
  useEffect(() => {
    const trimmed = barcode.trim();
    if (!trimmed) {
      setDuplicateWarning(null);
      return;
    }
    const timer = setTimeout(async () => {
      setIsChecking(true);
      try {
        const p = await api<Product>(`/catalog/products/barcode/${encodeURIComponent(trimmed)}`);
        if (p && p.id !== excludeProductId) {
          setDuplicateWarning(`Already used by "${p.name}" (SKU: ${p.sku})`);
        } else {
          setDuplicateWarning(null);
        }
      } catch {
        setDuplicateWarning(null);
      } finally {
        setIsChecking(false);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [barcode, excludeProductId]);

  function focusScanner() {
    scannerRef.current?.focus();
    scannerRef.current?.select();
  }

  function handleManualChange(val: string) {
    onChange(val);
    setScannerVal(val);
  }

  function handleScannerChange(val: string) {
    setScannerVal(val);
    onChange(val);
  }

  function handleScannerKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      const code = scannerVal.trim();
      if (code) {
        onChange(code);
        setLastScanned(code);
        playBeep();
      }
    }
  }

  function handleCameraScan(code: string) {
    setScanOpen(false);
    onChange(code);
    setScannerVal(code);
    setLastScanned(code);
    playBeep();
  }

  function handleGenerate() {
    const code = generateEAN13();
    onChange(code);
    setScannerVal(code);
    setLastScanned(null);
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 pb-3">
        <div>
          <span className="text-sm font-semibold text-slate-800">Barcode Inputs</span>
          <p className="text-xs text-slate-500">
            Two input types available: Manual typing and POS-style Barcode Focus (USB Wedge & Camera)
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Btn
            type="button"
            variant="secondary"
            onClick={() => setScanOpen(true)}
            className="text-xs px-2.5 py-1.5"
          >
            Camera scan
          </Btn>
          <Btn
            type="button"
            variant="secondary"
            onClick={focusScanner}
            className="text-xs px-2.5 py-1.5 border-teal-500 bg-teal-50 text-teal-800 font-medium hover:bg-teal-100"
          >
            Barcode focus
          </Btn>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {/* Input 1: Manual Input */}
        <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-700">
              1. Manual Barcode
            </label>
            <button
              type="button"
              onClick={handleGenerate}
              className="text-[11px] font-medium text-teal-700 hover:underline"
            >
              Generate random
            </button>
          </div>
          <Input
            value={barcode}
            onChange={(e) => handleManualChange(e.target.value)}
            placeholder="Type barcode manually…"
            className="font-mono text-sm"
          />
          <p className="text-[11px] text-slate-400">
            For typing custom numbers or editing the barcode by hand
          </p>
        </div>

        {/* Input 2: Barcode Focus Type (like POS Page) */}
        <div
          className={`rounded-lg border p-3 space-y-1.5 transition-colors ${
            isScannerFocused
              ? "border-teal-500 bg-teal-50/40 ring-2 ring-teal-500/20"
              : "border-slate-200 bg-white"
          }`}
        >
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold uppercase tracking-wide text-teal-800 flex items-center gap-1.5">
              <span
                className={`inline-block h-2 w-2 rounded-full ${
                  isScannerFocused ? "bg-teal-600 animate-ping" : "bg-slate-400"
                }`}
              />
              2. Barcode Focus (POS Scanner)
            </label>
            <button
              type="button"
              onClick={focusScanner}
              className="text-[11px] font-medium text-teal-700 hover:underline"
            >
              Click to focus
            </button>
          </div>
          <div className="relative">
            <Input
              ref={scannerRef}
              value={scannerVal}
              onChange={(e) => handleScannerChange(e.target.value)}
              onKeyDown={handleScannerKeyDown}
              onFocus={() => setIsScannerFocused(true)}
              onBlur={() => setIsScannerFocused(false)}
              placeholder="Click 'Barcode focus' and scan with USB wedge…"
              className="font-mono text-sm pr-16"
            />
            <button
              type="button"
              onClick={focusScanner}
              className="absolute right-1 top-1 bottom-1 rounded bg-teal-600 px-2 text-xs font-medium text-white hover:bg-teal-700"
            >
              Focus
            </button>
          </div>
          <p className="text-[11px] text-slate-400">
            {isScannerFocused
              ? "🟢 Ready: Pull scanner trigger to enter code"
              : "Click 'Barcode focus' then scan with your USB barcode gun"}
          </p>
        </div>
      </div>

      {/* Barcode status display */}
      {barcode ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-slate-600">Active Barcode:</span>
            <span className="font-mono font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded">
              {barcode}
            </span>
            {lastScanned === barcode ? (
              <span className="rounded bg-teal-100 px-1.5 py-0.5 font-medium text-teal-800">
                ✓ Just scanned
              </span>
            ) : null}
            {isChecking ? (
              <span className="text-slate-400">Checking availability…</span>
            ) : duplicateWarning ? (
              <span className="font-medium text-red-600">⚠️ {duplicateWarning}</span>
            ) : (
              <span className="font-medium text-teal-700">✓ Unique & available</span>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              onChange("");
              setScannerVal("");
              setLastScanned(null);
            }}
            className="text-[11px] text-slate-400 hover:text-red-600 hover:underline"
          >
            Clear barcode
          </button>
        </div>
      ) : null}

      <Modal open={scanOpen} onClose={() => setScanOpen(false)} title="Camera scan" wide>
        <BarcodeScanner onScan={handleCameraScan} onClose={() => setScanOpen(false)} />
      </Modal>
    </div>
  );
}
