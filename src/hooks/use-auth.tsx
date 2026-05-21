import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";

export type AppRole = "admin" | "manager" | "staff";
export type ModuleKey =
  | "dashboard" | "assets" | "categories" | "locations" | "branches"
  | "users" | "reports" | "audit";
export type ApprovalKind =
  | "movement" | "retirement" | "disposal" | "reactivation" | "set_for_disposal";

export const ALL_MODULES: ModuleKey[] = [
  "dashboard", "assets", "categories", "locations", "branches", "users", "reports", "audit",
];
export const ALL_APPROVAL_KINDS: ApprovalKind[] = [
  "movement", "retirement", "disposal", "reactivation", "set_for_disposal",
];
export const DEFAULT_NEW_USER_MODULES: ModuleKey[] = ["dashboard", "assets"];

interface AuthCtx {
  user: User | null;
  session: Session | null;
  roles: AppRole[];
  permissions: Set<ModuleKey>;
  approvalRights: Set<ApprovalKind>;
  loading: boolean;
  isAdmin: boolean;
  isManager: boolean;
  canWrite: boolean;
  canView: (m: ModuleKey) => boolean;
  canApprove: (k: ApprovalKind) => boolean;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [permissions, setPermissions] = useState<Set<ModuleKey>>(new Set());
  const [approvalRights, setApprovalRights] = useState<Set<ApprovalKind>>(new Set());
  const [loading, setLoading] = useState(true);

  const loadFor = async (uid: string) => {
    const [{ data: r }, { data: p }, { data: a }] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", uid),
      supabase.from("user_permissions" as any).select("module,can_view").eq("user_id", uid),
      supabase.from("user_approval_rights" as any).select("approval_kind").eq("user_id", uid),
    ]);
    setRoles((r ?? []).map((x: any) => x.role as AppRole));
    setPermissions(new Set((p ?? []).filter((x: any) => x.can_view).map((x: any) => x.module as ModuleKey)));
    setApprovalRights(new Set((a ?? []).map((x: any) => x.approval_kind as ApprovalKind)));
  };

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (s?.user) setTimeout(() => loadFor(s.user.id), 0);
      else { setRoles([]); setPermissions(new Set()); setApprovalRights(new Set()); }
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

  const value: AuthCtx = {
    user: session?.user ?? null,
    session,
    roles,
    permissions,
    approvalRights,
    loading,
    isAdmin,
    isManager,
    canWrite: isAdmin || isManager,
    canView,
    canApprove,
    signOut: async () => { await supabase.auth.signOut(); },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be inside AuthProvider");
  return c;
}
