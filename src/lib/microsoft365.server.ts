import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const admin = supabaseAdmin as any;

export const MICROSOFT_SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access",
  "User.Read",
  "User.Read.All",
  "Mail.Send",
];

export function microsoftConfig() {
  const clientId = process.env.MICROSOFT_365_CLIENT_ID?.trim() || "";
  const clientSecret = process.env.MICROSOFT_365_CLIENT_SECRET?.trim() || "";
  const redirectUri =
    process.env.MICROSOFT_365_REDIRECT_URI?.trim() ||
    "https://assetflow360.com/api/integrations/microsoft/callback";
  return {
    clientId,
    clientSecret,
    redirectUri,
    configured: Boolean(clientId && clientSecret),
  };
}

function encryptionKey() {
  const configured = process.env.MICROSOFT_365_TOKEN_ENCRYPTION_KEY?.trim();
  const fallback = [
    process.env.SUPABASE_SERVICE_ROLE_KEY || "",
    process.env.MICROSOFT_365_CLIENT_SECRET || "",
    "assetflow-microsoft365-v1",
  ].join("|");
  return createHash("sha256").update(configured || fallback).digest();
}

export function encryptMicrosoftSecret(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64url"), tag.toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function decryptMicrosoftSecret(value: string) {
  const [ivRaw, tagRaw, cipherRaw] = value.split(".");
  if (!ivRaw || !tagRaw || !cipherRaw) throw new Error("Stored Microsoft token is invalid");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivRaw, "base64url"));
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(cipherRaw, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

function parseJwtPayload(token: string) {
  try {
    const part = token.split(".")[1];
    if (!part) return {} as Record<string, any>;
    return JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
  } catch {
    return {} as Record<string, any>;
  }
}

export async function exchangeMicrosoftCode(code: string) {
  const cfg = microsoftConfig();
  if (!cfg.configured) throw new Error("Microsoft 365 integration is not configured on the AssetFlow server");

  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    code,
    redirect_uri: cfg.redirectUri,
    grant_type: "authorization_code",
    scope: MICROSOFT_SCOPES.join(" "),
  });

  const response = await fetch("https://login.microsoftonline.com/organizations/oauth2/v2.0/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const json: any = await response.json().catch(() => ({}));
  if (!response.ok || !json.access_token || !json.refresh_token) {
    throw new Error(json.error_description || json.error || "Microsoft authorization failed");
  }
  return {
    accessToken: String(json.access_token),
    refreshToken: String(json.refresh_token),
    scopes: String(json.scope || "").split(/\s+/).filter(Boolean),
    identity: parseJwtPayload(String(json.id_token || "")),
  };
}

export async function getMicrosoftAccessToken(tenantId: string) {
  const cfg = microsoftConfig();
  if (!cfg.configured) throw new Error("Microsoft 365 integration is not configured on the AssetFlow server");

  const { data: connection, error } = await admin.from("microsoft_365_connections")
    .select("*").eq("tenant_id", tenantId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!connection || connection.status !== "connected" || !connection.refresh_token_ciphertext) {
    throw new Error("Microsoft 365 is not connected for this workspace");
  }

  const refreshToken = decryptMicrosoftSecret(connection.refresh_token_ciphertext);
  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    refresh_token: refreshToken,
    redirect_uri: cfg.redirectUri,
    grant_type: "refresh_token",
    scope: MICROSOFT_SCOPES.join(" "),
  });

  const response = await fetch("https://login.microsoftonline.com/organizations/oauth2/v2.0/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const json: any = await response.json().catch(() => ({}));
  if (!response.ok || !json.access_token) {
    await admin.from("microsoft_365_connections").update({
      status: "needs_reauth",
      last_error: json.error_description || json.error || "Token refresh failed",
      updated_at: new Date().toISOString(),
    }).eq("tenant_id", tenantId);
    throw new Error(json.error_description || json.error || "Microsoft authorization expired. Reconnect Microsoft 365.");
  }

  if (json.refresh_token && json.refresh_token !== refreshToken) {
    await admin.from("microsoft_365_connections").update({
      refresh_token_ciphertext: encryptMicrosoftSecret(String(json.refresh_token)),
      scopes: String(json.scope || "").split(/\s+/).filter(Boolean),
      status: "connected",
      last_error: null,
      updated_at: new Date().toISOString(),
    }).eq("tenant_id", tenantId);
  }

  return String(json.access_token);
}

export async function graphRequest(tenantId: string, path: string, init: RequestInit = {}) {
  const accessToken = await getMicrosoftAccessToken(tenantId);
  const response = await fetch(path.startsWith("http") ? path : `https://graph.microsoft.com/v1.0${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
      ...(init.headers || {}),
    },
  });
  if (response.status === 204) return null;
  const json: any = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(json?.error?.message || `Microsoft Graph request failed (${response.status})`);
  }
  return json;
}

export async function completeMicrosoftOAuth(input: {
  state: string;
  code: string;
}) {
  const hash = createHash("sha256").update(input.state).digest("hex");
  const { data: oauthState, error: stateError } = await admin.from("microsoft_365_oauth_states")
    .select("*").eq("state_hash", hash).maybeSingle();
  if (stateError || !oauthState || new Date(oauthState.expires_at).getTime() < Date.now()) {
    throw new Error("Microsoft connection request expired. Start the connection again.");
  }

  const exchanged = await exchangeMicrosoftCode(input.code);
  const identity = exchanged.identity || {};
  const now = new Date().toISOString();

  await admin.from("microsoft_365_connections").upsert({
    tenant_id: oauthState.tenant_id,
    microsoft_tenant_id: identity.tid || null,
    microsoft_user_id: identity.oid || identity.sub || null,
    account_email: identity.preferred_username || identity.email || null,
    display_name: identity.name || null,
    scopes: exchanged.scopes,
    refresh_token_ciphertext: encryptMicrosoftSecret(exchanged.refreshToken),
    status: "connected",
    connected_at: now,
    connected_by: oauthState.user_id,
    last_error: null,
    updated_at: now,
  }, { onConflict: "tenant_id" });

  await admin.from("microsoft_365_oauth_states").delete().eq("state_hash", hash);

  try {
    const me = await graphRequest(oauthState.tenant_id, "/me?$select=id,displayName,mail,userPrincipalName");
    await admin.from("microsoft_365_connections").update({
      microsoft_user_id: me?.id || identity.oid || null,
      display_name: me?.displayName || identity.name || null,
      account_email: me?.mail || me?.userPrincipalName || identity.preferred_username || null,
      updated_at: new Date().toISOString(),
    }).eq("tenant_id", oauthState.tenant_id);
  } catch {}

  return oauthState.tenant_id as string;
}
