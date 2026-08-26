import { ChangeEvent, useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Camera, ImagePlus, RefreshCw, ScanLine } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onScan: (text: string) => void;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function isIOSDevice() {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isStandalonePwa() {
  if (typeof window === "undefined") return false;
  const iosStandalone = Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
  return iosStandalone || window.matchMedia?.("(display-mode: standalone)").matches === true;
}

function cameraErrorMessage(error: unknown) {
  const name = error && typeof error === "object" && "name" in error
    ? String((error as { name?: unknown }).name ?? "")
    : "";
  const message = error && typeof error === "object" && "message" in error
    ? String((error as { message?: unknown }).message ?? "")
    : String(error ?? "");

  if (/NotAllowedError|PermissionDeniedError/i.test(name + message)) {
    return "Camera access is blocked. Allow Camera for AssetFlow in your browser/iPhone settings, then tap Retry camera.";
  }
  if (/NotFoundError|DevicesNotFoundError|OverconstrainedError/i.test(name + message)) {
    return "No usable camera was found. Try Take photo instead.";
  }
  if (/NotReadableError|TrackStartError|AbortError/i.test(name + message)) {
    return "The camera is busy or could not start. Close other camera apps and tap Retry camera.";
  }
  return message || "Could not start the camera. Tap Retry camera or use Take photo.";
}

export function ScannerDialog({ open, onOpenChange, onScan }: Props) {
  const elId = "qr-scanner-region";
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const handledRef = useRef(false);
  const generationRef = useRef(0);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [iosPwa, setIosPwa] = useState(false);

  const stopScanner = async () => {
    const scanner = scannerRef.current;
    scannerRef.current = null;
    if (!scanner) return;

    try {
      if (scanner.isScanning) await scanner.stop();
    } catch {}

    try {
      await scanner.clear();
    } catch {}
  };

  const completeScan = async (decoded: string) => {
    const value = decoded.trim();
    if (!value || handledRef.current) return;
    handledRef.current = true;
    onScan(value);
    await stopScanner();
    onOpenChange(false);
  };

  const startCamera = async () => {
    const generation = ++generationRef.current;
    handledRef.current = false;
    setError(null);
    setStarting(true);

    try {
      await stopScanner();
      await wait(120);
      if (generation !== generationRef.current) return;

      let camera: string | MediaTrackConstraints = { facingMode: { ideal: "environment" } };

      // Asking for the camera list first gives iOS a chance to expose the actual
      // rear camera device id. If that fails, Html5Qrcode still gets a normal
      // environment-facing constraint as a fallback.
      try {
        const cameras = await Html5Qrcode.getCameras();
        if (cameras.length) {
          const rearCamera = [...cameras].reverse().find((device) =>
            /back|rear|environment|world|traseira|trasera|arrière/i.test(device.label),
          );
          camera = (rearCamera ?? cameras[cameras.length - 1]).id;
        }
      } catch {}

      if (generation !== generationRef.current) return;

      // Do not use a fixed square qrbox. A 240x240 crop makes long 1D asset
      // barcodes especially difficult to decode on phones. Full-frame scanning
      // works for both QR codes and common linear barcodes.
      const scanner = new Html5Qrcode(elId, { verbose: false });
      scannerRef.current = scanner;

      await scanner.start(
        camera,
        { fps: 15 },
        (decoded) => {
          void completeScan(decoded);
        },
        () => {},
      );

      if (generation !== generationRef.current) {
        await stopScanner();
        return;
      }

      // WebKit can be picky about inline camera video in installed PWAs.
      const video = document.querySelector(`#${elId} video`) as HTMLVideoElement | null;
      if (video) {
        video.setAttribute("playsinline", "true");
        video.setAttribute("webkit-playsinline", "true");
        video.setAttribute("autoplay", "true");
        video.setAttribute("muted", "true");
        video.playsInline = true;
        video.muted = true;
        video.autoplay = true;
        void video.play().catch(() => {});
      }

      // Prefer continuous autofocus when the browser exposes it. Unsupported
      // devices simply ignore this optimisation.
      try {
        const capabilities = scanner.getRunningTrackCapabilities() as MediaTrackCapabilities & {
          focusMode?: string[];
        };
        if (capabilities.focusMode?.includes("continuous")) {
          await scanner.applyVideoConstraints({
            advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet],
          });
        }
      } catch {}
    } catch (cameraError) {
      if (generation === generationRef.current) {
        setError(cameraErrorMessage(cameraError));
      }
    } finally {
      if (generation === generationRef.current) setStarting(false);
    }
  };

  const scanImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const generation = ++generationRef.current;
    handledRef.current = false;
    setError(null);
    setStarting(true);

    try {
      await stopScanner();
      await wait(50);
      if (generation !== generationRef.current) return;

      const scanner = new Html5Qrcode(elId, { verbose: false });
      scannerRef.current = scanner;
      const decoded = await scanner.scanFile(file, true);
      await completeScan(decoded);
    } catch {
      if (generation === generationRef.current) {
        setError("No QR code or barcode was detected in that photo. Move closer, keep the code sharp, and try again.");
        await stopScanner();
      }
    } finally {
      if (generation === generationRef.current) setStarting(false);
    }
  };

  useEffect(() => {
    if (!open) {
      generationRef.current += 1;
      void stopScanner();
      return;
    }

    setIosPwa(isIOSDevice() && isStandalonePwa());
    void startCamera();

    return () => {
      generationRef.current += 1;
      void stopScanner();
    };
    // Scanner lifecycle is intentionally tied only to dialog visibility.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanLine className="h-5 w-5" /> Scan asset tag
          </DialogTitle>
          <DialogDescription>
            Point the rear camera at a QR code or barcode. Hold steady until it is detected.
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-hidden rounded-md border bg-black/90">
          <div id={elId} className="min-h-56 w-full" />
        </div>

        {iosPwa && (
          <p className="text-xs text-muted-foreground">
            iPhone PWA: if the live preview is blank or will not focus, use Take photo. The code is read on your phone and is not uploaded.
          </p>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="outline" onClick={() => void startCamera()} disabled={starting}>
            {starting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
            Retry camera
          </Button>
          <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={starting}>
            <ImagePlus className="h-4 w-4" />
            Take photo
          </Button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(event) => void scanImage(event)}
        />
      </DialogContent>
    </Dialog>
  );
}
