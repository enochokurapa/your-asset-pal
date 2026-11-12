import {shouldRequireEmailMfa} from "@/lib/platform-security-email-mfa.server";
import {getPostgresPool} from "@/lib/postgres.server";
// Supabase auth middleware for server functions.
import { createMiddleware } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from './types'
import { supabase } from './client'



export const requireSupabaseAuth = createMiddleware({ type: 'function' })
  .client(async ({ next }) => {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error || !session?.access_token) throw new Error("Your session has expired. Please sign in again.");
    const supportId=typeof window!=="undefined"?window.sessionStorage.getItem("af-platform-tenant-session"):null;
    return next({ headers: {
      Authorization: `Bearer ${session.access_token}`,
      ...(supportId?{"x-assetflow-support-session":supportId}:{}),
    } });
  })
  .server(async ({ next }) => {
    
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
      const verifiedUser = await verified.json() as { id?: string; factors?: Array<{ factor_type?: string; status?: string }> };
      if (!verifiedUser.id) throw new Response("Unauthorized: No user ID found", { status: 401 });
      verifiedUserId = verifiedUser.id;
      // The independent, session-bound email challenge or authenticator AAL2
      // is enforced below for every administrative request.
    } catch (error) {
      if (error instanceof Response) throw error;
      console.error("[Supabase] Authentication service unavailable", error);
      throw new Response("Authentication service unavailable", { status: 503 });
    }

    try{
      if(await shouldRequireEmailMfa(token,request.headers.get("cookie")||""))throw new Response("Administrator MFA enrollment or verification required",{status:403});
    }catch(error){
      if(error instanceof Response)throw error;
      console.error("[Auth] Administrator MFA policy validation failed");
      throw new Response("Administrator MFA validation unavailable",{status:503});
    }

    // Validate the verified JWT directly against PostgREST.
    const restBase = (process.env.SUPABASE_REST_INTERNAL_URL?.trim() ||
      `${SUPABASE_URL.replace(/\/$/, "")}/rest/v1`).replace(/\/$/, "");
    let activeSession: unknown;
    try {
      const check = await fetch(`${restBase}/rpc/current_login_session_valid`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: SUPABASE_PUBLISHABLE_KEY,
          "Content-Type": "application/json",
        },
        body: "{}",
        signal: AbortSignal.timeout(10000),
      });
      if (!check.ok) {
        console.error("[Auth] Session validation HTTP status", check.status);
        throw new Response("Session validation unavailable", {status:503});
      }
      activeSession = await check.json();
    } catch (error) {
      if (error instanceof Response) throw error;
      console.error("[Auth] Session validation transport error");
      throw new Response("Session validation unavailable", {status:503});
    }
    if (activeSession !== true) {
      console.warn("[Auth] Verified user has no active session record");
      throw new Response("This session was signed out from another device", {status:401});
    }

    // Platform-owned, per-request business context: never trust browser tenant IDs.
    // The support session must belong to this verified SaaS Administrator and remain active.
    const supportSessionId=request.headers.get("x-assetflow-support-session");
    let supportTenantId:string|null=null;
    if(supportSessionId){
      if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(supportSessionId))
        throw new Response("Invalid support session identifier",{status:403});
      const {rows:[access]}=await getPostgresPool().query<{tenant_id:string}>(
       `SELECT s.tenant_id FROM public.platform_tenant_access_sessions s
         JOIN public.profiles p ON p.id=s.administrator_id
         WHERE s.id=$1 AND s.administrator_id=$2 AND s.ended_at IS NULL
           AND s.expires_at>NOW() AND p.is_saas_admin=TRUE AND p.is_active=TRUE`,
       [supportSessionId,verifiedUserId]);
      if(!access)throw new Response("Business support session expired or revoked",{status:403});
      supportTenantId=access.tenant_id;
    }
    return next({
      context: {
        supabase,
        userId: verifiedUserId,
        claims: { sub: verifiedUserId },
        supportTenantId,
        supportSessionId: supportTenantId?supportSessionId:null,
      },
    })
  }
)
