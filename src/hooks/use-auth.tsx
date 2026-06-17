import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";

export type AppRole = "admin" | "manager" | "staff" | "security";
export type ModuleKey =
  | "dashboard" | "assets" | "categories" | "locations" | "branches"
  | "users" | "reports" | "audit" | "depreciation" | "gate_pass";
export type ApprovalKind =
  | "movement" | "retirement" | "disposal" | "reactivation" | "set_for_disposal" | "maintenance";
export type ActionKind =
  | "add_asset" | "edit_asset" | "edit_location"
  | "initiate_movement" | "initiate_retirement" | "initiate_disposal" | "initiate_maintenance"
  | "manage_depreciation" | "run_depreciation" | "override_depreciation"
  | "request_gate_pass" | "approve_gate_pass" | "verify_gate_pass"
  | "view_gate_pass_reports" | "export_gate_pass_reports";

export const ALL_MODULES: ModuleKey[] = [
  "dashboard", "assets", "categories", "locations", "branches", "users", "reports", "audit", "depreciation", "gate_pass",
];
export const ALL_APPROVAL_KINDS: ApprovalKind[] = [
  "movement", "retirement", "disposal", "reactivation", "set_for_disposal", "maintenance",
];
export const ALL_ACTION_KINDS: ActionKind[] = [
  "add_asset", "edit_asset", "edit_location",
  "initiate_movement", "initiate_retirement", "initiate_disposal", "initiate_maintenance",
  "manage_depreciation", "run_depreciation", "override_depreciation",
  "request_gate_pass", "approve_gate_pass", "verify_gate_pass",
  "view_gate_pass_reports", "export_gate_pass_reports",
];
export const DEFAULT_NEW_USER_MODULES: ModuleKey[] = ["dashboard", "assets"];

interface AuthCtx {
  user: User | null;
  session: Session | null;
  roles: AppRole[];
  permissions: Set<ModuleKey>;
  approvalRights: Set<ApprovalKind>;
  actionRights: Set<ActionKind>;
  /** null = all branches visible; otherwise restricted allow-list */
  branchScope: Set<string> | null;
  loading: boolean;
  mustChangePassword: boolean;
  isActive: boolean;
  isAdmin: boolean;
  isManager: boolean;
  canWrite: boolean;
  canView: (m: ModuleKey) => boolean;
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
  const [loading, setLoading] = useState(true);

  const loadFor = async (uid: string) => {
    const [{ data: r }, { data: p }, { data: a }, { data: act }, { data: br }, { data: prof }] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", uid),
      supabase.from("user_permissions" as any).select("module,can_view").eq("user_id", uid),
      supabase.from("user_approval_rights" as any).select("approval_kind").eq("user_id", uid),
      supabase.from("user_action_rights" as any).select("action_kind").eq("user_id", uid),
      supabase.from("user_branch_access" as any).select("branch_id").eq("user_id", uid),
      supabase.from("profiles").select("must_change_password,is_active").eq("id", uid).maybeSingle(),
    ]);
    const rs = (r ?? []).map((x: any) => x.role as AppRole);
    setRoles(rs);
    setPermissions(new Set((p ?? []).filter((x: any) => x.can_view).map((x: any) => x.module as ModuleKey)));
    setApprovalRights(new Set((a ?? []).map((x: any) => x.approval_kind as ApprovalKind)));
    setActionRights(new Set((act ?? []).map((x: any) => x.action_kind as ActionKind)));
    const brList = (br ?? []).map((x: any) => x.branch_id as string);
    // Admin always sees every branch; empty list also means "all".
    setBranchScope(rs.includes("admin") || brList.length === 0 ? null : new Set(brList));
    setMustChangePassword(Boolean((prof as any)?.must_change_password));
    setIsActive((prof as any)?.is_active !== false);
  };

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (s?.user) setTimeout(() => loadFor(s.user.id), 0);
      else {
        setRoles([]); setPermissions(new Set()); setApprovalRights(new Set());
        setActionRights(new Set()); setBranchScope(null);
        setMustChangePassword(false); setIsActive(true);
      }
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

  const canView = (m: ModuleKey) => isAdmin || permissions.has(m);
  const canApprove = (k: ApprovalKind) => isAdmin || approvalRights.has(k);
  const canDo = (k: ActionKind) => isAdmin || isManager || actionRights.has(k);
  const canSeeBranch = (branchId: string | null | undefined) => {
    if (!branchScope) return true;
    if (!branchId) return true;
    return branchScope.has(branchId);
  };

  const value: AuthCtx = {
    user: session?.user ?? null,
    session,
    roles,
    permissions,
    approvalRights,
    actionRights,
    branchScope,
    loading,
    mustChangePassword,
    isActive,
    isAdmin,
    isManager,
    canWrite: isAdmin || isManager,
    canView,
    canApprove,
    canDo,
    canSeeBranch,
    signOut: async () => { await supabase.auth.signOut(); },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be inside AuthProvider");
  return c;
}
