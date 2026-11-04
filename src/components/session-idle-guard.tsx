import { useEffect } from "react";
import { getMySessionPolicy } from "@/lib/session-policy.functions";
import { getServerAuthHeaders } from "@/lib/auth-headers";
import { supabase } from "@/integrations/supabase/client";

/**
 * Lock inactive browser sessions without interrupting a continuously active field shift.
 * This is a usability control; server-side session revocation and access checks remain essential.
 */
export function SessionIdleGuard({ userId }: { userId: string }) {
  useEffect(() => {
    let closed = false;
    let signingOut = false;
    let idleMs = 10 * 60_000; // Secure fallback until remote policy is loaded.
    const activityKey = "assetflow:last-activity:" + userId;
    let lastActivity = Date.now();
    let lastWrite = 0;

    // A fresh authentication establishes a new browser-session activity timestamp.
    try { localStorage.setItem(activityKey, String(lastActivity)); } catch {}
    const activity = () => {
      const now = Date.now();
      lastActivity = now;
      if (now - lastWrite > 5000) {
        lastWrite = now;
        try { localStorage.setItem(activityKey, String(now)); } catch {}
      }
    };
    const events = ["pointerdown", "keydown", "touchstart", "scroll"] as const;
    for (const event of events) window.addEventListener(event, activity, { passive: true });

    const check = async () => {
      if (closed || signingOut) return;
      let mostRecent = lastActivity;
      try {
        const shared = Number(localStorage.getItem(activityKey));
        if (Number.isFinite(shared) && shared <= Date.now()) mostRecent = Math.max(shared, mostRecent);
      } catch {}
      if (Date.now() - mostRecent < idleMs) return;
      signingOut = true;
      try {
        await supabase.auth.signOut({ scope: "local" });
      } finally {
        if (!closed) window.location.replace("/login?inactive=1");
      }
    };
    const interval = window.setInterval(() => { void check(); }, 15_000);
    const visibility = () => { if (!document.hidden) void check(); };
    document.addEventListener("visibilitychange", visibility);

    getServerAuthHeaders().then(headers=>getMySessionPolicy({headers}))
      .then(policy => {
        if (!closed && Number.isInteger(policy.inactivityMinutes) &&
            policy.inactivityMinutes >= 5 && policy.inactivityMinutes <= 240) {
          idleMs = policy.inactivityMinutes * 60_000;
          void check();
        }
      })
      .catch(err => console.error("[Session] Unable to load idle policy", err));

    return () => {
      closed = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", visibility);
      for (const event of events) window.removeEventListener(event, activity);
    };
  }, [userId]);
  return null;
}
