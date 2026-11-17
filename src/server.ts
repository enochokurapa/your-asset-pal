import {queryPostgres,getPostgresPool} from "./lib/postgres.server";
import {startOperationsNoticeScheduler} from "./lib/platform-operations-notices.server";
import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { startBackupScheduler } from "./lib/backup-core.server";
import {createR2PresignedUrl} from "./lib/backup-core.server";
import { startTenantAutomationScheduler } from "./lib/automation-core.server";
import { startPlatformEmailReportScheduler } from "./lib/platform-email-reports.server";
import { createHash } from "node:crypto";
import {handleAssetStorage,signedAssetFileUrl} from "./lib/asset-r2-storage.server";
import { maybeHandlePlatformBrandingAsset } from "./lib/platform-branding-assets.server";
import { supabaseAdmin } from "./integrations/supabase/client.server";
import {maybeHandleEmailMfa,shouldRequireEmailMfa} from "./lib/platform-security-email-mfa.server";
import {confirmSaasEmailRecovery} from "./lib/platform-email-recovery.server";
import { completeMicrosoftOAuth } from "./lib/microsoft365.server";
import {domainGuard,protectDomainLoginResponse} from "./lib/custom-domain-guard.server";

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
startPlatformEmailReportScheduler();
startOperationsNoticeScheduler();

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

  if(route.prefix==="/rest/v1"){
    const authorization=request.headers.get("authorization")||"";
    if(authorization.startsWith("Bearer ")){
      const token=authorization.slice(7);
      const path=sourceUrl.pathname;
      // Minimal profile/role lookup is needed to render MFA before accessing
      // protected organisation data. All other admin REST operations require proof.
      const enrollmentMetadata=request.method==="GET"&&
        /^\/rest\/v1\/(profiles|user_roles|user_permissions|user_approval_rights|user_action_rights|user_branch_access)$/.test(path);
      const loginSessionRpc=request.method==="POST"&&
        /^\/rest\/v1\/rpc\/(current_login_session_valid|other_login_sessions|replace_other_login_sessions)$/.test(path);
      if(!enrollmentMetadata&&!loginSessionRpc){
        try{if(await shouldRequireEmailMfa(token,request.headers.get("cookie")||""))return jsonResponse(403,{error:"mfa_required",message:"Complete sign-in verification before continuing"});}
        catch{return jsonResponse(503,{error:"security_check_unavailable",message:"Sign-in security check unavailable"});}
      }
    }
  }

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

    const safeResponse=await protectDomainLoginResponse(request,upstreamResponse);
    return new Response(safeResponse.body, {
      status: safeResponse.status,
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
    .select("id,tenant_id,scopes,is_active,expires_at,created_by")
    .eq("key_hash", keyHash)
    .maybeSingle();

  if (keyError || !key || !key.is_active || (key.expires_at && new Date(key.expires_at).getTime() <= Date.now())) {
    return jsonResponse(401, { error: "unauthorized", message: "API key is invalid, expired or revoked." });
  }

  // Enforce the commercial entitlement for EVERY request, not only when
  // issuing a key. Revocation, expiry and plan suspension must block old keys.
  const [{data: tenant, error: tenantError}, {data: apiModule, error: moduleError},
         {data: apiOverride, error: overrideError}] = await Promise.all([
    apiAdmin.from("tenants").select("subscription_status,subscription_ends_at").eq("id",key.tenant_id).single(),
    apiAdmin.from("saas_modules").select("globally_enabled,billing_model").eq("module_key","api_access").single(),
    apiAdmin.from("tenant_module_overrides").select("enabled").eq("tenant_id",key.tenant_id).eq("module_key","api_access").maybeSingle(),
  ]);
  if(tenantError||moduleError||overrideError)
    return jsonResponse(503,{error:"entitlement_unavailable",message:"Unable to verify subscription entitlement."});
  if(!tenant || tenant.subscription_status!=="active" ||
     (tenant.subscription_ends_at && new Date(tenant.subscription_ends_at).getTime()<=Date.now()))
    return jsonResponse(403,{error:"subscription_inactive",message:"An active subscription is required."});
  if(!apiModule?.globally_enabled || apiModule.billing_model!=="add_on" || apiOverride?.enabled!==true)
    return jsonResponse(403,{error:"api_add_on_inactive",message:"API access is not enabled for this workspace."});

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
    // Reject oversized or structurally invalid telemetry before writing with service-role privileges.
    if (JSON.stringify(body).length > 16_384 || !body || typeof body !== "object" || Array.isArray(body)) {
      return jsonResponse(413, { error: "invalid_payload", message: "Tracking payload must be a JSON object under 16 KB." });
    }
    if (body.metadata !== undefined &&
        (!body.metadata || typeof body.metadata !== "object" || Array.isArray(body.metadata) ||
         JSON.stringify(body.metadata).length > 2_048)) {
      return jsonResponse(400, { error: "invalid_metadata", message: "Tracking metadata must be a small JSON object." });
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

    if ((accuracy !== null && (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > 50_000)) ||
        (speed !== null && (!Number.isFinite(speed) || speed < 0 || speed > 500)) ||
        (heading !== null && (!Number.isFinite(heading) || heading < 0 || heading >= 360)) ||
        recordedAt.getTime() > Date.now() + 5 * 60_000) {
      return jsonResponse(400, { error: "invalid_telemetry", message: "Tracking measurement or timestamp is outside allowed bounds." });
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
    if (eventError) {
      console.error("[API] Tracking event write failed", eventError);
      return jsonResponse(500, { error: "telemetry_failed", message: "Unable to save telemetry at this time." });
    }

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

  const assetFilePath=/^assets\/([0-9a-f-]{36})\/files$/i.exec(resource);
  if(assetFilePath){
    const assetId=assetFilePath[1];
    const {data:asset}=await apiAdmin.from("assets").select("id").eq("id",assetId).eq("tenant_id",key.tenant_id).maybeSingle();
    if(!asset)return jsonResponse(404,{error:"asset_not_found"});
    if(request.method==="GET"){
      if(!scopes.includes("files:read"))return jsonResponse(403,{error:"missing_scope",message:"files:read required"});
      const {data,error}=await apiAdmin.from("asset_attachments")
        .select("id,kind,file_name,mime_type,storage_path,created_at")
        .eq("asset_id",assetId).eq("tenant_id",key.tenant_id).order("created_at",{ascending:false}).limit(200);
      if(error)return jsonResponse(500,{error:"file_query_failed"});
      const entries=(data??[]).map((x:any)=>({
        id:x.id,kind:x.kind,file_name:x.file_name,mime_type:x.mime_type,created_at:x.created_at,
        download_url:"https://assetflow360.com"+signedAssetFileUrl(key.tenant_id,x.storage_path,300),
        expires_in_seconds:300,
      }));
      return jsonResponse(200,{data:entries,meta:{api_version:"v1",count:entries.length}});
    }
    if(request.method==="POST"){
      if(!scopes.includes("files:write"))return jsonResponse(403,{error:"missing_scope",message:"files:write required"});
      let body:any;
      try{
        const raw=await request.text();
        if(raw.length>4_000_000)return jsonResponse(413,{error:"file_too_large"});
        body=JSON.parse(raw);
      }catch{return jsonResponse(400,{error:"invalid_json"});}
      if(!body||!["image","invoice","receipt","warranty","other"].includes(body.kind))
        return jsonResponse(400,{error:"invalid_file_kind"});
      const mime=String(body.content_type||"");
      const types=["image/jpeg","image/png","image/webp","application/pdf"];
      if(!types.includes(mime))return jsonResponse(415,{error:"file_type_not_supported"});
      const name=String(body.file_name||"file").replace(/[^a-zA-Z0-9._-]/g,"_").slice(0,100);
      const b64=String(body.data_base64||"");
      if(!b64||b64.length>3_000_000||!/^[a-zA-Z0-9+/]+={0,2}$/.test(b64))
        return jsonResponse(413,{error:"invalid_file_data"});
      const bytes=Buffer.from(b64,"base64");
      if(!bytes.length||bytes.length>2_000_000)return jsonResponse(413,{error:"file_too_large"});
      const path=key.tenant_id+"/"+assetId+"/"+Date.now()+"-"+crypto.randomUUID()+"-"+name;
      const dest=createR2PresignedUrl("PUT","asset-files/"+path,120);
      const response=await fetch(dest,{method:"PUT",body:bytes,headers:{"content-type":mime},signal:AbortSignal.timeout(25000)});
      if(!response.ok)return jsonResponse(502,{error:"file_storage_failed"});
      const {data:record,error}=await apiAdmin.from("asset_attachments").insert({
        tenant_id:key.tenant_id,asset_id:assetId,kind:body.kind,file_name:name,storage_path:path,
        mime_type:mime,uploaded_by:key.created_by??null
      }).select("id,kind,file_name,created_at").single();
      if(error)return jsonResponse(500,{error:"file_metadata_failed"});
      return jsonResponse(201,{data:record});
    }
    return jsonResponse(405,{error:"method_not_allowed"});
  }
  const assetPath=/^assets\/([0-9a-f-]{36})$/i.exec(resource);
  const assetId=assetPath?.[1] ?? (resource==="assets" ? url.searchParams.get("id") : null);
  if(assetPath && request.method==="GET"){
    if(!scopes.includes("assets:read"))return jsonResponse(403,{error:"forbidden",message:"assets:read required"});
    const {data,error}=await apiAdmin.from("assets").select("*").eq("tenant_id",key.tenant_id).eq("id",assetId).maybeSingle();
    if(error)return jsonResponse(500,{error:"query_failed"});
    if(!data)return jsonResponse(404,{error:"asset_not_found"});
    return jsonResponse(200,{data,meta:{api_version:"v1"}});
  }
  if((resource==="assets"||assetPath) && ["POST","PATCH","DELETE"].includes(request.method)){
    if(!scopes.includes("assets:write"))
      return jsonResponse(403,{error:"forbidden",message:"assets:write permission required"});
    if(request.method==="POST"&&resource!=="assets"||request.method!=="POST"&&!assetPath)
      return jsonResponse(405,{error:"method_not_allowed"});
    if(request.method==="DELETE"){
      // Soft disposal preserves verification history, custody and audit evidence.
      const {data:current}=await apiAdmin.from("assets").select("id,status").eq("tenant_id",key.tenant_id).eq("id",assetId).maybeSingle();
      if(!current)return jsonResponse(404,{error:"asset_not_found"});
      const {data,error}=await apiAdmin.from("assets").update({status:"disposed"}).eq("tenant_id",key.tenant_id)
        .eq("id",assetId).select("id,asset_tag,status").single();
      if(error)return jsonResponse(409,{error:"asset_retirement_failed",message:"Asset could not be archived"});
      await queryPostgres("INSERT INTO public.audit_log(tenant_id,entity_type,entity_id,action,actor_user_id,details) VALUES($1,'asset',$2,'api_soft_delete',$3,$4::jsonb)",
        [key.tenant_id,assetId,key.created_by??null,JSON.stringify({api_key_id:key.id,previous_status:current.status})]).catch(console.error);
      return jsonResponse(200,{data,archived:true,message:"Asset disposed; history retained."});
    }
    const size=Number(request.headers.get("content-length")||0);
    if(size>32768)return jsonResponse(413,{error:"payload_too_large"});
    let body:Record<string,any>;
    try{
      const raw=await request.text();
      if(raw.length>32768)return jsonResponse(413,{error:"payload_too_large"});
      const decoded=JSON.parse(raw);
      if(!decoded||typeof decoded!=="object"||Array.isArray(decoded))throw Error();
      body=decoded;
    }catch{return jsonResponse(400,{error:"invalid_json"});}
    const allowed=new Set(["name","asset_tag","serial_number","description","category_id","location_id","branch_id",
      "status","condition","purchase_value","purchase_date","custom_fields"]);
    if(Object.keys(body).some(k=>!allowed.has(k)))
      return jsonResponse(400,{error:"unsupported_field",message:"Request contains an uneditable field"});
    const cleaned:Record<string,unknown>={};
    const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const statuses=new Set(["in_use","in_storage","under_repair","retired","disposed","missing","checked_out"]);
    for(const [field,value] of Object.entries(body)){
      if(value===null){cleaned[field]=null;continue;}
      if(["name","asset_tag","serial_number","description"].includes(field)){
        if(typeof value!=="string"||value.length>500 ||(field==="name"&&!value.trim()))
          return jsonResponse(400,{error:"invalid_field",field});
        cleaned[field]=value.trim();continue;
      }
      if(["category_id","location_id","branch_id"].includes(field)){
        if(typeof value!=="string"||!uuid.test(value))return jsonResponse(400,{error:"invalid_reference",field});
        cleaned[field]=value;continue;
      }
      if(field==="status"){if(!statuses.has(String(value)))return jsonResponse(400,{error:"invalid_status"});cleaned[field]=value;continue;}
      if(field==="condition"){if(typeof value!=="string"||value.length>40)return jsonResponse(400,{error:"invalid_condition"});cleaned[field]=value;continue;}
      if(field==="purchase_value"){
        if(typeof value!=="number"||!Number.isFinite(value)||value<0||value>1e15)return jsonResponse(400,{error:"invalid_purchase_value"});
        cleaned[field]=value;continue;
      }
      if(field==="purchase_date"){
        if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(value)||Number.isNaN(Date.parse(value)))
          return jsonResponse(400,{error:"invalid_purchase_date"});
        cleaned[field]=value;continue;
      }
      if(field==="custom_fields"){
        if(!value||Array.isArray(value)||typeof value!=="object"||JSON.stringify(value).length>8192)
          return jsonResponse(400,{error:"invalid_custom_fields"});
        cleaned[field]=value;continue;
      }
    }
    if(request.method==="POST"){
      if(typeof cleaned.name!=="string")return jsonResponse(400,{error:"name_required"});
      // Lock the tenant row to allocate a unique register number under concurrent imports.
      const client=await getPostgresPool().connect();
      try{
        await client.query("BEGIN");
        await client.query("SELECT id FROM public.tenants WHERE id=$1 FOR UPDATE",[key.tenant_id]);
        const {rows:numbers}=await client.query<{next_no:string}>(
          "SELECT COALESCE(MAX(asset_number),0)+1 AS next_no FROM public.assets WHERE tenant_id=$1",[key.tenant_id]);
        const fields=Object.keys(cleaned);
        const vals=fields.map(k=>cleaned[k]);
        const cols=["tenant_id","asset_number",...fields];
        const result=await client.query(
          "INSERT INTO public.assets ("+cols.map(k=>'"'+k+'"').join(",")+") VALUES ("+
          cols.map((_,i)=>"$"+(i+1)).join(",")+") RETURNING id,asset_tag,asset_number,name,status",
          [key.tenant_id,Number(numbers[0].next_no),...vals]);
        await client.query("COMMIT");
        return jsonResponse(201,{data:result.rows[0],meta:{api_version:"v1"}});
      }catch(e){
        await client.query("ROLLBACK");
        console.error("[API] Asset creation rejected",String(e).slice(0,200));
        return jsonResponse(409,{error:"asset_create_rejected",message:"Check references, subscription capacity and asset fields."});
      }finally{client.release();}
    }
    if(!Object.keys(cleaned).length)return jsonResponse(400,{error:"no_changes"});
    const {data,error}=await apiAdmin.from("assets").update(cleaned).eq("tenant_id",key.tenant_id)
      .eq("id",assetId).select("id,asset_tag,name,status,updated_at").maybeSingle();
    if(error)return jsonResponse(409,{error:"asset_update_rejected",message:"Check field values and organisation references."});
    if(!data)return jsonResponse(404,{error:"asset_not_found"});
    return jsonResponse(200,{data,meta:{api_version:"v1"}});
  }
  if(request.method!=="GET"){
    return jsonResponse(405,{error:"method_not_allowed",message:"This resource is read-only"});
  }
  if(assetPath)return jsonResponse(404,{error:"not_found"});
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
  if (error) {
    console.error("[API] Resource query failed", error);
    return jsonResponse(500, { error: "query_failed", message: "Unable to retrieve this resource at this time." });
  }

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

function withSecurityHeaders(response: Response, request: Request): Response {
  const headers = new Headers(response.headers);
  // Never cache application HTML by path. The static asset directory is also
  // /assets, so the framework may incorrectly mark /assets HTML as immutable.
  // This caused browsers of ALL tenants to keep stale location-picker JS
  // after deployment. Only hashed JS/CSS/images may use immutable caching.
  if ((headers.get("content-type") || "").toLowerCase().includes("text/html")) {
    headers.set("cache-control", "no-store, no-cache, must-revalidate, max-age=0");
    headers.set("pragma", "no-cache");
    headers.set("expires", "0");
    headers.delete("etag");
    headers.delete("last-modified");
  }
  headers.set("x-content-type-options", "nosniff");
  headers.set("referrer-policy", "strict-origin-when-cross-origin");
  headers.set("x-frame-options", "SAMEORIGIN");
  headers.set("permissions-policy", "camera=(self), geolocation=(self), microphone=()");
  // TLS terminates at the trusted reverse proxy; browsers only honor this over HTTPS.
  headers.set("strict-transport-security", "max-age=31536000");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      if(new URL(request.url).pathname==="/api/health"){
        try{
          await queryPostgres("SELECT 1");
          return withSecurityHeaders(jsonResponse(200,{status:"ok",database:"ok"}),request);
        }catch{
          return withSecurityHeaders(jsonResponse(503,{status:"degraded",database:"unavailable"}),request);
        }
      }
      const storageResult=await handleAssetStorage(request);
      if(storageResult)return withSecurityHeaders(storageResult,request);
      const domainCheck=await domainGuard(request);
      if(domainCheck)return withSecurityHeaders(domainCheck,request);
      const brandedAsset = await maybeHandlePlatformBrandingAsset(request);
      if (brandedAsset) return withSecurityHeaders(brandedAsset, request);

      const microsoftResponse = await maybeHandleMicrosoftOAuth(request);
      if (microsoftResponse) return withSecurityHeaders(microsoftResponse, request);

      const recoveryResponse=await confirmSaasEmailRecovery(request);
      if(recoveryResponse)return withSecurityHeaders(recoveryResponse,request);

      const emailMfa=await maybeHandleEmailMfa(request);
      if(emailMfa)return withSecurityHeaders(emailMfa,request);

      const apiResponse = await maybeHandlePublicApi(request);
      if (apiResponse) return withSecurityHeaders(apiResponse, request);

      const proxied = await maybeProxySupabase(request);
      if (proxied) return withSecurityHeaders(proxied, request);

      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return withSecurityHeaders(await normalizeCatastrophicSsrResponse(response), request);
    } catch (error) {
      console.error(error);
      return withSecurityHeaders(brandedErrorResponse(), request);
    }
  },
};
