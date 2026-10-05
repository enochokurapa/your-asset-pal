import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { startBackupScheduler } from "./lib/backup-core.server";
import { createHash } from "node:crypto";
import { supabaseAdmin } from "./integrations/supabase/client.server";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

type SupabaseProxyRoute = {
  prefix: "/auth/v1" | "/rest/v1";
  envName: "SUPABASE_AUTH_INTERNAL_URL" | "SUPABASE_REST_INTERNAL_URL";
  serviceName: string;
};

const SUPABASE_PROXY_ROUTES: SupabaseProxyRoute[] = [
  {
    prefix: "/auth/v1",
    envName: "SUPABASE_AUTH_INTERNAL_URL",
    serviceName: "Authentication",
  },
  {
    prefix: "/rest/v1",
    envName: "SUPABASE_REST_INTERNAL_URL",
    serviceName: "Database API",
  },
];

let serverEntryPromise: Promise<ServerEntry> | undefined;

// The scheduler is intentionally part of the application server so a separate paid
// cron service is not required. It checks the saved SaaS policy every five minutes
// and creates a backup only when the configured 6/24-hour interval has elapsed.
startBackupScheduler();

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => ((m as { default?: ServerEntry }).default ?? (m as unknown as ServerEntry)),
    );
  }
  return serverEntryPromise;
}

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function proxyRouteFor(pathname: string): SupabaseProxyRoute | undefined {
  return SUPABASE_PROXY_ROUTES.find(
    ({ prefix }) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * Keep Supabase traffic on the application's public origin and proxy it over the
 * private Docker network. This removes the fragile dependency on competing
 * Traefik routers for /auth/v1 and /rest/v1 and, importantly, guarantees JSON
 * errors instead of a plain-text "404 page not found" response that supabase-js
 * cannot parse.
 */
async function maybeProxySupabase(request: Request): Promise<Response | null> {
  const sourceUrl = new URL(request.url);
  const route = proxyRouteFor(sourceUrl.pathname);
  if (!route) return null;

  const upstreamBase = process.env[route.envName]?.trim();
  if (!upstreamBase) {
    console.error(`[Supabase proxy] Missing ${route.envName}`);
    return jsonResponse(503, {
      message: `${route.serviceName} is temporarily unavailable`,
      error: "upstream_not_configured",
    });
  }

  let upstreamUrl: URL;
  try {
    upstreamUrl = new URL(upstreamBase);
  } catch {
    console.error(`[Supabase proxy] Invalid ${route.envName}`);
    return jsonResponse(503, {
      message: `${route.serviceName} is temporarily unavailable`,
      error: "upstream_misconfigured",
    });
  }

  const strippedPath = sourceUrl.pathname.slice(route.prefix.length) || "/";
  upstreamUrl.pathname = strippedPath.startsWith("/") ? strippedPath : `/${strippedPath}`;
  upstreamUrl.search = sourceUrl.search;

  const headers = new Headers(request.headers);
  for (const name of [
    "host",
    "connection",
    "content-length",
    "transfer-encoding",
    "accept-encoding",
  ]) {
    headers.delete(name);
  }
  headers.set("x-forwarded-host", sourceUrl.host);
  headers.set("x-forwarded-proto", sourceUrl.protocol.replace(":", ""));
  headers.set("x-forwarded-prefix", route.prefix);

  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: "manual",
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = await request.arrayBuffer();
  }

  try {
    const upstreamResponse = await fetch(upstreamUrl, init);
    const responseHeaders = new Headers(upstreamResponse.headers);
    responseHeaders.delete("content-length");
    responseHeaders.delete("transfer-encoding");
    responseHeaders.delete("connection");

    const location = responseHeaders.get("location");
    if (location) {
      try {
        const resolved = new URL(location, upstreamUrl);
        if (resolved.origin === upstreamUrl.origin) {
          responseHeaders.set(
            "location",
            `${sourceUrl.origin}${route.prefix}${resolved.pathname}${resolved.search}${resolved.hash}`,
          );
        }
      } catch {
        // Leave an unusual Location header untouched rather than failing the request.
      }
    }

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error(`[Supabase proxy] ${route.serviceName} upstream request failed`, error);
    return jsonResponse(503, {
      message: `${route.serviceName} is temporarily unavailable`,
      error: "upstream_unreachable",
    });
  }
}


const apiAdmin = supabaseAdmin as any;

async function maybeHandlePublicApi(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/v1/")) return null;

  if (request.method !== "GET") {
    return jsonResponse(405, { error: "method_not_allowed", message: "API v1 is read-only in this release." });
  }

  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token.startsWith("af_live_")) {
    return jsonResponse(401, { error: "unauthorized", message: "A valid AssetFlow API key is required." });
  }

  const keyHash = createHash("sha256").update(token).digest("hex");
  const { data: key, error: keyError } = await apiAdmin
    .from("api_keys")
    .select("id,tenant_id,scopes,is_active,expires_at")
    .eq("key_hash", keyHash)
    .maybeSingle();

  if (keyError || !key || !key.is_active || (key.expires_at && new Date(key.expires_at).getTime() <= Date.now())) {
    return jsonResponse(401, { error: "unauthorized", message: "API key is invalid, expired or revoked." });
  }

  const resource = url.pathname.slice("/api/v1/".length).replace(/\/+$/, "");
  const config: Record<string, { table: string; scope: string; select: string }> = {
    assets: {
      table: "assets",
      scope: "assets:read",
      select: "id,asset_tag,serial_number,name,description,status,purchase_value,purchase_date,category_id,location_id,branch_id,created_at,updated_at",
    },
    locations: {
      table: "locations",
      scope: "locations:read",
      select: "id,name,address,parent_id,is_active,country_code,administrative_area,locality,custom_area,latitude,longitude,gps_accuracy_m,location_source,last_verified_at,created_at",
    },
    branches: {
      table: "branches",
      scope: "branches:read",
      select: "id,name,code,address,is_active,created_at",
    },
  };

  const chosen = config[resource];
  if (!chosen) {
    return jsonResponse(404, { error: "not_found", message: "Unknown API v1 resource." });
  }

  const scopes = Array.isArray(key.scopes) ? key.scopes : [];
  if (!scopes.includes(chosen.scope)) {
    return jsonResponse(403, { error: "forbidden", message: `API key does not have ${chosen.scope} permission.` });
  }

  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || "100"), 1), 500);
  let query = apiAdmin.from(chosen.table).select(chosen.select).eq("tenant_id", key.tenant_id).limit(limit);
  const id = url.searchParams.get("id");
  if (id) query = query.eq("id", id);

  const { data, error } = await query;
  if (error) return jsonResponse(500, { error: "query_failed", message: error.message });

  await apiAdmin.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", key.id);
  return jsonResponse(200, {
    data: data ?? [],
    meta: { resource, count: data?.length ?? 0, limit, api_version: "v1" },
  });
}

function brandedErrorResponse(): Response {
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isCatastrophicSsrErrorBody(body: string, responseStatus: number): boolean {
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return false;
  }

  if (!payload || Array.isArray(payload) || typeof payload !== "object") {
    return false;
  }

  const fields = payload as Record<string, unknown>;
  const expectedKeys = new Set(["message", "status", "unhandled"]);
  if (!Object.keys(fields).every((key) => expectedKeys.has(key))) {
    return false;
  }

  return (
    fields.unhandled === true &&
    fields.message === "HTTPError" &&
    (fields.status === undefined || fields.status === responseStatus)
  );
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isCatastrophicSsrErrorBody(body, response.status)) {
    return response;
  }

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return brandedErrorResponse();
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const apiResponse = await maybeHandlePublicApi(request);
      if (apiResponse) return apiResponse;

      const proxied = await maybeProxySupabase(request);
      if (proxied) return proxied;

      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return brandedErrorResponse();
    }
  },
};
