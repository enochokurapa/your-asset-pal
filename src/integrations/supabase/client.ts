// Supabase client for browser and SSR.
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

function createSupabaseClient() {
  // Use import.meta.env for client-side (Vite build-time replacement)
  // Fall back to process.env for SSR (server-side rendering)
  const SUPABASE_URL =
    (typeof window !== "undefined" ? window.location.origin : undefined) ||
    import.meta.env.VITE_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    "https://assetflow360.com";
  const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNjAwMDAwMDAwLCJleHAiOjIwMDAwMDAwMDB9.V-Nq7_uazFUYvZFXyq_whGnFkWy4W_3o4k6m04sGc5Q";

  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    const missing = [
      ...(!SUPABASE_URL ? ['SUPABASE_URL'] : []),
      ...(!SUPABASE_PUBLISHABLE_KEY ? ['SUPABASE_PUBLISHABLE_KEY'] : []),
    ];
    const message = `Missing Supabase environment variable(s): ${missing.join(', ')}. Set them in your .env file.`;
    console.error(`[Supabase] ${message}`);
    throw new Error(message);
  }

  return createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      storage: typeof window !== 'undefined' ? localStorage : undefined,
      persistSession: true,
      autoRefreshToken: true,
    },
    global: {
      // PostgREST receives a request-scoped support ID in this browser tab.
      // PostgreSQL verifies the active SaaS Admin and tenant on every request.
      // This does not replace the real user's JWT or affect other browser tabs.
      fetch: (input: RequestInfo | URL, init?: RequestInit) => {
        if (typeof window === "undefined") return fetch(input, init);
        const raw = window.sessionStorage.getItem("af-platform-tenant-session");
        if (!raw) return fetch(input, init);
        const inputUrl = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        const url = new URL(inputUrl, window.location.origin);
        if (url.origin !== window.location.origin || !url.pathname.startsWith("/rest/v1/"))
          return fetch(input, init);
        const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
        headers.set("x-assetflow-support-session", raw);
        return fetch(input, { ...init, headers });
      },
    }
  });
}

let _supabase: ReturnType<typeof createSupabaseClient> | undefined;

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";
export const supabase = new Proxy({} as ReturnType<typeof createSupabaseClient>, {
  get(_, prop, receiver) {
    if (!_supabase) _supabase = createSupabaseClient();
    return Reflect.get(_supabase, prop, receiver);
  },
});

