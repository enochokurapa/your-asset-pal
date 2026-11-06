import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { queryPostgres } from "@/lib/postgres.server";

type CountRow = {total:number};
type ActivityDay = {day:string;events:number};
type ActivityCategory = {entity_type:string;action:string;events:number};
type RecentAction = {created_at:string;entity_type:string;action:string};
type TenantConfig = {verification_due_reminders_enabled:boolean;recipient_count:number;last_verification_run_at:string|null};
export type TenantOperationsData = {
  name:string;
  metrics:{
    assets:number; assetsAdded30Days:number; movements30Days:number;
    activity30Days:number; activeActors30Days:number; pendingApprovals:number;
    overdueVerifications:number; upcomingVerifications:number;
    failedPayments30Days:number; stalePendingPayments:number;
  };
  daily:ActivityDay[];
  categories:ActivityCategory[];
  recent:RecentAction[];
  verificationEmails:{enabled:boolean;recipients:number;lastCheckedAt:string|null}|null;
  refreshedAt:string;
};

async function getActiveProfile(userId:string) {
  const [profile]=await queryPostgres<{
    tenant_id:string|null; tenant_role:string; is_saas_admin:boolean;
  }>(`SELECT tenant_id,tenant_role,is_saas_admin FROM public.profiles
     WHERE id=$1 AND is_active=TRUE LIMIT 1`,[userId]);
  if (!profile) throw new Error("Active account required");
  return profile;
}
async function requireTenantAdministrator(userId:string) {
  const profile=await getActiveProfile(userId);
  if(!profile.tenant_id || profile.tenant_role!=="tenant_admin")
    throw new Error("Organisation administrator access required");
  return profile.tenant_id;
}
async function requirePlatformAdministrator(userId:string) {
  const profile=await getActiveProfile(userId);
  if(!profile.is_saas_admin)throw new Error("SaaS administrator access required");
}
const one=async(query:string,tenantId:string):Promise<number>=>{
  const [row]=await queryPostgres<CountRow>(query,[tenantId]);
  return Number(row?.total||0);
};
export const getTenantOperationsAnalytics=createServerFn({method:"GET"})
  .middleware([requireSupabaseAuth])
  .handler(async ({context}):Promise<TenantOperationsData>=>{
    const tenantId=await requireTenantAdministrator(context.userId);
    const [
      name,assets,assetsAdded30Days,movements30Days,activity30Days,
      activeActors30Days,pendingApprovals,overdueVerifications,upcomingVerifications,
      failedPayments30Days,stalePendingPayments,daily,categories,recent,settings,
    ]=await Promise.all([
      queryPostgres<{name:string}>("SELECT name FROM public.tenants WHERE id=$1 LIMIT 1",[tenantId]),
      one("SELECT COUNT(*)::int total FROM public.assets WHERE tenant_id=$1",tenantId),
      one("SELECT COUNT(*)::int total FROM public.assets WHERE tenant_id=$1 AND created_at>=NOW()-INTERVAL '30 days'",tenantId),
      one("SELECT COUNT(*)::int total FROM public.asset_movements WHERE tenant_id=$1 AND created_at>=NOW()-INTERVAL '30 days'",tenantId),
      one("SELECT COUNT(*)::int total FROM public.audit_log WHERE tenant_id=$1 AND created_at>=NOW()-INTERVAL '30 days'",tenantId),
      one("SELECT COUNT(DISTINCT actor_user_id)::int total FROM public.audit_log WHERE tenant_id=$1 AND actor_user_id IS NOT NULL AND created_at>=NOW()-INTERVAL '30 days'",tenantId),
      one("SELECT COUNT(*)::int total FROM public.approval_requests WHERE tenant_id=$1 AND status='pending'",tenantId),
      one("SELECT COUNT(*)::int total FROM public.asset_verification_schedule WHERE tenant_id=$1 AND verification_state='overdue'",tenantId),
      one("SELECT COUNT(*)::int total FROM public.asset_verification_schedule WHERE tenant_id=$1 AND verification_state='due_soon'",tenantId),
      one("SELECT COUNT(*)::int total FROM public.billing_transactions WHERE tenant_id=$1 AND status='failed' AND created_at>=NOW()-INTERVAL '30 days'",tenantId),
      one("SELECT COUNT(*)::int total FROM public.billing_transactions WHERE tenant_id=$1 AND status='pending' AND created_at<NOW()-INTERVAL '1 hour'",tenantId),
      queryPostgres<ActivityDay>(`SELECT TO_CHAR(created_at::date,'YYYY-MM-DD') AS day, COUNT(*)::int AS events
        FROM public.audit_log WHERE tenant_id=$1 AND created_at>=NOW()-INTERVAL '14 days'
        GROUP BY created_at::date ORDER BY created_at::date`,[tenantId]),
      queryPostgres<ActivityCategory>(`SELECT entity_type,action,COUNT(*)::int AS events
        FROM public.audit_log WHERE tenant_id=$1 AND created_at>=NOW()-INTERVAL '30 days'
        GROUP BY entity_type,action ORDER BY events DESC LIMIT 12`,[tenantId]),
      queryPostgres<RecentAction>(`SELECT created_at,entity_type,action
        FROM public.audit_log WHERE tenant_id=$1
        ORDER BY created_at DESC LIMIT 12`,[tenantId]),
      queryPostgres<TenantConfig>(`SELECT verification_due_reminders_enabled,
        cardinality(verification_notification_emails)::int AS recipient_count,
        last_verification_run_at FROM public.tenant_automation_settings
        WHERE tenant_id=$1 LIMIT 1`,[tenantId]),
    ]);
    return {
      name:name[0]?.name||"Your organisation",
      metrics:{assets,assetsAdded30Days,movements30Days,activity30Days,
        activeActors30Days,pendingApprovals,overdueVerifications,upcomingVerifications,
        failedPayments30Days,stalePendingPayments},
      daily,categories,recent,
      verificationEmails:settings[0]?{
        enabled:settings[0].verification_due_reminders_enabled,
        recipients:settings[0].recipient_count,
        lastCheckedAt:settings[0].last_verification_run_at,
      }:null,
      refreshedAt:new Date().toISOString(),
    };
  });

export type PlatformOrganisationRow={
  id:string;name:string;subscription_status:string;
  assets:number;active_users:number;events30Days:number;overdue_verifications:number;
};
export const getPlatformOperationsAnalytics=createServerFn({method:"GET"})
  .middleware([requireSupabaseAuth])
  .handler(async ({context})=>{
    await requirePlatformAdministrator(context.userId);
    const organisations=await queryPostgres<PlatformOrganisationRow>(`
      SELECT t.id,t.name,t.subscription_status,
        COALESCE(a.assets,0)::int AS assets,
        COALESCE(u.active_users,0)::int AS active_users,
        COALESCE(e.events30Days,0)::int AS "events30Days",
        COALESCE(v.overdue_verifications,0)::int AS overdue_verifications
      FROM public.tenants t
      LEFT JOIN (SELECT tenant_id,COUNT(*) AS assets FROM public.assets GROUP BY tenant_id) a ON a.tenant_id=t.id
      LEFT JOIN (SELECT tenant_id,COUNT(*) AS active_users FROM public.profiles WHERE is_active=TRUE GROUP BY tenant_id) u ON u.tenant_id=t.id
      LEFT JOIN (SELECT tenant_id,COUNT(*) AS events30Days FROM public.audit_log
                 WHERE created_at>=NOW()-INTERVAL '30 days' GROUP BY tenant_id) e ON e.tenant_id=t.id
      LEFT JOIN (SELECT tenant_id,COUNT(*) AS overdue_verifications
                 FROM public.asset_verification_schedule WHERE verification_state='overdue'
                 GROUP BY tenant_id) v ON v.tenant_id=t.id
      ORDER BY t.created_at DESC LIMIT 200
    `);
    return {organisations,refreshedAt:new Date().toISOString(),limitedTo:200};
  });
