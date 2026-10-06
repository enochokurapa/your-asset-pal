import { useState, useEffect } from "react";
import { Download, Smartphone, Share, PlusSquare, X, Check, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

export function InstallPwaPrompt() {
  const { user } = useAuth();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState<boolean>(false);
  const [isIOS, setIsIOS] = useState<boolean>(false);
  const [showIOSModal, setShowIOSModal] = useState<boolean>(false);
  const [isStandalone, setIsStandalone] = useState<boolean>(false);
  const [installed, setInstalled] = useState<boolean>(false);

  useEffect(() => {
    if (!user) return;

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js", { updateViaCache: "none" })
        .then((reg) => reg.update().catch(() => undefined))
        .catch((err) => console.warn("[PWA] Service Worker registration failed:", err));
    }

    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      Boolean((navigator as any).standalone) ||
      document.referrer.includes("android-app://");
    setIsStandalone(standalone);
    if (standalone) return;

    const ua = navigator.userAgent.toLowerCase();
    const iosDevice = /iphone|ipad|ipod/.test(ua);
    const iosSafari =
      iosDevice &&
      /safari/.test(ua) &&
      !/crios|fxios|edgios|opios/.test(ua);
    setIsIOS(iosSafari);

    const dismissedUntil = Number(localStorage.getItem("af_pwa_dismissed_until") || 0);
    const canSuggest = dismissedUntil < Date.now();

    const showEligiblePrompt = () => {
      if (!canSuggest) return;
      window.setTimeout(() => setShowPrompt(true), 1200);
    };

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      showEligiblePrompt();
    };

    const handleAppInstalled = () => {
      setInstalled(true);
      setShowPrompt(false);
      setShowIOSModal(false);
      setDeferredPrompt(null);
      localStorage.removeItem("af_pwa_dismissed_until");
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    if (iosSafari) showEligiblePrompt();

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, [user]);
  const handleInstallClick = async () => {
    if (isIOS) {
      setShowIOSModal(true);
      setShowPrompt(false);
      return;
    }

    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;
      if (choiceResult.outcome === "accepted") {
        setInstalled(true);
        setShowPrompt(false);
      }
      setDeferredPrompt(null);
    } else {
      // If the browser did not expose a real install event, do not pretend
      // AssetFlow can install. Only iOS Safari uses the manual guide above.
      setShowPrompt(false);
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    // Dismiss for 7 days
    const next7Days = Date.now() + 7 * 24 * 60 * 60 * 1000;
    localStorage.setItem("af_pwa_dismissed_until", String(next7Days));
  };

  if (isStandalone || installed) return null;

  return (
    <>
      {/* Floating Install Prompt Banner / Bottom Sheet */}
      {showPrompt && (deferredPrompt || isIOS) && (
        <div className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-md animate-in fade-in slide-in-from-bottom-6 duration-300 md:bottom-6 md:left-auto md:right-6">
          <div className="relative overflow-hidden rounded-2xl border border-border/80 bg-background/95 p-4 shadow-2xl backdrop-blur-md dark:border-border/50">
            {/* Header accent gradient bar */}
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary via-blue-500 to-indigo-600" />
            
            <button
              onClick={handleDismiss}
              className="absolute right-3 top-3 rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="flex items-start gap-3.5 pt-1">
              <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 via-primary/10 to-blue-500/20 p-2.5 shadow-inner">
                <img src="/assetflow360-mark.svg" alt="AssetFlow 360" className="h-full w-full object-contain rounded-lg" />
                <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
                  <Sparkles className="h-2.5 w-2.5" />
                </span>
              </div>

              <div className="flex-1 pr-6">
                <div className="flex items-center gap-1.5">
                  <h3 className="font-semibold text-foreground text-sm">Install AssetFlow App</h3>
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                    Available
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                  Install AssetFlow on your desktop or mobile device for fast access and a dedicated app window.
                </p>

                <div className="mt-3 flex items-center gap-2">
                  <Button size="sm" className="h-8 gap-1.5 px-3 text-xs font-semibold shadow-md" onClick={handleInstallClick}>
                    <Download className="h-3.5 w-3.5" />
                    {isIOS ? "Add to Home Screen" : "Install AssetFlow"}
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 px-3 text-xs" onClick={handleDismiss}>
                    Not Now
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* iOS & Manual Installation Instructions Modal */}
      <Dialog open={showIOSModal} onOpenChange={setShowIOSModal}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <div className="flex items-center gap-2 text-primary">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                <Smartphone className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle>Install AssetFlow App</DialogTitle>
                <DialogDescription className="text-xs">
                  Follow these simple steps to install on your mobile or desktop device.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="mt-2 space-y-3.5">
              <>
                <div className="flex items-start gap-3 rounded-xl bg-accent/50 p-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                    1
                  </div>
                  <div className="text-xs">
                    <p className="font-semibold text-foreground flex items-center gap-1">
                      Tap the Share button <Share className="h-3.5 w-3.5 inline text-primary" />
                    </p>
                    <p className="text-muted-foreground">In Safari, tap the Share icon at the bottom or top of your screen.</p>
                  </div>
                </div>

                <div className="flex items-start gap-3 rounded-xl bg-accent/50 p-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                    2
                  </div>
                  <div className="text-xs">
                    <p className="font-semibold text-foreground flex items-center gap-1">
                      Select "Add to Home Screen" <PlusSquare className="h-3.5 w-3.5 inline text-primary" />
                    </p>
                    <p className="text-muted-foreground">Scroll down the action menu and tap "Add to Home Screen".</p>
                  </div>
                </div>

                <div className="flex items-start gap-3 rounded-xl bg-accent/50 p-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                    3
                  </div>
                  <div className="text-xs">
                    <p className="font-semibold text-foreground flex items-center gap-1">
                      Tap "Add" <Check className="h-3.5 w-3.5 inline text-primary" />
                    </p>
                    <p className="text-muted-foreground">Confirm by tapping Add in the top right corner.</p>
                  </div>
                </div>
              </>
          </div>

          <div className="mt-4 flex justify-end">
            <Button size="sm" onClick={() => setShowIOSModal(false)}>
              Got it
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
