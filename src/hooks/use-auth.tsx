import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";

export type AppRole = "admin" | "manager" | "staff" | "security";
export type ModuleKey =
  | "dashboard" | "assets" | "categories" | "locations" | "branches"
  | "users" | "reports" | "audit" | "depreciation" | "gate_pass" | "settings" | "verification";
export type ApprovalKind =
  | "movement" | "retirement" | "disposal" | "reactivation" | "set_for_disposal" | "maintenance" | "deletion" | "attachment_deletion";
export type ActionKind =
  | "add_asset" | "edit_asset" | "edit_location"
  | "initiate_movement" | "initiate_retirement" | "initiate_disposal" | "initiate_maintenance"
  | "manage_depreciation" | "run_depreciation" | "override_depreciation"
  | "request_gate_pass" | "approve_gate_pass" | "verify_gate_pass"
  | "view_gate_pass_reports" | "export_gate_pass_reports"
  | "manage_document_templates"
  | "request_asset_deletion" | "approve_asset_deletion"
  | "request_attachment_deletion" | "approve_attachment_deletion"
  | "perform_verification" | "view_verification_reports"
  | "approve_own_request"
  | "manage_audit_log";

export type SubscriptionStatus = "trial" | "active" | "expired" | "suspended" | "unknown";

export const ALL_MODULES: ModuleKey[] = [
  "dashboard", "assets", "categories", "locations", "branches", "users", "reports", "audit", "depreciation", "gate_pass", "verification", "settings",
];
export const ALL_APPROVAL_KINDS: ApprovalKind[] = [
  "movement", "retirement", "disposal", "reactivation", "set_for_disposal", "maintenance", "deletion", "attachment_deletion",
];
export const ALL_ACTION_KINDS: ActionKind[] = [
  "add_asset", "edit_asset", "edit_location",
  "initiate_movement", "initiate_retirement", "initiate_disposal", "initiate_maintenance",
  "manage_depreciation", "run_depreciation", "override_depreciation",
  "request_gate_pass", "approve_gate_pass", "verify_gate_pass",
  "view_gate_pass_reports", "export_gate_pass_reports",
  "manage_document_templates",
  "request_asset_deletion", "approve_asset_deletion",
  "request_attachment_deletion", "approve_attachment_deletion",
  "perform_verification", "view_verification_reports",
  "approve_own_request", "manage_audit_log",
];

export const DEFAULT_NEW_USER_MODULES: ModuleKey[] = ["dashboard", "assets"];

interface AuthCtx {
  user: User | null;
  session: Session | null;
  roles: AppRole[];
  permissions: Set<ModuleKey>;
  approvalRights: Set<ApprovalKind>;
  actionRights: Set<ActionKind>;
  branchScope: Set<string> | null;
  loading: boolean;
  mustChangePassword: boolean;
  isActive: boolean;
  isAdmin: boolean;
  isTenantAdmin: boolean;
  isSaasAdmin: boolean;
  isManager: boolean;
  tenantId: string | null;
  tenantName: string | null;
  subscriptionStatus: SubscriptionStatus;
  trialEndsAt: string | null;
  subscriptionEndsAt: string | null;
  enabledModules: Set<ModuleKey>;
  paidOnlyModules: Set<ModuleKey>;
  canExportReports: boolean;
  canUseCustomDomain: boolean;
  canWrite: boolean;
  canView: (m: ModuleKey) => boolean;
  isPaidFeature: (m: ModuleKey) => boolean;
  canApprove: (k: ApprovalKind) => boolean;
  canDo: (k: ActionKind) => boolean;
  canSeeBranch: (branchId: string | null | undefined) => boolean;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [permissions, setPermissions] = useState<Set<ModuleKey>>(new Set());
  const [approvalRights, setApprovalRights] = useState<Set<ApprovalKind>>(new Set());
  const [actionRights, setActionRights] = useState<Set<ActionKind>>(new Set());
  const [branchScope, setBranchScope] = useState<Set<string> | null>(null);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [isSaasAdmin, setIsSaasAdmin] = useState(false);
  const [tenantRole, setTenantRole] = useState<"tenant_admin" | "member">("member");
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [tenantName, setTenantName] = useState<string | null>(null);
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatus>("unknown");
  const [trialEndsAt, setTrialEndsAt] = useState<string | null>(null);
  const [subscriptionEndsAt, setSubscriptionEndsAt] = useState<string | null>(null);
  const [enabledModules, setEnabledModules] = useState<Set<ModuleKey>>(new Set(ALL_MODULES));
  const [paidOnlyModules, setPaidOnlyModules] = useState<Set<ModuleKey>>(new Set());
  const [loading, setLoading] = useState(true);

  const resetMetadata = () => {
    setRoles([]); setPermissions(new Set()); setApprovalRights(new Set());
    setActionRights(new Set()); setBranchScope(null); setMustChangePassword(false);
    setIsActive(true); setIsSaasAdmin(false); setTenantRole("member");
    setTenantId(null); setTenantName(null); setSubscriptionStatus("unknown");
    setTrialEndsAt(null); setSubscriptionEndsAt(null); setEnabledModules(new Set(ALL_MODULES));
    setPaidOnlyModules(new Set());
  };

  const loadFor = async (uid: string) => {
    try {
      const [rRes, pRes, aRes, actRes, brRes, profRes] = await Promise.allSettled([
        supabase.from("user_roles").select("role").eq("user_id", uid),
        supabase.from("user_permissions" as any).select("module,can_view").eq("user_id", uid),
        supabase.from("user_approval_rights" as any).select("approval_kind").eq("user_id", uid),
        supabase.from("user_action_rights" as any).select("action_kind").eq("user_id", uid),
        supabase.from("user_branch_access" as any).select("branch_id").eq("user_id", uid),
        (supabase as any).from("profiles").select("must_change_password,is_active,tenant_id,tenant_role,is_saas_admin").eq("id", uid).maybeSingle(),
      ]);

      const r = rRes.status === "fulfilled" ? rRes.value.data : null;
      const p = pRes.status === "fulfilled" ? pRes.value.data : null;
      const a = aRes.status === "fulfilled" ? aRes.value.data : null;
      const act = actRes.status === "fulfilled" ? actRes.value.data : null;
      const br = brRes.status === "fulfilled" ? brRes.value.data : null;
      const prof: any = profRes.status === "fulfilled" ? profRes.value.data : null;
      const rs = (r ?? []).map((x: any) => x.role as AppRole);

      setRoles(rs);
      setPermissions(new Set((p ?? []).filter((x: any) => x.can_view).map((x: any) => x.module as ModuleKey)));
      setApprovalRights(new Set((a ?? []).map((x: any) => x.approval_kind as ApprovalKind)));
      setActionRights(new Set((act ?? []).map((x: any) => x.action_kind as ActionKind)));
      const brList = (br ?? []).map((x: any) => x.branch_id as string);
      setBranchScope(rs.includes("admin") || brList.length === 0 ? null : new Set(brList));
      setMustChangePassword(Boolean(prof?.must_change_password));
      setIsActive(prof?.is_active !== false);
      setIsSaasAdmin(Boolean(prof?.is_saas_admin));
      setTenantRole(prof?.tenant_role === "tenant_admin" ? "tenant_admin" : "member");
      setTenantId(prof?.tenant_id ?? null);

      if (prof?.tenant_id) {
        const [{ data: tenant }, { data: modules }, { data: overrides }] = await Promise.all([
          (supabase as any).from("tenants").select("name,subscription_status,trial_ends_at,subscription_ends_at").eq("id", prof.tenant_id).maybeSingle(),
          (supabase as any).from("saas_modules").select("module_key,globally_enabled,trial_enabled,paid_enabled").order("sort_order"),
          (supabase as any).from("tenant_module_overrides").select("module_key,enabled").eq("tenant_id", prof.tenant_id),
        ]);
        if (tenant) {
          setTenantName(tenant.name ?? null);
          setTrialEndsAt(tenant.trial_ends_at ?? null);
          setSubscriptionEndsAt(tenant.subscription_ends_at ?? null);

          let effective: SubscriptionStatus = tenant.subscription_status ?? "unknown";
          const now = Date.now();
          if (effective === "trial" && tenant.trial_ends_at && new Date(tenant.trial_ends_at).getTime() <= now) effective = "expired";
          if (effective === "active" && tenant.subscription_ends_at && new Date(tenant.subscription_ends_at).getTime() <= now) effective = "expired";
          setSubscriptionStatus(effective);

          const paid = effective === "active";
          const overrideMap = new Map((overrides ?? []).map((x: any) => [x.module_key, x.enabled]));
          if (modules?.length) {
            const eligible = modules.filter((m: any) => {
              if (!m.globally_enabled) return false;
              return overrideMap.has(m.module_key) ? overrideMap.get(m.module_key) !== false : true;
            });
            const allowed = eligible.filter((m: any) => paid ? !!m.paid_enabled : !!m.trial_enabled)
              .map((m: any) => m.module_key as ModuleKey);
            const lockedPaid = effective === "trial"
              ? eligible.filter((m: any) => !m.trial_enabled && !!m.paid_enabled).map((m: any) => m.module_key as ModuleKey)
              : [];
            setEnabledModules(new Set(allowed));
            setPaidOnlyModules(new Set(lockedPaid));
          }
        }
      }
    } catch (err) {
      console.error("[AuthProvider] Failed to load user auth metadata:", err);
    }
  };

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (s?.user) setTimeout(() => loadFor(s.user.id), 0);
      else resetMetadata();
    });
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      if (data.session?.user) await loadFor(data.session.user.id);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const isAdmin = roles.includes("admin");
  const isManager = roles.includes("manager");
  // SaaS administration is an additional platform privilege. It must not remove
  // the user's normal tenant role or RBAC permissions.
  const isTenantAdmin = tenantRole === "tenant_admin" || isAdmin;
  const subscriptionUsable = subscriptionStatus === "active" || subscriptionStatus === "trial" || subscriptionStatus === "unknown";
  const hasUserModuleAccess = (m: ModuleKey) => isAdmin || permissions.has(m);

  const canView = (m: ModuleKey) => subscriptionUsable && enabledModules.has(m) && hasUserModuleAccess(m);
  const isPaidFeature = (m: ModuleKey) => subscriptionStatus === "trial" && paidOnlyModules.has(m) && hasUserModuleAccess(m);
  const canApprove = (k: ApprovalKind) => subscriptionUsable && (isAdmin || approvalRights.has(k));
  const canDo = (k: ActionKind) => subscriptionUsable && (isAdmin || isManager || actionRights.has(k));
  const canSeeBranch = (branchId: string | null | undefined) => {
    if (!branchScope) return true;
    if (!branchId) return true;
    return branchScope.has(branchId);
  };

  const value: AuthCtx = {
    user: session?.user ?? null, session, roles, permissions, approvalRights, actionRights, branchScope,
    loading, mustChangePassword, isActive, isAdmin, isTenantAdmin, isSaasAdmin, isManager,
    tenantId, tenantName, subscriptionStatus, trialEndsAt, subscriptionEndsAt, enabledModules, paidOnlyModules,
    canExportReports: subscriptionStatus === "active",
    canUseCustomDomain: subscriptionStatus === "active",
    canWrite: subscriptionUsable && (isAdmin || isManager),
    canView, isPaidFeature, canApprove, canDo, canSeeBranch,
    signOut: async () => {
      try { await supabase.auth.signOut(); }
      catch (e) { console.error("[signOut] error:", e); }
      finally {
        setSession(null); resetMetadata();
        try { localStorage.clear(); sessionStorage.clear(); } catch {}
        window.location.href = "/login";
      }
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be inside AuthProvider");
  return c;
}
