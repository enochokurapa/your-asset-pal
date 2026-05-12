import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScanLine } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onScan: (text: string) => void;
}

export function ScannerDialog({ open, onOpenChange, onScan }: Props) {
  const elId = "qr-scanner-region";
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    let cancelled = false;

    const start = async () => {
      try {
        // give DOM a tick to mount the target div
        await new Promise((r) => setTimeout(r, 50));
        if (cancelled) return;
        const scanner = new Html5Qrcode(elId, { verbose: false });
        scannerRef.current = scanner;
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 240, height: 240 } },
          (decoded) => {
            onScan(decoded);
            stop();
            onOpenChange(false);
          },
          () => {},
        );
      } catch (e: any) {
        setError(e?.message ?? "Could not access camera. Grant permission and try again.");
      }
    };

    const stop = async () => {
      const s = scannerRef.current;
      if (!s) return;
      try {
        if (s.isScanning) await s.stop();
        await s.clear();
      } catch {}
      scannerRef.current = null;
    };

    start();
    return () => {
      cancelled = true;
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ScanLine className="h-5 w-5" /> Scan asset tag</DialogTitle>
          <DialogDescription>Point your camera at a QR code or barcode.</DialogDescription>
        </DialogHeader>
        <div className="overflow-hidden rounded-md border bg-muted">
          <div id={elId} className="w-full" />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </DialogContent>
    </Dialog>
  );
}
