"use client";

import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { useEffect, useId, useRef, useState } from "react";
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

function safeQrBox(viewfinderWidth: number, viewfinderHeight: number) {
  // html5-qrcode requires each qrbox edge >= 50px and within the viewfinder
  const vw = Math.max(0, Math.floor(viewfinderWidth));
  const vh = Math.max(0, Math.floor(viewfinderHeight));
  if (vw < 50 || vh < 50) {
    return { width: 50, height: 50 };
  }
  const width = Math.max(50, Math.min(260, Math.floor(vw * 0.85)));
  const height = Math.max(50, Math.min(120, Math.floor(vh * 0.45)));
  return {
    width: Math.min(width, vw),
    height: Math.min(height, vh),
  };
}

const SCAN_CONFIG = {
  fps: 10,
  qrbox: safeQrBox,
  disableFlip: false,
};

function errorMessage(err: unknown): string {
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return "Unable to open camera.";
}

function isCameraApiAvailable() {
  return (
    typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === "function"
  );
}

function httpsAppUrl() {
  if (typeof window === "undefined") return "";
  const url = new URL(window.location.href);
  url.protocol = "https:";
  // Dev HTTPS server still uses 9005 with --experimental-https
  return url.toString();
}

function friendlyCameraError(raw: string): string {
  const msg = raw.toLowerCase();
  if (
    msg.includes("streaming not supported") ||
    msg.includes("secure context") ||
    msg.includes("https") ||
    msg.includes("mediadevices")
  ) {
    return "Camera needs a secure page (HTTPS or localhost). Open this app with https:// then allow camera.";
  }
  if (
    msg.includes("notallowed") ||
    msg.includes("permission") ||
    msg.includes("denied") ||
    msg.includes("notallowederror")
  ) {
    return "Camera permission blocked. Allow camera access in the browser address bar, then tap Retry.";
  }
  if (msg.includes("notfound") || msg.includes("no camera") || msg.includes("requested device not found")) {
    return "No camera found on this device.";
  }
  if (msg.includes("notreadable") || msg.includes("trackstart") || msg.includes("in use")) {
    return "Camera is busy in another app/tab. Close it, then tap Retry.";
  }
  if (msg.includes("overconstrained")) {
    return "This camera mode is not supported. Try the other camera.";
  }
  return raw || "Unable to open camera.";
}

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
  const runIdRef = useRef(0);
  const doneRef = useRef(false);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  const [facing, setFacing] = useState<Facing>("environment");
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [needsHttps, setNeedsHttps] = useState(false);
  const [hasFront, setHasFront] = useState(true);
  const [hasBack, setHasBack] = useState(true);
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [lastHint, setLastHint] = useState("Align barcode inside the focus box");

  async function safeStop() {
    const scanner = scannerRef.current;
    scannerRef.current = null;
    if (!scanner) return;
    try {
      if (scanner.isScanning) {
        await scanner.stop();
      }
    } catch {
      // ignore
    }
    try {
      scanner.clear();
    } catch {
      // ignore
    }
  }

  async function tryStart(
    scanner: Html5Qrcode,
    camera: string | MediaTrackConstraints,
    onSuccess: (text: string) => void
  ) {
    await scanner.start(camera, SCAN_CONFIG, onSuccess, () => {});
  }

  async function startWithFacing(nextFacing: Facing) {
    const runId = ++runIdRef.current;
    doneRef.current = false;
    setStatus("loading");
    setError(null);
    setNeedsHttps(false);
    setTorchOn(false);
    setTorchSupported(false);
    setLastHint(
      nextFacing === "environment"
        ? "Back camera — hold barcode steady in the focus box"
        : "Front camera — hold barcode up to the lens in the focus box"
    );

    // Browsers block camera on plain HTTP LAN IPs (e.g. http://192.168.x.x)
    if (!window.isSecureContext || !isCameraApiAvailable()) {
      setNeedsHttps(true);
      setError(
        friendlyCameraError(
          "Camera streaming not supported by the browser on insecure HTTP. Use HTTPS or localhost."
        )
      );
      setStatus("error");
      return;
    }

    await safeStop();

    // Wait until the scanner host has a usable layout (qrbox needs >= 50px)
    let host: HTMLElement | null = null;
    for (let i = 0; i < 20; i++) {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      });
      if (runId !== runIdRef.current) return;
      host = document.getElementById(elementId);
      if (host && host.clientWidth >= 50 && host.clientHeight >= 50) break;
      host = null;
    }
    if (!host) {
      setError("Scanner view not ready. Tap Retry.");
      setStatus("error");
      return;
    }
    host.innerHTML = "";

    const scanner = new Html5Qrcode(elementId, {
      verbose: false,
      formatsToSupport: BARCODE_FORMATS,
      useBarCodeDetectorIfSupported: true,
    });
    scannerRef.current = scanner;

    const onSuccess = (text: string) => {
      if (doneRef.current || runId !== runIdRef.current) return;
      doneRef.current = true;
      const code = text.trim();
      setLastHint(`Scanned: ${code}`);
      void safeStop().finally(() => {
        onScanRef.current(code);
      });
    };

    const attempts: Array<string | MediaTrackConstraints> = [
      { facingMode: nextFacing },
      { facingMode: nextFacing === "environment" ? "user" : "environment" },
    ];

    try {
      // Permission + camera list (labels fill in after permission on some browsers)
      let cameras: { id: string; label: string }[] = [];
      try {
        cameras = await Html5Qrcode.getCameras();
      } catch {
        cameras = [];
      }
      if (runId !== runIdRef.current) return;

      let frontId: string | null = null;
      let backId: string | null = null;
      for (const cam of cameras) {
        const kind = classifyFacing(cam.label);
        if (kind === "user" && !frontId) frontId = cam.id;
        if (kind === "environment" && !backId) backId = cam.id;
      }
      if (!frontId && !backId && cameras.length) {
        backId = cameras[0]?.id ?? null;
        frontId = cameras[1]?.id ?? cameras[0]?.id ?? null;
      }

      setHasBack(Boolean(backId || cameras.length));
      setHasFront(Boolean(frontId || cameras.length > 1 || (!backId && cameras.length === 1)));

      const preferredId = nextFacing === "environment" ? backId || frontId : frontId || backId;
      if (preferredId) attempts.unshift(preferredId);

      for (const cam of cameras) {
        if (!attempts.includes(cam.id)) attempts.push(cam.id);
      }

      let lastErr: unknown = null;
      let started = false;

      for (const camera of attempts) {
        if (runId !== runIdRef.current) return;
        try {
          // Fresh stop between attempts if a previous partial start left state
          if (scanner.isScanning) {
            await scanner.stop();
          }
        } catch {
          // ignore
        }
        try {
          await tryStart(scanner, camera, onSuccess);
          started = true;
          // Prefer reporting the facing the user asked for; if we fell back, detect from track
          let resolvedFacing = nextFacing;
          try {
            const settings = scanner.getRunningTrackSettings();
            if (settings.facingMode === "user" || settings.facingMode === "environment") {
              resolvedFacing = settings.facingMode;
            } else if (typeof camera === "string") {
              if (camera === frontId) resolvedFacing = "user";
              if (camera === backId) resolvedFacing = "environment";
            } else if (typeof camera.facingMode === "string") {
              resolvedFacing = camera.facingMode as Facing;
            }
          } catch {
            // keep nextFacing
          }
          setFacing(resolvedFacing);
          break;
        } catch (err) {
          lastErr = err;
        }
      }

      if (runId !== runIdRef.current) return;

      if (!started) {
        throw lastErr ?? new Error("Unable to open camera.");
      }

      try {
        const caps = scanner.getRunningTrackCameraCapabilities();
        setTorchSupported(caps.torchFeature().isSupported());
      } catch {
        setTorchSupported(false);
      }

      setStatus("ready");
      setError(null);
    } catch (err) {
      if (runId !== runIdRef.current) return;
      setError(friendlyCameraError(errorMessage(err)));
      setStatus("error");
      await safeStop();
    }
  }

  useEffect(() => {
    void startWithFacing("environment");
    return () => {
      runIdRef.current += 1;
      doneRef.current = true;
      void safeStop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function switchFacing(next: Facing) {
    if (status === "loading") return;
    if (next === facing && status === "ready") return;
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
          className="hw-barcode-scanner min-h-[280px] min-w-[200px] w-full overflow-hidden [&_img]:hidden [&_video]:h-auto [&_video]:w-full [&_video]:object-cover"
        />

        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="relative h-[120px] w-[260px] max-w-[86%]">
            <div className="absolute -left-1 -top-1 h-6 w-6 rounded-tl-md border-l-[3px] border-t-[3px] border-teal-300" />
            <div className="absolute -right-1 -top-1 h-6 w-6 rounded-tr-md border-r-[3px] border-t-[3px] border-teal-300" />
            <div className="absolute -bottom-1 -left-1 h-6 w-6 rounded-bl-md border-b-[3px] border-l-[3px] border-teal-300" />
            <div className="absolute -bottom-1 -right-1 h-6 w-6 rounded-br-md border-b-[3px] border-r-[3px] border-teal-300" />
            <div className="absolute left-[6%] right-[6%] top-1/2 h-0.5 -translate-y-1/2 animate-pulse bg-teal-300/80" />
          </div>
        </div>

        {status === "loading" ? (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-950/70 text-sm text-white">
            Opening camera…
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={`text-xs ${error ? "text-red-600" : "text-slate-600"}`}>
          {error || lastHint}
        </p>
        <div className="flex gap-2">
          {needsHttps ? (
            <Btn
              type="button"
              variant="primary"
              className="text-xs px-2.5 py-1.5"
              onClick={() => {
                window.location.href = httpsAppUrl();
              }}
            >
              Open HTTPS version
            </Btn>
          ) : null}
          {status === "error" ? (
            <Btn
              type="button"
              variant="secondary"
              className="text-xs px-2.5 py-1.5"
              onClick={() => void startWithFacing(facing)}
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
