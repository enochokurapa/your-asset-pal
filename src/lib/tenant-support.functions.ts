import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getPostgresPool, queryPostgres } from "@/lib/postgres.server";

const scopeSchema = z.enum(["diagnostics_read", "operational_support"]);
const uuid = z.string().uuid();
type Identity = { tenant_id: string | null; tenant_role: string; is_saas_admin: boolean };
type SupportRecord = {
  id: string; tenant_id: string; administrator_id: string; reason: string;
  scope: "diagnostics_read" | "operational_support";
  state: string; requested_at: string; approved_at: string | null;
  expires_at: string | null; approved_by: string | null;
};
async function identity(userId: string) {
  const [profile] = await queryPostgres<Identity>(
    "SELECT tenant_id, tenant_role, is_saas_admin FROM public.profiles WHERE id=$1 AND is_active=TRUE LIMIT 1",
    [userId],
  );
  if (!profile) throw new Error("Active account required");
  return profile;
}
async function platformAdmin(userId: string) {
  const profile = await identity(userId);
  if (!profile.is_saas_admin) throw new Error("SaaS administrator required");
  return profile;
}
async function tenantAdmin(userId: string) {
  const profile = await identity(userId);
  if (profile.tenant_role !== "tenant_admin" || !profile.tenant_id)
    throw new Error("Business administrator required");
  return profile.tenant_id;
}
async function audit(sessionId: string, tenantId: string, actorId: string, action: string, details: Record<string, unknown> = {}) {
  await queryPostgres(
    "INSERT INTO public.tenant_support_audit (support_session_id,tenant_id,actor_id,action,details) VALUES ($1,$2,$3,$4,$5::jsonb)",
    [sessionId, tenantId, actorId, action, JSON.stringify(details)],
  );
}
export const requestTenantSupport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    tenantId: uuid,
    reason: z.string().trim().min(15).max(1000),
    scope: scopeSchema,
  }).parse(input))
  .handler(async ({ context, data }) => {
    await platformAdmin(context.userId);
    const [tenant] = await queryPostgres<{id:string}>("SELECT id FROM public.tenants WHERE id=$1", [data.tenantId]);
    if (!tenant) throw new Error("Business not found");
    const [row] = await queryPostgres<SupportRecord>(
      `INSERT INTO public.tenant_support_sessions
       (tenant_id,administrator_id,reason,scope)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [data.tenantId, context.userId, data.reason, data.scope],
    );
    await audit(row.id, row.tenant_id, context.userId, "support_requested", { scope: row.scope });
    return row;
  });

export const listTenantSupport = createServerFn({method:"GET"})
  .middleware([requireSupabaseAuth])
  .handler(async ({context}) => {
    const profile = await identity(context.userId);
    if (profile.is_saas_admin) {
      return queryPostgres<SupportRecord>(`
        SELECT * FROM public.tenant_support_sessions
        WHERE administrator_id=$1 ORDER BY requested_at DESC LIMIT 100`, [context.userId]);
    }
    const tenantId = await tenantAdmin(context.userId);
    return queryPostgres<SupportRecord>(`
      SELECT * FROM public.tenant_support_sessions
      WHERE tenant_id=$1 ORDER BY requested_at DESC LIMIT 100`, [tenantId]);
  });

export const decideTenantSupport = createServerFn({ method:"POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ sessionId: uuid, approve: z.boolean() }).parse(input))
  .handler(async ({context,data}) => {
    const tenantId = await tenantAdmin(context.userId);
    // Atomic decision: only an administrator of this same tenant can approve,
    // and stale pending requests cannot be used as permanent access grants.
    const client = await getPostgresPool().connect();
    try {
      await client.query("BEGIN");
      const result = await client.query<SupportRecord>(`
        UPDATE public.tenant_support_sessions
        SET state=CASE WHEN $4 THEN 'approved' ELSE 'denied' END,
            approved_by=$3, approved_at=NOW(),
            expires_at=CASE WHEN $4 THEN NOW()+INTERVAL '15 minutes' ELSE NULL END
        WHERE id=$1 AND tenant_id=$2 AND state='pending'
          AND requested_at > NOW()-INTERVAL '24 hours'
        RETURNING *`, [data.sessionId,tenantId,context.userId,data.approve]);
      const row=result.rows[0];
      if (!row) throw new Error("Request not found or no longer eligible");
      await client.query(`INSERT INTO public.tenant_support_audit
        (support_session_id,tenant_id,actor_id,action,details)
        VALUES ($1,$2,$3,$4,$5::jsonb)`,
        [row.id,tenantId,context.userId,data.approve?"support_approved":"support_denied",
          JSON.stringify({scope:row.scope,expiresAt:row.expires_at})]);
      await client.query("COMMIT");
      return row;
    } catch(error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  });

export const revokeTenantSupport = createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({sessionId:uuid}).parse(input))
  .handler(async ({context,data}) => {
    const profile=await identity(context.userId);
    const client=await getPostgresPool().connect();
    try {
      await client.query("BEGIN");
      const result=await client.query<SupportRecord>(`
        UPDATE public.tenant_support_sessions SET state='revoked',revoked_at=NOW()
        WHERE id=$1 AND state='approved' AND
          (administrator_id=$2 OR (tenant_id=$3 AND $4::boolean))
        RETURNING *`,
        [data.sessionId,context.userId,profile.tenant_id,profile.tenant_role==="tenant_admin"]);
      const row=result.rows[0];
      if(!row) throw new Error("No active permitted session");
      await client.query(`INSERT INTO public.tenant_support_audit
        (support_session_id,tenant_id,actor_id,action)
        VALUES ($1,$2,$3,'support_revoked')`,[row.id,row.tenant_id,context.userId]);
      await client.query("COMMIT");
      return {ok:true};
    } catch(error) {await client.query("ROLLBACK");throw error;}
    finally {client.release();}
  });

async function requireActiveSupport(sessionId:string,adminId:string,requiredScope:"diagnostics_read"|"operational_support") {
  await platformAdmin(adminId);
  const [row] = await queryPostgres<SupportRecord>(`
    SELECT * FROM public.tenant_support_sessions
    WHERE id=$1 AND administrator_id=$2 AND state='approved'
      AND expires_at>NOW() AND approved_by IS NOT NULL
      AND (scope=$3 OR (scope='operational_support' AND $3='diagnostics_read'))
    LIMIT 1`,[sessionId,adminId,requiredScope]);
  if(!row) throw new Error("Support session not approved, permitted, or still active");
  return row;
}

export const readTenantSupportDiagnostics = createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .inputValidator((input)=>z.object({sessionId:uuid}).parse(input))
  .handler(async ({context,data}) => {
    // Never assume a selected tenant from the browser is authorization.
    const session=await requireActiveSupport(data.sessionId,context.userId,"diagnostics_read");
    const [tenant, assets, users, recent] = await Promise.all([
      queryPostgres<{name:string;subscription_status:string}>(
        "SELECT name,subscription_status FROM public.tenants WHERE id=$1",[session.tenant_id]),
      queryPostgres<{count:number}>(
        "SELECT COUNT(*)::int AS count FROM public.assets WHERE tenant_id=$1",[session.tenant_id]),
      queryPostgres<{count:number}>(
        "SELECT COUNT(*)::int AS count FROM public.profiles WHERE tenant_id=$1 AND is_active=TRUE",[session.tenant_id]),
      queryPostgres<{action:string;entity_type:string;created_at:string}>(`
        SELECT action,entity_type,created_at FROM public.audit_log
        WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 10`,[session.tenant_id]),
    ]);
    await audit(session.id,session.tenant_id,context.userId,"support_diagnostics_viewed");
    return { sessionId:session.id, expiresAt:session.expires_at, tenant:tenant[0],
      assetCount:assets[0]?.count??0, activeUserCount:users[0]?.count??0, recent };
  });

export const listTenantSupportAudit = createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .inputValidator((input)=>z.object({sessionId:uuid}).parse(input))
  .handler(async ({context,data}) => {
    const profile=await identity(context.userId);
    const [session]=await queryPostgres<SupportRecord>(`
      SELECT * FROM public.tenant_support_sessions WHERE id=$1
      AND (administrator_id=$2 OR (tenant_id=$3 AND $4::boolean))`,
      [data.sessionId,context.userId,profile.tenant_id,profile.tenant_role==="tenant_admin"]);
    if(!session)throw new Error("Support session not accessible");
    return queryPostgres<{actor_id:string;action:string;recorded_at:string;details:unknown}>(`
      SELECT actor_id,action,recorded_at,details FROM public.tenant_support_audit
      WHERE support_session_id=$1 ORDER BY recorded_at DESC LIMIT 200`,[session.id]);
  });
