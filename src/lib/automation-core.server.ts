import { supabaseAdmin } from "@/integrations/supabase/client.server";

const admin = supabaseAdmin as any;
let schedulerStarted = false;
let running = false;

type AutomationSettings = {
  tenant_id: string;
  approval_reminders_enabled: boolean;
  approval_after_hours: number;
  gate_pass_return_reminders_enabled: boolean;
  gate_pass_days_after_due: number;
  depreciation_due_reminders_enabled: boolean;
  verification_due_reminders_enabled: boolean;
  verification_interval_days: number;
  last_approval_run_at: string | null;
  last_gate_pass_run_at: string | null;
  last_depreciation_run_at: string | null;
  last_verification_run_at: string | null;
};

function hoursSince(value: string | null) {
  if (!value) return Number.POSITIVE_INFINITY;
  return (Date.now() - new Date(value).getTime()) / 3_600_000;
}

async function recipientsForTenant(tenantId: string) {
  const { data: profiles, error } = await admin
    .from("profiles")
    .select("id,tenant_role,is_active")
    .eq("tenant_id", tenantId)
    .eq("is_active", true);
  if (error) throw error;

  const ids = (profiles ?? []).map((p: any) => p.id);
  if (!ids.length) return [] as string[];

  const { data: roles, error: rolesError } = await admin
    .from("user_roles")
    .select("user_id,role")
    .in("user_id", ids);
  if (rolesError) throw rolesError;

  const privileged = new Set(
    (roles ?? [])
      .filter((r: any) => r.role === "admin" || r.role === "manager")
      .map((r: any) => r.user_id),
  );
  for (const p of profiles ?? []) {
    if ((p as any).tenant_role === "tenant_admin") privileged.add((p as any).id);
  }
  return [...privileged];
}

async function upsertNotification(input: {
  tenantId: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  entityType: string;
  entityId: string;
  requiresAction?: boolean;
}) {
  const { error } = await admin.from("notifications").upsert({
    tenant_id: input.tenantId,
    user_id: input.userId,
    type: input.type,
    title: input.title,
    body: input.body,
    entity_type: input.entityType,
    entity_id: input.entityId,
    requires_action: input.requiresAction ?? false,
    beep: false,
    read_at: null,
    created_at: new Date().toISOString(),
  }, { onConflict: "user_id,type,entity_type,entity_id" });
  if (error) throw error;
}

async function runApprovalReminders(s: AutomationSettings, users: string[]) {
  if (!s.approval_reminders_enabled || hoursSince(s.last_approval_run_at) < 1) return;
  const cutoff = new Date(Date.now() - s.approval_after_hours * 3_600_000).toISOString();
  const { data, error } = await admin.from("approval_requests")
    .select("id,kind,created_at")
    .eq("tenant_id", s.tenant_id)
    .eq("status", "pending")
    .lt("created_at", cutoff);
  if (error) throw error;

  for (const req of data ?? []) {
    for (const userId of users) {
      await upsertNotification({
        tenantId: s.tenant_id,
        userId,
        type: "approval_reminder",
        title: `Approval pending: ${(req as any).kind}`,
        body: `A ${(req as any).kind} request has been pending for more than ${s.approval_after_hours} hours.`,
        entityType: "approval_requests",
        entityId: (req as any).id,
        requiresAction: true,
      });
    }
  }

  await admin.from("tenant_automation_settings")
    .update({ last_approval_run_at: new Date().toISOString() })
    .eq("tenant_id", s.tenant_id);
}

async function runGatePassReminders(s: AutomationSettings, users: string[]) {
  if (!s.gate_pass_return_reminders_enabled || hoursSince(s.last_gate_pass_run_at) < 24) return;
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - s.gate_pass_days_after_due);
  const cutoff = date.toISOString().slice(0, 10);

  const { data, error } = await admin.from("gate_passes")
    .select("id,pass_number,expected_return_date,destination")
    .eq("tenant_id", s.tenant_id)
    .is("returned_at", null)
    .not("expected_return_date", "is", null)
    .lte("expected_return_date", cutoff);
  if (error) throw error;

  for (const pass of data ?? []) {
    for (const userId of users) {
      await upsertNotification({
        tenantId: s.tenant_id,
        userId,
        type: "gate_pass_return_overdue",
        title: `Gate pass return overdue: ${(pass as any).pass_number || "Asset"}`,
        body: `Expected return ${(pass as any).expected_return_date}${(pass as any).destination ? ` from ${(pass as any).destination}` : ""}.`,
        entityType: "gate_passes",
        entityId: (pass as any).id,
        requiresAction: true,
      });
    }
  }

  await admin.from("tenant_automation_settings")
    .update({ last_gate_pass_run_at: new Date().toISOString() })
    .eq("tenant_id", s.tenant_id);
}

function isDepreciationDue(asset: any) {
  if (!asset.depreciation_method || !asset.purchase_value) return false;
  const anchor = asset.last_depreciation_date || asset.depreciation_start_date || asset.purchase_date;
  if (!anchor) return false;
  const days = (Date.now() - new Date(anchor).getTime()) / 86_400_000;
  if (asset.depreciation_frequency === "annually") return days >= 365;
  if (asset.depreciation_frequency === "quarterly") return days >= 90;
  return days >= 28;
}

async function runDepreciationDueReminders(s: AutomationSettings, users: string[]) {
  if (!s.depreciation_due_reminders_enabled || hoursSince(s.last_depreciation_run_at) < 24) return;

  const { data, error } = await admin.from("assets")
    .select("id,depreciation_method,depreciation_frequency,purchase_value,purchase_date,depreciation_start_date,last_depreciation_date")
    .eq("tenant_id", s.tenant_id)
    .not("depreciation_method", "is", null);
  if (error) throw error;

  const due = (data ?? []).filter(isDepreciationDue);
  if (due.length) {
    for (const userId of users) {
      await upsertNotification({
        tenantId: s.tenant_id,
        userId,
        type: "depreciation_due",
        title: "Depreciation review due",
        body: `${due.length} asset${due.length === 1 ? "" : "s"} may require a depreciation run.`,
        entityType: "tenants",
        entityId: s.tenant_id,
        requiresAction: true,
      });
    }
  }

  await admin.from("tenant_automation_settings")
    .update({ last_depreciation_run_at: new Date().toISOString() })
    .eq("tenant_id", s.tenant_id);
}

async function runVerificationDueReminders(s: AutomationSettings, users: string[]) {
  if (!s.verification_due_reminders_enabled || hoursSince(s.last_verification_run_at) < 24) return;
  const cutoff = new Date(Date.now() - s.verification_interval_days * 86_400_000).toISOString();

  const { data: assets, error } = await admin.from("assets")
    .select("id")
    .eq("tenant_id", s.tenant_id)
    .neq("status", "disposed")
    .neq("status", "retired");
  if (error) throw error;

  const { data: verifications, error: verificationError } = await admin.from("asset_verifications")
    .select("asset_id,verified_at")
    .eq("tenant_id", s.tenant_id)
    .gte("verified_at", cutoff);
  if (verificationError) throw verificationError;

  const current = new Set((verifications ?? []).map((v: any) => v.asset_id));
  const dueCount = (assets ?? []).filter((a: any) => !current.has(a.id)).length;

  if (dueCount) {
    for (const userId of users) {
      await upsertNotification({
        tenantId: s.tenant_id,
        userId,
        type: "verification_due",
        title: "Asset verification due",
        body: `${dueCount} asset${dueCount === 1 ? "" : "s"} have not been verified within the last ${s.verification_interval_days} days.`,
        entityType: "tenants",
        entityId: s.tenant_id,
        requiresAction: true,
      });
    }
  }

  await admin.from("tenant_automation_settings")
    .update({ last_verification_run_at: new Date().toISOString() })
    .eq("tenant_id", s.tenant_id);
}

async function automationTick() {
  if (running) return;
  running = true;
  try {
    const { data, error } = await admin.from("tenant_automation_settings").select("*");
    if (error) throw error;

    for (const row of (data ?? []) as AutomationSettings[]) {
      const users = await recipientsForTenant(row.tenant_id);
      if (!users.length) continue;
      await runApprovalReminders(row, users);
      await runGatePassReminders(row, users);
      await runDepreciationDueReminders(row, users);
      await runVerificationDueReminders(row, users);
    }
  } finally {
    running = false;
  }
}

export function startTenantAutomationScheduler() {
  if (schedulerStarted || process.env.TENANT_AUTOMATION_DISABLED === "true") return;
  schedulerStarted = true;

  const run = () => automationTick().catch((error) =>
    console.error("[Automation] Scheduled tenant automation check failed", error),
  );

  const initial = setTimeout(run, 45_000);
  const recurring = setInterval(run, 15 * 60_000);
  initial.unref?.();
  recurring.unref?.();
}
