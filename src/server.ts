import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { startBackupScheduler } from "./lib/backup-core.server";
import { startTenantAutomationScheduler } from "./lib/automation-core.server";
import { createHash } from "node:crypto";
import { supabaseAdmin } from "./integrations/supabase/client.server";
import { completeMicrosoftOAuth } from "./lib/microsoft365.server";

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
startTenantAutomationScheduler();

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

async function maybeHandleMicrosoftOAuth(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== "/api/integrations/microsoft/callback") return null;

  const state = url.searchParams.get("state") || "";
  const code = url.searchParams.get("code") || "";
  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");

  const target = new URL("/integrations", url.origin);

  if (error) {
    target.searchParams.set("microsoft", "error");
    target.searchParams.set("message", errorDescription || error);
    return Response.redirect(target.toString(), 302);
  }

  if (!state || !code) {
    target.searchParams.set("microsoft", "error");
    target.searchParams.set("message", "Microsoft did not return a valid authorization response.");
    return Response.redirect(target.toString(), 302);
  }

  try {
    await completeMicrosoftOAuth({ state, code });
    target.searchParams.set("microsoft", "connected");
    return Response.redirect(target.toString(), 302);
  } catch (oauthError: any) {
    console.error("[Microsoft365] OAuth callback failed", oauthError);
    target.searchParams.set("microsoft", "error");
    target.searchParams.set("message", oauthError?.message || "Microsoft 365 connection failed.");
    return Response.redirect(target.toString(), 302);
  }
}

async function maybeHandlePublicApi(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/v1/")) return null;

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
  const scopes = Array.isArray(key.scopes) ? key.scopes : [];

  if (resource === "tracking/events") {
    if (request.method !== "POST") {
      return jsonResponse(405, { error: "method_not_allowed", message: "Use POST for tracking telemetry." });
    }
    if (!scopes.includes("tracking:write")) {
      return jsonResponse(403, { error: "forbidden", message: "API key does not have tracking:write permission." });
    }

    const [{ data: module }, { data: override }] = await Promise.all([
      apiAdmin.from("saas_modules").select("globally_enabled,billing_model").eq("module_key", "live_tracking").single(),
      apiAdmin.from("tenant_module_overrides").select("enabled").eq("tenant_id", key.tenant_id).eq("module_key", "live_tracking").maybeSingle(),
    ]);
    if (!module?.globally_enabled || module?.billing_model !== "add_on" || override?.enabled !== true) {
      return jsonResponse(403, { error: "module_disabled", message: "Live Tracking is an optional paid add-on and is not active for this workspace." });
    }

    let body: any;
    try {
      body = await request.json();
    } catch {
      return jsonResponse(400, { error: "invalid_json", message: "A JSON body is required." });
    }
    const provider = String(body?.provider || "").trim().toLowerCase();
    const externalDeviceId = String(body?.external_device_id || "").trim();
    const latitude = Number(body?.latitude);
    const longitude = Number(body?.longitude);
    const accuracy = body?.accuracy_m == null ? null : Number(body.accuracy_m);
    const speed = body?.speed_kph == null ? null : Number(body.speed_kph);
    const heading = body?.heading_degrees == null ? null : Number(body.heading_degrees);
    const recordedAt = body?.recorded_at ? new Date(body.recorded_at) : new Date();

    if (!provider || !externalDeviceId || !Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
        !Number.isFinite(longitude) || longitude < -180 || longitude > 180 || Number.isNaN(recordedAt.getTime())) {
      return jsonResponse(400, { error: "invalid_telemetry", message: "provider, external_device_id, latitude and longitude are required." });
    }

    const { data: device, error: deviceError } = await apiAdmin.from("tracking_devices")
      .select("id,asset_id,is_active")
      .eq("tenant_id", key.tenant_id)
      .eq("provider", provider)
      .eq("external_device_id", externalDeviceId)
      .maybeSingle();
    if (deviceError || !device) {
      return jsonResponse(404, { error: "device_not_found", message: "Tracking device is not registered in this workspace." });
    }
    if (!device.is_active) {
      return jsonResponse(409, { error: "device_disabled", message: "Tracking device is registered but disabled." });
    }

    const telemetry = {
      tenant_id: key.tenant_id,
      device_id: device.id,
      asset_id: device.asset_id,
      latitude,
      longitude,
      accuracy_m: Number.isFinite(accuracy) ? accuracy : null,
      speed_kph: Number.isFinite(speed) ? speed : null,
      heading_degrees: Number.isFinite(heading) ? heading : null,
      recorded_at: recordedAt.toISOString(),
      metadata: body?.metadata && typeof body.metadata === "object" ? body.metadata : {},
    };
    const { data: event, error: eventError } = await apiAdmin.from("tracking_events").insert(telemetry).select("id,recorded_at").single();
    if (eventError) return jsonResponse(500, { error: "telemetry_failed", message: eventError.message });

    await apiAdmin.from("tracking_devices").update({ last_seen_at: recordedAt.toISOString(), updated_at: new Date().toISOString() }).eq("id", device.id);
    if (device.asset_id) {
      await apiAdmin.from("assets").update({
        live_latitude: latitude,
        live_longitude: longitude,
        live_accuracy_m: Number.isFinite(accuracy) ? accuracy : null,
        live_recorded_at: recordedAt.toISOString(),
        live_tracking_device_id: device.id,
      }).eq("id", device.asset_id).eq("tenant_id", key.tenant_id);
    }
    await apiAdmin.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", key.id);
    return jsonResponse(201, { data: { event_id: event.id, recorded_at: event.recorded_at }, meta: { api_version: "v1" } });
  }

  if (request.method !== "GET") {
    return jsonResponse(405, { error: "method_not_allowed", message: "This API v1 resource is read-only." });
  }

  const config: Record<string, { table: string; scope: string; select: string }> = {
    assets: {
      table: "assets",
      scope: "assets:read",
      select: "id,asset_tag,serial_number,name,description,status,purchase_value,purchase_date,category_id,location_id,branch_id,geo_place_id,location_latitude,location_longitude,location_accuracy_m,location_verified_at,live_latitude,live_longitude,live_accuracy_m,live_recorded_at,created_at,updated_at",
    },
    locations: {
      table: "locations",
      scope: "locations:read",
      select: "id,name,address,parent_id,is_active,location_type,branch_id,geo_place_id,is_structured,country_code,administrative_area,locality,custom_area,latitude,longitude,gps_accuracy_m,location_source,last_verified_at,created_at",
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
// {"unhandled":true,"message":"HTTPError"} - try/catch alone never fires for those.
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
      const microsoftResponse = await maybeHandleMicrosoftOAuth(request);
      if (microsoftResponse) return microsoftResponse;

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
