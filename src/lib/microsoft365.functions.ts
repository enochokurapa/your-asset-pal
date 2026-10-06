import { createHash, randomBytes } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { graphRequest, MICROSOFT_SCOPES, microsoftConfig } from "@/lib/microsoft365.server";

const admin = supabaseAdmin as any;

async function assertApiAddOnEnabled(tenantId:string) {
  const [{data:module},{data:override}]=await Promise.all([
    admin.from("saas_modules").select("globally_enabled,billing_model").eq("module_key","api_access").single(),
    admin.from("tenant_module_overrides").select("enabled").eq("tenant_id",tenantId).eq("module_key","api_access").maybeSingle(),
  ]);
  if(!module?.globally_enabled || module?.billing_model!=="add_on" || override?.enabled!==true) {
    throw new Error("API Access is an optional paid add-on and is not active for this workspace");
  }
}

async function requireTenantAdmin(userId:string) {
  const {data:profile,error}=await admin.from("profiles")
    .select("tenant_id,tenant_role,is_saas_admin")
    .eq("id",userId).single();
  if(error || !profile?.tenant_id) throw new Error("Workspace not found");
  if(profile.is_saas_admin) throw new Error("Use a tenant administrator account to connect Microsoft 365");
  if(profile.tenant_role!=="tenant_admin") {
    const {data:role}=await admin.from("user_roles").select("role")
      .eq("user_id",userId).eq("role","admin").maybeSingle();
    if(!role) throw new Error("Administrator privileges required");
  }
  return profile.tenant_id as string;
}

export const getMicrosoft365Status=createServerFn({method:"GET"})
  .middleware([requireSupabaseAuth])
  .handler(async({context})=>{
    const tenantId=await requireTenantAdmin(context.userId);
    await assertApiAddOnEnabled(tenantId);
    const cfg=microsoftConfig();
    const {data,error}=await admin.from("microsoft_365_connections")
      .select("microsoft_tenant_id,microsoft_user_id,account_email,display_name,scopes,status,connected_at,last_sync_at,last_sync_status,directory_user_count,last_error,updated_at")
      .eq("tenant_id",tenantId).maybeSingle();
    if(error) throw new Error(error.message);

    const {data:preview,error:previewError}=await admin.from("microsoft_365_directory_users")
      .select("microsoft_user_id,display_name,mail,user_principal_name,job_title,department,office_location")
      .eq("tenant_id",tenantId)
      .order("display_name")
      .limit(8);
    if(previewError) throw new Error(previewError.message);

    return {
      configured:cfg.configured,
      redirect_uri:cfg.redirectUri,
      required_scopes:MICROSOFT_SCOPES,
      connection:data ?? null,
      directory_preview:preview ?? [],
    };
  });

export const getMicrosoft365ConnectUrl=createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .handler(async({context})=>{
    const tenantId=await requireTenantAdmin(context.userId);
    await assertApiAddOnEnabled(tenantId);
    const cfg=microsoftConfig();
    if(!cfg.configured) {
      throw new Error("Microsoft 365 platform credentials are not configured yet");
    }

    const state=randomBytes(32).toString("base64url");
    const hash=createHash("sha256").update(state).digest("hex");
    const expires=new Date(Date.now()+10*60_000).toISOString();

    await admin.from("microsoft_365_oauth_states").delete().lt("expires_at",new Date().toISOString());
    const {error}=await admin.from("microsoft_365_oauth_states").insert({
      state_hash:hash,
      tenant_id:tenantId,
      user_id:context.userId,
      expires_at:expires,
    });
    if(error) throw new Error(error.message);

    const url=new URL("https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize");
    url.searchParams.set("client_id",cfg.clientId);
    url.searchParams.set("response_type","code");
    url.searchParams.set("redirect_uri",cfg.redirectUri);
    url.searchParams.set("response_mode","query");
    url.searchParams.set("scope",MICROSOFT_SCOPES.join(" "));
    url.searchParams.set("state",state);
    url.searchParams.set("prompt","select_account");
    return {url:url.toString()};
  });

export const syncMicrosoft365Directory=createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .handler(async({context})=>{
    const tenantId=await requireTenantAdmin(context.userId);
    await assertApiAddOnEnabled(tenantId);
    const startedAt=new Date().toISOString();

    try {
      let next:string|undefined="/users?$select=id,displayName,givenName,surname,mail,userPrincipalName,jobTitle,department,officeLocation,businessPhones,mobilePhone,accountEnabled&$top=999";
      const users:any[]=[];
      let pages=0;

      while(next && pages<25) {
        const json=await graphRequest(tenantId,next);
        users.push(...(json?.value ?? []));
        next=json?.["@odata.nextLink"] || undefined;
        pages+=1;
      }

      if(users.length) {
        const rows=users.map((u:any)=>({
          tenant_id:tenantId,
          microsoft_user_id:u.id,
          display_name:u.displayName || u.userPrincipalName || u.mail || "Microsoft 365 user",
          given_name:u.givenName || null,
          surname:u.surname || null,
          mail:u.mail || null,
          user_principal_name:u.userPrincipalName || null,
          job_title:u.jobTitle || null,
          department:u.department || null,
          office_location:u.officeLocation || null,
          business_phones:Array.isArray(u.businessPhones)?u.businessPhones:[],
          mobile_phone:u.mobilePhone || null,
          account_enabled:typeof u.accountEnabled==="boolean"?u.accountEnabled:null,
          synced_at:new Date().toISOString(),
        }));

        for(let i=0;i<rows.length;i+=500) {
          const {error}=await admin.from("microsoft_365_directory_users")
            .upsert(rows.slice(i,i+500),{onConflict:"tenant_id,microsoft_user_id"});
          if(error) throw new Error(error.message);
        }
      }

      await admin.from("microsoft_365_connections").update({
        last_sync_at:new Date().toISOString(),
        last_sync_status:"success",
        directory_user_count:users.length,
        last_error:null,
        updated_at:new Date().toISOString(),
      }).eq("tenant_id",tenantId);

      return {count:users.length,pages,started_at:startedAt};
    } catch(error:any) {
      await admin.from("microsoft_365_connections").update({
        last_sync_at:new Date().toISOString(),
        last_sync_status:"failed",
        last_error:error?.message ?? "Directory sync failed",
        updated_at:new Date().toISOString(),
      }).eq("tenant_id",tenantId);
      throw error;
    }
  });

export const sendMicrosoft365TestEmail=createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .inputValidator((input)=>z.object({
    to:z.string().email(),
  }).parse(input))
  .handler(async({data,context})=>{
    const tenantId=await requireTenantAdmin(context.userId);
    await assertApiAddOnEnabled(tenantId);
    await graphRequest(tenantId,"/me/sendMail",{
      method:"POST",
      body:JSON.stringify({
        message:{
          subject:"AssetFlow 360 Microsoft 365 connection test",
          body:{
            contentType:"HTML",
            content:"<p>Your AssetFlow 360 workspace is successfully connected to Microsoft 365.</p><p>This confirms Microsoft Graph email delivery is working.</p>",
          },
          toRecipients:[{emailAddress:{address:data.to}}],
        },
        saveToSentItems:true,
      }),
    });
    return {ok:true};
  });

export const disconnectMicrosoft365=createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .handler(async({context})=>{
    const tenantId=await requireTenantAdmin(context.userId);
    await assertApiAddOnEnabled(tenantId);
    const {error}=await admin.from("microsoft_365_connections").update({
      refresh_token_ciphertext:null,
      status:"disconnected",
      last_error:null,
      updated_at:new Date().toISOString(),
    }).eq("tenant_id",tenantId);
    if(error) throw new Error(error.message);
    return {ok:true};
  });
