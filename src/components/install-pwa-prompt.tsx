import { useState, useEffect } from "react";
import { Download, Monitor, Smartphone, Share, PlusSquare, X, Check, Sparkles, Laptop } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

export function InstallPwaPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState<boolean>(false);
  const [isIOS, setIsIOS] = useState<boolean>(false);
  const [showIOSModal, setShowIOSModal] = useState<boolean>(false);
  const [isStandalone, setIsStandalone] = useState<boolean>(false);
  const [installed, setInstalled] = useState<boolean>(false);

  useEffect(() => {
    // 1. Register service worker if supported
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => console.log("[PWA] Service Worker registered:", reg.scope))
        .catch((err) => console.warn("[PWA] Service Worker registration failed:", err));
    }

    // 2. Check standalone mode (already installed / running as app)
    const checkStandalone = () => {
      const isStandaloneMode =
        window.matchMedia("(display-mode: standalone)").matches ||
        (navigator as any).standalone ||
        document.referrer.includes("android-app://");
      setIsStandalone(isStandaloneMode);
    };
    checkStandalone();

    // 3. Detect iOS device
    const userAgent = window.navigator.userAgent.toLowerCase();
    const iosDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(iosDevice);

    // 4. Handle beforeinstallprompt event for Chromium browsers (Desktop Chrome/Edge, Android Chrome, Opera, etc.)
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      const promptEvent = e as BeforeInstallPromptEvent;
      setDeferredPrompt(promptEvent);

      // Check if user dismissed previously in last 7 days
      const dismissedUntil = localStorage.getItem("af_pwa_dismissed_until");
      const isDismissed = dismissedUntil && Number(dismissedUntil) > Date.now();

      if (!isDismissed) {
        // Delay 2.5 seconds after page load for better UX
        const timer = setTimeout(() => setShowPrompt(true), 2500);
        return () => clearTimeout(timer);
      }
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    // 5. Handle app installed event
    const handleAppInstalled = () => {
      setInstalled(true);
      setShowPrompt(false);
      setDeferredPrompt(null);
      localStorage.removeItem("af_pwa_dismissed_until");
    };
    window.addEventListener("appinstalled", handleAppInstalled);

    // 6. Listen for manual trigger custom event (e.g. from top bar button)
    const handleManualTrigger = () => {
      setShowPrompt(true);
    };
    window.addEventListener("af:open-install-prompt", handleManualTrigger);

    // Show prompt on iOS if not standalone and not dismissed
    if (iosDevice && !isStandalone) {
      const dismissedUntil = localStorage.getItem("af_pwa_dismissed_until");
      const isDismissed = dismissedUntil && Number(dismissedUntil) > Date.now();
      if (!isDismissed) {
        const timer = setTimeout(() => setShowPrompt(true), 3000);
        return () => clearTimeout(timer);
      }
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
      window.removeEventListener("af:open-install-prompt", handleManualTrigger);
    };
  }, [isStandalone]);

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
      // Fallback instructions modal if browser doesn't expose prompt directly
      setShowIOSModal(true);
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
      {showPrompt && (
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
                <img src="/icon-192.png" alt="AssetFlow Logo" className="h-full w-full object-contain rounded-lg shadow-sm" />
                <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
                  <Sparkles className="h-2.5 w-2.5" />
                </span>
              </div>

              <div className="flex-1 pr-6">
                <div className="flex items-center gap-1.5">
                  <h3 className="font-semibold text-foreground text-sm">Install AssetFlow App</h3>
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                    PWA App
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                  Install AssetFlow on your desktop or mobile device for fast access, native window, and offline support.
                </p>

                <div className="mt-3 flex items-center gap-2">
                  <Button size="sm" className="h-8 gap-1.5 px-3 text-xs font-semibold shadow-md" onClick={handleInstallClick}>
                    <Download className="h-3.5 w-3.5" />
                    {isIOS ? "Install Guide (iOS)" : "Install Now"}
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
            {isIOS ? (
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
            ) : (
              <>
                <div className="flex items-start gap-3 rounded-xl bg-accent/50 p-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                    <Laptop className="h-3.5 w-3.5" />
                  </div>
                  <div className="text-xs">
                    <p className="font-semibold text-foreground">Desktop (Chrome / Edge)</p>
                    <p className="text-muted-foreground">
                      Click the <Download className="h-3 w-3 inline" /> Install icon in your browser address bar (top right corner) to install AssetFlow as a native app.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 rounded-xl bg-accent/50 p-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                    <Smartphone className="h-3.5 w-3.5" />
                  </div>
                  <div className="text-xs">
                    <p className="font-semibold text-foreground">Mobile (Android / Other)</p>
                    <p className="text-muted-foreground">
                      Tap your browser menu (3 dots) and select <strong>"Install App"</strong> or <strong>"Add to Home Screen"</strong>.
                    </p>
                  </div>
                </div>
              </>
            )}
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

export function triggerInstallPrompt() {
  window.dispatchEvent(new CustomEvent("af:open-install-prompt"));
}
