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
    return next({ headers: { Authorization: `Bearer ${session.access_token}` } });
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
      // GoTrue verified the token first. A user with a verified authenticator
      // must complete the AAL2 challenge before privileged server functions run.
      // Do not trust a browser-only MFA redirect as the authorization boundary.
      if (verifiedUser.factors?.some(f => f.factor_type === "totp" && f.status === "verified")) {
        let aal = "";
        try {
          const jwtPayload = JSON.parse(Buffer.from(token.split(".")[1] || "", "base64url").toString("utf8")) as {aal?: string};
          aal = jwtPayload.aal || "";
        } catch {
          throw new Response("Invalid authentication assurance claim", { status: 401 });
        }
        if (aal !== "aal2") {
          throw new Response("Authenticator verification required", { status: 403 });
        }
      }
    } catch (error) {
      if (error instanceof Response) throw error;
      console.error("[Supabase] Authentication service unavailable", error);
      throw new Response("Authentication service unavailable", { status: 503 });
    }

    // MFA is mandatory for SaaS and tenant administrators, including those
    // who have not enrolled a factor. This is enforced at the server boundary,
    // rather than relying solely on a browser redirect.
    const accessRestBase = (process.env.SUPABASE_REST_INTERNAL_URL?.trim() ||
      `${SUPABASE_URL.replace(/\/$/, "")}/rest/v1`).replace(/\/$/, "");
    try {
      const headers={Authorization:`Bearer ${token}`,apikey:SUPABASE_PUBLISHABLE_KEY};
      const [profileResponse,rolesResponse]=await Promise.all([
        fetch(`${accessRestBase}/profiles?select=is_saas_admin,tenant_role&id=eq.${encodeURIComponent(verifiedUserId)}&limit=1`,{headers,signal:AbortSignal.timeout(10000)}),
        fetch(`${accessRestBase}/user_roles?select=role&user_id=eq.${encodeURIComponent(verifiedUserId)}`,{headers,signal:AbortSignal.timeout(10000)}),
      ]);
      if(!profileResponse.ok||!rolesResponse.ok)throw new Response("Administrator MFA policy lookup unavailable",{status:503});
      const profiles=await profileResponse.json() as Array<{is_saas_admin?:boolean;tenant_role?:string}>;
      const roles=await rolesResponse.json() as Array<{role?:string}>;
      if(!profiles.length)throw new Response("User profile is unavailable",{status:403});
      const admin=profiles[0].is_saas_admin===true||profiles[0].tenant_role==="tenant_admin"||roles.some(r=>r.role==="admin");
      if(admin){
        let aal="";
        try{aal=String((JSON.parse(Buffer.from(token.split(".")[1]||"","base64url").toString("utf8")) as {aal?:string}).aal||"");}
        catch{throw new Response("Invalid authentication assurance claim",{status:401});}
        if(aal!=="aal2")throw new Response("Administrator MFA enrollment or verification required",{status:403});
      }
    }catch(error){
      if(error instanceof Response)throw error;
      console.error("[Auth] Could not verify administrator MFA policy");
      throw new Response("Administrator MFA policy unavailable",{status:503});
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

    return next({
      context: {
        supabase,
        userId: verifiedUserId,
        claims: { sub: verifiedUserId },
      },
    })
  }
)
