// Supabase auth middleware for server functions.
import { createMiddleware } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from './types'



export const requireSupabaseAuth = createMiddleware({ type: 'function' }).server(
  async ({ next }) => {
    
    const request = getRequest();
    const requestOrigin = request?.url ? new URL(request.url).origin : "";
    const SUPABASE_URL =
      requestOrigin ||
      process.env.SUPABASE_URL ||
      process.env.VITE_SUPABASE_URL ||
      "https://assetflow360.com";
    const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNjAwMDAwMDAwLCJleHAiOjIwMDAwMDAwMDB9.V-Nq7_uazFUYvZFXyq_whGnFkWy4W_3o4k6m04sGc5Q";

    if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
      const missing = [
        ...(!SUPABASE_URL ? ['SUPABASE_URL'] : []),
        ...(!SUPABASE_PUBLISHABLE_KEY ? ['SUPABASE_PUBLISHABLE_KEY'] : []),
      ];
      const message = `Missing Supabase environment variable(s): ${missing.join(', ')}. Set them in your .env file.`;
      console.error(`[Supabase] ${message}`);
      throw new Response(message, { status: 500 });
    }
    
    if (!request?.headers) {
      throw new Response('Unauthorized: No request headers available', { status: 401 });
    }

    let authHeader = request.headers.get('authorization') || request.headers.get('x-supabase-auth');

    if (!authHeader) {
      const cookie = request.headers.get('cookie');
      if (cookie) {
        const match = cookie.match(/sb-[a-z0-9-]+-auth-token=([^;]+)/i);
        if (match) {
          try {
            const parsed = JSON.parse(decodeURIComponent(match[1]));
            if (parsed?.access_token) {
              authHeader = `Bearer ${parsed.access_token}`;
            }
          } catch {}
        }
      }
    }

    if (!authHeader) {
      throw new Response('Unauthorized: No authorization header provided', { status: 401 });
    }

    const token = authHeader.startsWith('Bearer ') ? authHeader.replace('Bearer ', '') : authHeader;
    if (!token) {
      throw new Response('Unauthorized: No token provided', { status: 401 });
    }

    const supabase = createClient<Database>(
      SUPABASE_URL!,
      SUPABASE_PUBLISHABLE_KEY!,
      {
        global: {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
        auth: {
          storage: undefined,
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    );

    // Verify the supplied token against GoTrue directly, explicitly passing the
    // Bearer header. The supabase-js getClaims fallback previously called /user
    // without forwarding Authorization on this self-hosted deployment.
    const authBase = process.env.SUPABASE_AUTH_INTERNAL_URL?.trim();
    const verifyUrl = authBase ? `${authBase.replace(/\/$/, "")}/user` : `${SUPABASE_URL.replace(/\/$/, "")}/auth/v1/user`;
    let verifiedUserId: string;
    try {
      const verified = await fetch(verifyUrl, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: SUPABASE_PUBLISHABLE_KEY,
        },
        signal: AbortSignal.timeout(10000),
      });
      if (!verified.ok) {
        throw new Response("Unauthorized: Invalid or expired session", { status: 401 });
      }
      const verifiedUser = await verified.json() as { id?: string };
      if (!verifiedUser.id) throw new Response("Unauthorized: No user ID found", { status: 401 });
      verifiedUserId = verifiedUser.id;
    } catch (error) {
      if (error instanceof Response) throw error;
      console.error("[Supabase] Authentication service unavailable", error);
      throw new Response("Authentication service unavailable", { status: 503 });
    }

    return next({
      context: {
        supabase,
        userId: verifiedUserId,
        claims: { sub: verifiedUserId },
      },
    })
  }
)
