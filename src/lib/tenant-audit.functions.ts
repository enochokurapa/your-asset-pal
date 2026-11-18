import {createServerFn} from "@tanstack/react-start";
import {requireSupabaseAuth} from "@/integrations/supabase/auth-middleware";
import {queryPostgres} from "@/lib/postgres.server";

export type TenantSecurityAuditEvent={
 id:string;entity_type:string;entity_id:string|null;action:string;
 actor_user_id:string|null;details:Record<string,unknown>;
 created_at:string;cleared_at:null;source:string;
};
type Viewer={tenant_id:string|null;tenant_role:string;is_saas_admin:boolean;is_active:boolean;may_view:boolean};

/**
 * Real sign-in events originate from GoTrue auth.audit_log_entries, not the browser.
 * Return only a vetted subset of the auth payload: never expose OTPs, credentials,
 * access tokens, recovery links, or raw authentication JSON.
 */
export const getTenantSecurityAudit=createServerFn({method:"GET"})
 .middleware([requireSupabaseAuth])
 .handler(async({context}):Promise<TenantSecurityAuditEvent[]>=>{
  const [viewer]=await queryPostgres<Viewer>(
   "SELECT p.tenant_id,p.tenant_role,p.is_saas_admin,p.is_active, "+
   "(p.tenant_role='tenant_admin' OR EXISTS(SELECT 1 FROM public.user_roles r "+
   "WHERE r.user_id=p.id AND r.role IN ('admin','security')) OR "+
   "EXISTS(SELECT 1 FROM public.user_action_rights a WHERE a.user_id=p.id "+
   "AND a.action_kind='manage_audit_log')) AS may_view "+
   "FROM public.profiles p WHERE p.id=$1 LIMIT 1",[context.userId]);
  if(!viewer?.is_active)throw Error("Active account required");
  const tenantId=context.supportTenantId||viewer.tenant_id;
  if(!tenantId)throw Error("Open an authorized business workspace to view its audit history");
  if(context.supportTenantId){
   if(!viewer.is_saas_admin)throw Error("Verified SaaS administrator access required");
  }else if(!viewer.may_view)throw Error("Audit history requires administrator or audit permission");

  const [auth,security,access,support]=await Promise.all([
   queryPostgres<{id:string;created_at:string;action:string;actor_user_id:string;ip_address:string|null;provider:string|null}>(
    "SELECT a.id::text,a.created_at::text,a.payload->>'action' AS action,"+
    "p.id::text AS actor_user_id,NULLIF(left(a.ip_address,80),'') AS ip_address,"+
    "left(COALESCE(a.payload->'traits'->>'provider',''),40) AS provider "+
    "FROM auth.audit_log_entries a JOIN public.profiles p ON p.id::text=a.payload->>'actor_id' "+
    "WHERE p.tenant_id=$1 AND a.created_at>=NOW()-INTERVAL '180 days' "+
    "AND a.payload->>'action' IN ('login','logout','verification_attempted','challenge_created',"+
    "'user_updated_password','token_revoked','user_recovery_requested') "+
    "ORDER BY a.created_at DESC LIMIT 500",[tenantId]),
   queryPostgres<{id:string;recorded_at:string;actor_id:string;action:string}>(
    "SELECT id::text,recorded_at::text,actor_id::text,action FROM public.platform_tenant_security_events "+
    "WHERE tenant_id=$1 ORDER BY recorded_at DESC LIMIT 250",[tenantId]),
   queryPostgres<{id:string;recorded_at:string;actor_id:string;action:string}>(
    "SELECT id::text,recorded_at::text,actor_id::text,action FROM public.platform_tenant_access_audit "+
    "WHERE tenant_id=$1 ORDER BY recorded_at DESC LIMIT 200",[tenantId]),
   queryPostgres<{id:string;recorded_at:string;actor_id:string;action:string}>(
    "SELECT id::text,recorded_at::text,actor_id::text,action FROM public.tenant_support_audit "+
    "WHERE tenant_id=$1 ORDER BY recorded_at DESC LIMIT 200",[tenantId]),
  ]);
  const native=auth.map((item):TenantSecurityAuditEvent=>({
   id:"auth-"+item.id,entity_type:"authentication",entity_id:null,
   action:({
    login:"login_success",logout:"logout",verification_attempted:"mfa_attempted",
    challenge_created:"mfa_challenge_created",
    user_updated_password:"password_changed",token_revoked:"session_revoked",
    user_recovery_requested:"password_recovery_requested",
   } as Record<string,string>)[item.action]||item.action,
   actor_user_id:item.actor_user_id,source:"auth_service",
   details:{source:"Verified authentication service",...(item.provider?{method:item.provider}:{}),
            ...(item.ip_address?{ip_address:item.ip_address}:{})},
   created_at:item.created_at,cleared_at:null,
  }));
  const other=[
   {rows:security,source:"tenant_security",entity_type:"user_security"},
   {rows:access,source:"platform_support",entity_type:"business_support"},
   {rows:support,source:"tenant_support",entity_type:"business_support"},
  ].flatMap(({rows,source,entity_type})=>rows.map((item):TenantSecurityAuditEvent=>({
   id:source+"-"+item.id,
   entity_type,entity_id:null,action:item.action,
   actor_user_id:item.actor_id,
   details:{source:source.replace(/_/g," ")},
   source,created_at:item.recorded_at,cleared_at:null,
  })));
  return [...native,...other]
    .sort((a,b)=>b.created_at.localeCompare(a.created_at))
    .slice(0,900);
 });
