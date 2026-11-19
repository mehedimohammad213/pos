"use client";

import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Btn } from "@/components/ui";

type Facing = "environment" | "user";

const BARCODE_FORMATS = [
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.CODE_93,
  Html5QrcodeSupportedFormats.ITF,
  Html5QrcodeSupportedFormats.CODABAR,
  Html5QrcodeSupportedFormats.QR_CODE,
  Html5QrcodeSupportedFormats.DATA_MATRIX,
];

function classifyFacing(label: string): Facing | null {
  const l = label.toLowerCase();
  if (
    l.includes("front") ||
    l.includes("user") ||
    l.includes("facetime") ||
    l.includes("facing: front") ||
    l.includes("facing_front")
  ) {
    return "user";
  }
  if (
    l.includes("back") ||
    l.includes("rear") ||
    l.includes("environment") ||
    l.includes("facing: back") ||
    l.includes("facing_back") ||
    l.includes("world")
  ) {
    return "environment";
  }
  return null;
}

export function BarcodeScanner({
  onScan,
  onClose,
}: {
  onScan: (code: string) => void;
  onClose: () => void;
}) {
  const reactId = useId().replace(/:/g, "");
  const elementId = `hw-pos-scanner-${reactId}`;
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const doneRef = useRef(false);
  const startingRef = useRef(false);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  const [facing, setFacing] = useState<Facing>("environment");
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [hasFront, setHasFront] = useState(true);
  const [hasBack, setHasBack] = useState(true);
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [lastHint, setLastHint] = useState("Align barcode inside the focus box");

  const stopScanner = useCallback(async () => {
    const scanner = scannerRef.current;
    if (!scanner) return;
    try {
      if (scanner.isScanning) {
        await scanner.stop();
      }
      scanner.clear();
    } catch {
      // ignore stop/clear races while switching cameras
    }
  }, []);

  const startWithFacing = useCallback(
    async (nextFacing: Facing) => {
      if (doneRef.current || startingRef.current) return;
      startingRef.current = true;
      setStatus("loading");
      setError(null);
      setTorchOn(false);
      setTorchSupported(false);
      setLastHint(
        nextFacing === "environment"
          ? "Back camera — hold barcode steady in the focus box"
          : "Front camera — hold barcode up to the lens in the focus box"
      );

      try {
        await stopScanner();

        if (!scannerRef.current) {
          scannerRef.current = new Html5Qrcode(elementId, {
            verbose: false,
            formatsToSupport: BARCODE_FORMATS,
            useBarCodeDetectorIfSupported: true,
          });
        }

        const scanner = scannerRef.current;
        const cameras = await Html5Qrcode.getCameras();
        if (!cameras.length) {
          throw new Error("No camera found. Allow camera permission and try again.");
        }

        let frontId: string | null = null;
        let backId: string | null = null;
        for (const cam of cameras) {
          const kind = classifyFacing(cam.label);
          if (kind === "user" && !frontId) frontId = cam.id;
          if (kind === "environment" && !backId) backId = cam.id;
        }

        // If labels are empty/unknown (common before permission), assume first=back, second=front
        if (!frontId && !backId) {
          if (cameras.length >= 2) {
            backId = cameras[0].id;
            frontId = cameras[1].id;
          } else {
            backId = cameras[0].id;
            frontId = cameras[0].id;
          }
        }

        setHasBack(Boolean(backId));
        setHasFront(Boolean(frontId));

        const preferredId = nextFacing === "environment" ? backId || frontId : frontId || backId;
        const cameraConfig: MediaTrackConstraints | string = preferredId
          ? preferredId
          : { facingMode: { ideal: nextFacing } };

        await scanner.start(
          cameraConfig,
          {
            fps: 12,
            qrbox: (viewfinderWidth, viewfinderHeight) => {
              const width = Math.min(Math.floor(viewfinderWidth * 0.86), 340);
              const height = Math.min(Math.floor(viewfinderHeight * 0.28), 140);
              return { width, height: Math.max(height, 90) };
            },
            aspectRatio: 1.777,
            disableFlip: false,
          },
          (text) => {
            if (doneRef.current) return;
            doneRef.current = true;
            setLastHint(`Scanned: ${text.trim()}`);
            void stopScanner().finally(() => {
              onScanRef.current(text.trim());
            });
          },
          () => {
            // continuous "not found" callbacks — ignore
          }
        );

        try {
          const caps = scanner.getRunningTrackCameraCapabilities();
          setTorchSupported(caps.torchFeature().isSupported());
        } catch {
          setTorchSupported(false);
        }

        setFacing(nextFacing);
        setStatus("ready");
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Unable to open camera. Check permissions.";
        setError(message);
        setStatus("error");
      } finally {
        startingRef.current = false;
      }
    },
    [elementId, stopScanner]
  );

  useEffect(() => {
    doneRef.current = false;
    void startWithFacing("environment");
    return () => {
      doneRef.current = true;
      void stopScanner();
      scannerRef.current = null;
    };
    // mount once per modal open
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function switchFacing(next: Facing) {
    if (next === facing && status === "ready") return;
    doneRef.current = false;
    await startWithFacing(next);
  }

  async function toggleTorch() {
    const scanner = scannerRef.current;
    if (!scanner || !scanner.isScanning) return;
    try {
      const caps = scanner.getRunningTrackCameraCapabilities();
      const torch = caps.torchFeature();
      if (!torch.isSupported()) return;
      const next = !torchOn;
      await torch.apply(next);
      setTorchOn(next);
    } catch {
      setTorchSupported(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-800">Barcode focus scan</p>
          <p className="text-xs text-slate-500">
            Center the product barcode in the focus box, then hold still
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Btn
            type="button"
            variant={facing === "environment" ? "primary" : "secondary"}
            className="text-xs px-2.5 py-1.5"
            disabled={!hasBack || status === "loading"}
            onClick={() => void switchFacing("environment")}
          >
            Back camera
          </Btn>
          <Btn
            type="button"
            variant={facing === "user" ? "primary" : "secondary"}
            className="text-xs px-2.5 py-1.5"
            disabled={!hasFront || status === "loading"}
            onClick={() => void switchFacing("user")}
          >
            Front camera
          </Btn>
          {torchSupported ? (
            <Btn
              type="button"
              variant={torchOn ? "primary" : "secondary"}
              className="text-xs px-2.5 py-1.5"
              onClick={() => void toggleTorch()}
            >
              {torchOn ? "Torch on" : "Torch"}
            </Btn>
          ) : null}
        </div>
      </div>

      <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-950">
        <div
          id={elementId}
          className="hw-barcode-scanner min-h-[280px] w-full overflow-hidden [&_img]:hidden [&_video]:h-auto [&_video]:w-full [&_video]:object-cover"
        />

        {/* Barcode focus frame — corners + scan line over library qrbox */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="relative h-[28%] min-h-[90px] w-[86%] max-w-[340px]">
            <div className="absolute -left-1 -top-1 h-6 w-6 rounded-tl-md border-l-[3px] border-t-[3px] border-teal-300" />
            <div className="absolute -right-1 -top-1 h-6 w-6 rounded-tr-md border-r-[3px] border-t-[3px] border-teal-300" />
            <div className="absolute -bottom-1 -left-1 h-6 w-6 rounded-bl-md border-b-[3px] border-l-[3px] border-teal-300" />
            <div className="absolute -bottom-1 -right-1 h-6 w-6 rounded-br-md border-b-[3px] border-r-[3px] border-teal-300" />
            <div className="absolute left-[6%] right-[6%] top-1/2 h-0.5 -translate-y-1/2 animate-pulse bg-teal-300/80" />
          </div>
        </div>

        {status === "loading" ? (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-950/70 text-sm text-white">
            Opening {facing === "environment" ? "back" : "front"} camera…
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={`text-xs ${error ? "text-red-600" : "text-slate-600"}`}>
          {error || lastHint}
        </p>
        <div className="flex gap-2">
          {status === "error" ? (
            <Btn
              type="button"
              variant="secondary"
              className="text-xs px-2.5 py-1.5"
              onClick={() => {
                doneRef.current = false;
                void startWithFacing(facing);
              }}
            >
              Retry camera
            </Btn>
          ) : null}
          <button type="button" onClick={onClose} className="text-sm text-slate-600 underline">
            Cancel scan
          </button>
        </div>
      </div>
    </div>
  );
}
