import { passwordPolicyError } from "@/lib/password-policy";
import {listTenantRoleTemplates,saveTenantRoleTemplate,assignTenantRoleTemplate} from "@/lib/tenant-roles.functions";
import { useState } from "react";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, AppRole, ALL_MODULES, ALL_APPROVAL_KINDS, ALL_ACTION_KINDS, ModuleKey, ApprovalKind, ActionKind } from "@/hooks/use-auth";
import {
  createUserAccount, adminResetPassword, setUserActive, deleteUserAccount, getUserLicenseOverview, transferUserLicense,
  setUserRole, setUserModulePermission, setUserApprovalRight, setUserActionRight, setUserBranchAccess,
} from "@/lib/admin-users.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserPlus, Users as UsersIcon, KeyRound, Trash2, Settings2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/users")({ component: UsersPage });

const ROLES: AppRole[] = ["admin", "manager", "staff", "security"];

function UsersPage() {
  const { isTenantAdmin, isSaasAdmin, supportMode, tenantId, loading, user: me } = useAuth();
  const platformControl = isSaasAdmin && !supportMode;
  const getAuthHeaders = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return {};
    return { Authorization: `Bearer ${session.access_token}` };
  };

  const roleListFn=useServerFn(listTenantRoleTemplates);
  const roleSaveFn=useServerFn(saveTenantRoleTemplate);
  const roleAssignFn=useServerFn(assignTenantRoleTemplate);
  const [roleEditorOpen,setRoleEditorOpen]=useState(false);
  const [roleId,setRoleId]=useState<string|null>(null);
  const [roleName,setRoleName]=useState("");
  const [roleDescription,setRoleDescription]=useState("");
  const [roleBase,setRoleBase]=useState<"staff"|"manager"|"security">("staff");
  const [roleModules,setRoleModules]=useState<string[]>(["dashboard","assets"]);
  const [roleActions,setRoleActions]=useState<string[]>([]);
  const [roleApprovals,setRoleApprovals]=useState<string[]>([]);
  const [roleSaving,setRoleSaving]=useState(false);
  const roleList=useQuery({queryKey:["tenant-role-templates",tenantId],enabled:isTenantAdmin&&!platformControl,
    queryFn:async()=>roleListFn({headers:await getAuthHeaders()})});
  const editRole=(role?:any)=>{setRoleId(role?.id??null);setRoleName(role?.name??"");setRoleDescription(role?.description??"");
    setRoleBase(role?.base_role??"staff");setRoleModules(role?.modules??["dashboard","assets"]);
    setRoleActions(role?.actions??[]);setRoleApprovals(role?.approvals??[]);setRoleEditorOpen(true);};
  const saveRole=async()=>{
    if(roleName.trim().length<2)return toast.error("Enter a role name");
    setRoleSaving(true);
    try{
      await roleSaveFn({headers:await getAuthHeaders(),data:{id:roleId??undefined,name:roleName.trim(),
        description:roleDescription,base_role:roleBase,modules:roleModules,actions:roleActions,approvals:roleApprovals}});
      let failures=0;
      if(roleId){
        for(const assigned of roleList.data?.assignments??[]){
          if(assigned.template_id!==roleId)continue;
          try{
            await roleAssignFn({headers:await getAuthHeaders(),data:{userId:assigned.user_id,templateId:roleId}});
          }catch{failures++;}
        }
      }
      await roleList.refetch();
      await qc.invalidateQueries({queryKey:["users-with-roles"]});
      setRoleEditorOpen(false);
      if(failures)toast.error(`Role saved. ${failures} user assignments could not be refreshed.`);
      else toast.success("Business role and assigned user permissions saved");
    }catch(e:any){toast.error(e?.message||"Could not save role");}
    finally{setRoleSaving(false);}
  };
  const assignRole=async(userId:string,templateId:string)=>{
    try{await roleAssignFn({headers:await getAuthHeaders(),data:{userId,templateId}});
    await Promise.all([roleList.refetch(),qc.invalidateQueries({queryKey:["users-with-roles"]})]);
    toast.success("User role and permissions updated");}
    catch(e:any){toast.error(e?.message||"Could not assign role");}
  };
  const qc = useQueryClient();
  const invalidate = () => Promise.all([
    qc.invalidateQueries({queryKey:["users-with-roles",tenantId]}),
    qc.invalidateQueries({queryKey:["user-license-overview",tenantId]}),
  ]);
  const [tab,setTab]=useState<"users"|"archived"|"history">("users");
  const overviewFn=useServerFn(getUserLicenseOverview);
  const overview=useQuery({queryKey:["user-license-overview",tenantId],enabled:!!tenantId&&isTenantAdmin&&!platformControl,
    queryFn:async()=>overviewFn({headers:await getAuthHeaders()})});
  const seats=overview.data;
  const usage=seats?.limit!=null && seats.limit>0 ? Math.round(100*seats.active/seats.limit) : null;
  const [userSearch,setUserSearch]=useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ email: "", password: "", full_name: "", role: "staff" as AppRole });
  const [submitting, setSubmitting] = useState(false);
  const [transferOpen,setTransferOpen]=useState(false);
  const [transferBusy,setTransferBusy]=useState(false);
  const [transfer,setTransfer]=useState({source_user_id:"",request_id:"",full_name:"",email:"",password:"",role:"staff" as AppRole,reason:""});
  const transferFn=useServerFn(transferUserLicense);
  const beginTransfer=(source:string)=>{
    setTransfer({source_user_id:source,request_id:crypto.randomUUID(),full_name:"",email:"",password:"",role:"staff",reason:""});
    setTransferOpen(true);
  };
  const submitTransfer=async()=>{
    if(!transfer.source_user_id||!transfer.full_name.trim()||!transfer.email.trim()||transfer.password.length<8||transfer.reason.trim().length<5){toast.error("Complete the replacement details and reason.");return;}
    const issue=passwordPolicyError(transfer.password); if(issue){toast.error(issue);return;}
    setTransferBusy(true);
    try{
      const result=await transferFn({data:transfer,headers:await getAuthHeaders()});
      toast.success("License transferred. Reference: "+result.id);
      if(result.welcomeEmailAccepted===false)toast.warning("Account created; welcome email was not accepted. Share temporary credentials securely.");
      setTransferOpen(false);
      setTransfer(prev=>({...prev,password:""}));
      setTab("history");
      await invalidate();
    }catch(e:any){toast.error(e?.message||"Transfer could not be completed. Check License History before retrying.");}
    finally{setTransferBusy(false);}
  };

  const createFn = useServerFn(createUserAccount);
  const resetFn = useServerFn(adminResetPassword);
  const activeFn = useServerFn(setUserActive);
  const deleteFn = useServerFn(deleteUserAccount);
  const roleFn = useServerFn(setUserRole);
  const moduleFn = useServerFn(setUserModulePermission);
  const approvalFn = useServerFn(setUserApprovalRight);
  const actionFn = useServerFn(setUserActionRight);
  const branchFn = useServerFn(setUserBranchAccess);


  const { data: branchesAll = [] } = useQuery({
    queryKey: ["branches-all-for-perms",tenantId],
    enabled: isTenantAdmin && !platformControl,
    queryFn: async () => (await supabase.from("branches").select("id,name,code").order("name")).data ?? [],
  });

  const { data = [], isLoading, error: usersError } = useQuery({
    queryKey: ["users-with-roles",tenantId],
    enabled: isTenantAdmin && !platformControl,
    queryFn: async () => {
      if(!tenantId) return [];
      // This view must always query exactly one business. A SaaS Admin may have
      // platform-wide profile read rights, so RLS alone cannot scope this page.
      const {data:profiles,error:profileError}=await supabase.from("profiles")
        .select("*").eq("is_saas_admin",false).eq("tenant_id",tenantId).is("archived_at",null)
        .order("created_at",{ascending:false});
      if(profileError)throw new Error(profileError.message);
      const userIds=(profiles??[]).map(p=>p.id);
      if(!userIds.length)return [];
      const [{data:roles},{data:perms},{data:rights},{data:acts},{data:brs}]=await Promise.all([
        supabase.from("user_roles").select("user_id, role").in("user_id",userIds),
        supabase.from("user_permissions" as any).select("user_id, module, can_view").in("user_id",userIds),
        supabase.from("user_approval_rights" as any).select("user_id, approval_kind").in("user_id",userIds),
        supabase.from("user_action_rights" as any).select("user_id, action_kind").in("user_id",userIds),
        supabase.from("user_branch_access" as any).select("user_id, branch_id").in("user_id",userIds),
      ]);
      return (profiles ?? []).map((p) => ({
        ...p,
        roles: (roles ?? []).filter((r) => r.user_id === p.id).map((r) => r.role as AppRole),
        modules: new Set(((perms as any) ?? []).filter((x: any) => x.user_id === p.id && x.can_view).map((x: any) => x.module as ModuleKey)),
        approvals: new Set(((rights as any) ?? []).filter((x: any) => x.user_id === p.id).map((x: any) => x.approval_kind as ApprovalKind)),
        actions: new Set(((acts as any) ?? []).filter((x: any) => x.user_id === p.id).map((x: any) => x.action_kind as ActionKind)),
        branches: new Set(((brs as any) ?? []).filter((x: any) => x.user_id === p.id).map((x: any) => x.branch_id as string)),
      }));
    },
  });

  if (loading) return <div className="flex justify-center py-12"><div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>;
  if (platformControl) return <Navigate to="/saas-admin" />;
  if (!isTenantAdmin) return <Navigate to="/dashboard" />;

  const create = async () => {
    if (!form.email || !form.password) return toast.error("Email and password required");
    const issue=passwordPolicyError(form.password); if(issue)return toast.error(issue);
    setSubmitting(true);
    try {
      const headers = await getAuthHeaders();
      const result = await createFn({ data: form, headers });
      toast.success("User created. Share the temporary password with them - they'll be asked to change it on first sign-in.");
      setOpen(false);
      setForm({ email: "", password: "", full_name: "", role: "staff" });
      invalidate();
    } catch (e: any) { toast.error(e?.message ?? "Failed to create user"); }
    finally { setSubmitting(false); }
  };

  const call = async (fn: any, payload: any, success?: string) => {
    try {
      const headers = await getAuthHeaders();
      await fn({ data: payload, headers });
      if (success) toast.success(success);
      invalidate();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not update user");
      throw e;
    }
  };

  const onReset = async (userId: string, newPass: string) => {
    await call(resetFn, { user_id: userId, new_password: newPass }, "Password reset. Share the temporary password with the user.");
  };

  const setRole = async (userId: string, role: AppRole, currentRoles: AppRole[]) => {
    await call(roleFn, { user_id: userId, role, enabled: !currentRoles.includes(role) });
  };

  const toggleModule = async (userId: string, module: ModuleKey, on: boolean) => {
    await call(moduleFn, { user_id: userId, module, enabled: !on });
  };

  const toggleAction = async (userId: string, kind: ActionKind, on: boolean) => {
    await call(actionFn, { user_id: userId, action_kind: kind, enabled: !on });
  };

  const toggleBranch = async (userId: string, branchId: string, on: boolean) => {
    await call(branchFn, { user_id: userId, branch_id: branchId, enabled: !on });
  };

  const toggleApproval = async (userId: string, kind: ApprovalKind, on: boolean) => {
    await call(approvalFn, { user_id: userId, approval_kind: kind, enabled: !on });
  };

  const onToggleActive = async (userId: string, makeActive: boolean) => {
    await call(activeFn, { user_id: userId, active: makeActive }, makeActive ? "User reactivated" : "User deactivated");
  };

  const onDelete = async (userId: string) => {
    await call(deleteFn, { user_id: userId }, "User access removed");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#4B47DC] dark:text-foreground">Users & Responsibilities</h1>
          <p className="text-sm text-muted-foreground">Manage team access, monitor licenses and assign responsibilities.</p>
        </div>
        <Button variant="outline" onClick={()=>editRole()}>Manage Roles</Button>
        <Dialog open={roleEditorOpen} onOpenChange={setRoleEditorOpen}>
          <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
            <DialogHeader><DialogTitle>{roleId?"Edit role":"Create custom role"}</DialogTitle>
              <DialogDescription>Define the title and permissions. Existing system roles remain available.</DialogDescription></DialogHeader>
            <div className="space-y-3">
              <div><Label>Role title</Label><Input value={roleName} onChange={e=>setRoleName(e.target.value)} placeholder="Asset Officer"/></div>
              <div><Label>Description</Label><Input value={roleDescription} onChange={e=>setRoleDescription(e.target.value)}/></div>
              <div><Label>Base access level</Label><Select value={roleBase} onValueChange={v=>setRoleBase(v as typeof roleBase)}>
                <SelectTrigger><SelectValue/></SelectTrigger><SelectContent>
                  <SelectItem value="staff">Staff</SelectItem><SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="security">Security</SelectItem>
                </SelectContent></Select><p className="text-xs text-muted-foreground">Company administrator access is managed separately.</p></div>
              <p className="font-semibold">Modules</p>
              <div className="grid grid-cols-2 gap-2">{ALL_MODULES.map(m=><label key={m} className="flex items-center gap-2 text-sm">
                <Checkbox checked={roleModules.includes(m)} onCheckedChange={v=>setRoleModules(a=>v?[...new Set([...a,m])]:a.filter(x=>x!==m))}/>{m.replace(/_/g," ")}</label>)}</div>
              <p className="font-semibold">Actions</p>
              <div className="grid grid-cols-2 gap-2">{ALL_ACTION_KINDS.map(k=><label key={k} className="flex items-center gap-2 text-sm">
                <Checkbox checked={roleActions.includes(k)} onCheckedChange={v=>setRoleActions(a=>v?[...new Set([...a,k])]:a.filter(x=>x!==k))}/>{k.replace(/_/g," ")}</label>)}</div>
              <p className="font-semibold">Approvals</p>
              <div className="grid grid-cols-2 gap-2">{ALL_APPROVAL_KINDS.map(k=><label key={k} className="flex items-center gap-2 text-sm">
                <Checkbox checked={roleApprovals.includes(k)} onCheckedChange={v=>setRoleApprovals(a=>v?[...new Set([...a,k])]:a.filter(x=>x!==k))}/>{k.replace(/_/g," ")}</label>)}</div>
            </div>
            <DialogFooter><Button variant="outline" onClick={()=>setRoleEditorOpen(false)}>Cancel</Button><Button disabled={roleSaving} onClick={saveRole}>Save Role</Button></DialogFooter>
          </DialogContent>
        </Dialog>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button className="bg-[#4B47DC] text-white hover:bg-[#3834b8]" disabled={!seats?.canAdd||overview.isFetching}><UserPlus className="mr-2 h-4 w-4" /> New user</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create user account</DialogTitle>
              <DialogDescription>The user signs in with this temporary password and must change it after the first successful login.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2"><Label>Full name *</Label><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
              <div className="space-y-2"><Label>Email *</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              <div className="space-y-2"><Label>Temporary password *</Label><Input type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
              <div className="space-y-2">
                <Label>Initial role</Label>
                <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as AppRole })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={create} disabled={submitting}>{submitting ? "Creating…" : "Create"}</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {overview.error && <p role="alert" className="text-sm text-destructive">License information could not be loaded. <Button size="sm" variant="outline" onClick={()=>overview.refetch()}>Retry</Button></p>}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[
          {label:"Licensed users",value:seats?(seats.limit??"Unlimited"):"—"},
          {label:"Active users",value:seats?.active??"—"},
          {label:"Available licenses",value:seats?(seats.available??"Unlimited"):"—"},
          {label:"Archived users",value:seats?.archived??"—"},
        ].map((item,i)=><Card key={item.label} className="rounded-lg border p-4 shadow-none">
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><UsersIcon className={i===2?"h-4 w-4 text-[#C77435]":"h-4 w-4 text-[#4B47DC]"} />{item.label}</div>
          <p className="mt-2 text-2xl font-semibold tabular-nums">{item.value}</p>
        </Card>)}
      </div>
      <Card className="space-y-3 rounded-lg p-4 shadow-none">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">License utilisation</h2><span className="text-sm font-semibold">{usage!==null?usage+"%":seats?.limit===null?"Unlimited":"—"}</span></div>
        {usage!==null && <div role="progressbar" aria-label="License utilisation" aria-valuenow={Math.min(100,usage)} className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-[#4B47DC]" style={{width:Math.min(100,usage)+"%"}}/></div>}
        {seats && !seats.subscriptionValid ? <p className="text-sm text-muted-foreground">Renew or activate the subscription before adding users.</p> : seats?.available===0 ? <p className="text-sm text-muted-foreground">All licenses are in use. Deactivate an existing user to release a seat, then add the replacement.</p> : <p className="text-sm text-muted-foreground">Inactive and archived users do not occupy active seats.</p>}
      </Card>
      <div className="flex flex-wrap gap-1 border-b" aria-label="User views">
        {([{id:"users",label:"All users"},{id:"archived",label:"Archived users"},{id:"history",label:"License history"}] as const).map(t=><button key={t.id} type="button" onClick={()=>setTab(t.id)} aria-pressed={tab===t.id} className={"border-b-2 px-4 py-3 text-sm font-medium "+(tab===t.id?"border-[#C77435] text-[#4B47DC] dark:text-foreground":"border-transparent text-muted-foreground")}>{t.label}</button>)}
      </div>
      {tab==="archived" && <Card className="overflow-hidden rounded-lg shadow-none">
        <div className="border-b p-4"><h2 className="font-semibold">Archived users</h2><p className="text-sm text-muted-foreground">Historical identities are retained without active licenses. Showing up to 100 latest records.</p></div>
        {seats?.archivedUsers.map(u=><div key={u.id} className="flex flex-wrap items-center justify-between gap-2 border-b p-4 last:border-0"><div><p className="font-medium">{u.full_name||u.email||"Archived account"}</p><p className="text-sm text-muted-foreground">{u.email}</p></div><span className="text-sm text-muted-foreground">{new Date(u.archived_at).toLocaleDateString()}</span></div>)}
        {seats && !seats.archivedUsers.length && <p className="p-6 text-sm text-muted-foreground">No archived users.</p>}
        {!seats && <p className="p-6 text-sm text-muted-foreground">Archive information unavailable.</p>}
      </Card>}
      {tab==="history" && <Card className="overflow-hidden rounded-lg shadow-none">
        <div className="border-b p-4"><h2 className="font-semibold">License transfer history</h2><p className="text-sm text-muted-foreground">Latest 100 permanent transfer records. Earlier account activity is shown separately below.</p></div>
        {seats?.transfers.map(e=><div key={e.id} className="space-y-2 border-b p-4 text-sm">
          <div className="flex flex-wrap justify-between gap-2"><span className="font-semibold text-[#4B47DC] dark:text-foreground">License transfer</span><span className="text-muted-foreground">{new Date(e.created_at).toLocaleString()}</span></div>
          <div className="grid gap-2 sm:grid-cols-2"><div><span className="text-muted-foreground">From</span><p className="font-medium">{e.source_name}</p><p className="text-xs text-muted-foreground">{e.source_email}</p></div><div><span className="text-muted-foreground">To</span><p className="font-medium">{e.target_name}</p><p className="text-xs text-muted-foreground">{e.target_email} · {e.target_role}</p></div></div>
          <p>Reason: {e.reason}</p><p className="text-muted-foreground">By {e.actor_name} · Seats {e.seats_before} → {e.seats_after} / {e.seat_limit??"Unlimited"}</p>
          <p className="break-all text-xs text-muted-foreground">Reference: {e.id}</p>
        </div>)}
        {seats&&!seats.transfers.length&&<p className="p-4 text-sm text-muted-foreground">No license transfers yet.</p>}
        <h3 className="border-b bg-muted/40 px-4 py-3 text-sm font-semibold">Previous user activity</h3>
        {seats?.events.map(e=><div key={e.id} className="grid gap-1 border-b p-4 text-sm last:border-0 sm:grid-cols-3"><div className="font-medium capitalize">{e.action.replace(/_/g," ")}</div><div>{e.target_name||"User"}<p className="text-muted-foreground">By {e.actor_name||"Recorded administrator"}</p></div><div className="text-muted-foreground">{new Date(e.created_at).toLocaleString()}</div></div>)}
        {seats && !seats.events.length && <p className="p-6 text-sm text-muted-foreground">No recorded user activity.</p>}
        {!seats && <p className="p-6 text-sm text-muted-foreground">Activity information unavailable.</p>}
      </Card>}
      {tab==="users" && <>
      <Card className="p-4 space-y-3 rounded-lg shadow-none">
        <div className="flex items-center justify-between"><h2 className="font-semibold">Business Roles</h2><span className="text-xs text-muted-foreground">Create and edit your organization's positions</span></div>
        {roleList.isLoading&&<p className="text-sm">Loading roles…</p>}
        {roleList.error&&<p className="text-sm text-destructive">Could not load roles</p>}
        <div className="flex flex-wrap gap-2">{(roleList.data?.roles??[]).map((r:any)=>
          <Button key={r.id} variant="outline" size="sm" onClick={()=>editRole(r)}>{r.name} · Edit</Button>)}</div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>Customize a preset:</span>
          {(["staff","manager","security"] as const).map(base=><Button key={base} size="sm" variant="ghost"
            onClick={()=>editRole({name:base[0].toUpperCase()+base.slice(1),base_role:base,modules:base==="staff"?["dashboard","assets"]:ALL_MODULES,actions:[],approvals:[]})}>{base}</Button>)}
        </div>
      </Card>
      <div className="flex items-center justify-between gap-3">
        <Input className="max-w-sm" placeholder="Search users by name or email"
          value={userSearch} onChange={e=>setUserSearch(e.target.value)}/>
        <p className="text-xs text-muted-foreground">{data.length} user(s)</p>
      </div>
      <Card className="overflow-hidden rounded-lg shadow-none p-0">
        {usersError ? <p role="alert" className="p-6 text-sm text-destructive">Unable to load users.</p> : isLoading ? (
          <p className="py-12 text-center text-sm text-muted-foreground">Loading…</p>
        ) : data.length === 0 ? (
          <div className="py-12 text-center"><UsersIcon className="mx-auto h-10 w-10 text-muted-foreground/40" /><p className="mt-3 text-sm text-muted-foreground">No tenant users yet.</p></div>
        ) : (
          <div className="divide-y">
            <div className="hidden bg-muted/60 px-4 py-3 text-xs font-semibold text-muted-foreground md:grid md:grid-cols-[minmax(0,2fr)_1fr_1fr_1fr_auto] md:gap-4"><span>User</span><span>Role</span><span>Status</span><span>License</span><span>Actions</span></div>
            {data.filter((u:any)=>!userSearch.trim()||[u.email,u.full_name].some(v=>String(v??"").toLowerCase().includes(userSearch.toLowerCase().trim()))).map((u: any) => (
              <UserRow
                key={u.id}
                u={u}
                self={u.id === me?.id}
                branchesAll={branchesAll}
                onRole={setRole}
                onModule={toggleModule}
                onApproval={toggleApproval}
                onAction={toggleAction}
                onBranch={toggleBranch}
                onActive={onToggleActive}
                onDelete={onDelete}
                onReset={onReset}
                onTransfer={beginTransfer}
                transferAllowed={!!seats?.subscriptionValid&&(seats.limit===null||seats.active<=seats.limit)}
                customRoles={roleList.data?.roles??[]}
                assignedRole={(roleList.data?.assignments??[]).find((a:any)=>a.user_id===u.id)?.template_id}
                onAssign={assignRole}
              />
            ))}
          </div>
        )}
      </Card>
      <Card className="rounded-lg border-l-4 border-l-[#C77435] p-4 shadow-none">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Reassign a license</h2><p className="mt-1 text-sm text-muted-foreground">Replace an active employee with a new account without increasing the seat count. The original identity and asset history are retained.</p></div>
          <Button className="bg-[#4B47DC] text-white hover:bg-[#3834b8]" disabled={!seats?.subscriptionValid||!data.some((u:any)=>u.is_active&&u.id!==me?.id)||(seats.limit!==null&&seats.active>seats.limit)} onClick={()=>beginTransfer("")}>Transfer license</Button></div>
      </Card>
      </>}
      <Dialog open={transferOpen} onOpenChange={v=>{if(!transferBusy){setTransferOpen(v);if(!v)setTransfer(prev=>({...prev,password:""}));}}}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader><DialogTitle>Transfer license</DialogTitle><DialogDescription>The departing user's access will be revoked. A separate new account will receive the released license. Purchased capacity and subscription dates remain unchanged.</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <div><Label>Departing user</Label><Select value={transfer.source_user_id} onValueChange={v=>setTransfer(p=>({...p,source_user_id:v}))} disabled={transferBusy}><SelectTrigger><SelectValue placeholder="Select an active user"/></SelectTrigger><SelectContent>{data.filter((u:any)=>u.is_active&&u.id!==me?.id).map((u:any)=><SelectItem key={u.id} value={u.id}>{u.full_name||u.email}</SelectItem>)}</SelectContent></Select></div>
            <div className="grid gap-3 sm:grid-cols-2"><div><Label htmlFor="transfer-name">Replacement name</Label><Input id="transfer-name" value={transfer.full_name} maxLength={200} disabled={transferBusy} onChange={e=>setTransfer(p=>({...p,full_name:e.target.value}))}/></div>
            <div><Label>Initial role</Label><Select value={transfer.role} disabled={transferBusy} onValueChange={v=>setTransfer(p=>({...p,role:v as AppRole}))}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{ROLES.map(r=><SelectItem value={r} key={r}>{r}</SelectItem>)}</SelectContent></Select></div></div>
            <div><Label htmlFor="transfer-email">Replacement email</Label><Input id="transfer-email" type="email" value={transfer.email} disabled={transferBusy} onChange={e=>setTransfer(p=>({...p,email:e.target.value}))}/></div>
            <div><Label htmlFor="transfer-password">Temporary password</Label><Input id="transfer-password" type="password" autoComplete="new-password" value={transfer.password} disabled={transferBusy} onChange={e=>setTransfer(p=>({...p,password:e.target.value}))}/><p className="text-xs text-muted-foreground">At least 8 characters with uppercase, lowercase, number and symbol; no four ascending or descending digits.</p></div>
            <div><Label htmlFor="transfer-reason">Reason for transfer</Label><textarea id="transfer-reason" className="w-full rounded-md border bg-background p-2 text-sm" rows={3} maxLength={500} value={transfer.reason} disabled={transferBusy} onChange={e=>setTransfer(p=>({...p,reason:e.target.value}))} placeholder="Employee replacement, resignation, or role change"/></div>
            <p className="rounded-md bg-muted p-3 text-xs">The transfer is recorded permanently with both accounts, the administrator, reason, date and seat count. No passwords are recorded.</p>
          </div>
          <DialogFooter><Button variant="outline" disabled={transferBusy} onClick={()=>{setTransferOpen(false);setTransfer(p=>({...p,password:""}));}}>Cancel</Button><Button className="bg-[#4B47DC] text-white hover:bg-[#3834b8]" disabled={transferBusy} onClick={submitTransfer}>{transferBusy?"Transferring…":"Confirm transfer"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function UserRow({ u, self, branchesAll, onRole, onModule, onApproval, onAction, onBranch, onActive, onDelete, onReset, onTransfer, transferAllowed, customRoles, assignedRole, onAssign }: any) {
  const [resetOpen, setResetOpen] = useState(false);
  const [newPwd, setNewPwd] = useState("");
  const [permsOpen, setPermsOpen] = useState(false);
  const [manageOpen,setManageOpen]=useState(false);

  return (
    <div className="bg-card px-4 py-3">
      <div className="grid grid-cols-2 items-center gap-3 md:grid-cols-[minmax(0,2fr)_1fr_1fr_1fr_auto] md:gap-4">
        <div className="col-span-2 flex min-w-0 items-center gap-3 md:col-span-1">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#4B47DC]/10 text-xs font-semibold text-[#4B47DC]">{String(u.full_name||u.email||"U").split(/[ @]/).filter(Boolean).slice(0,2).map((s:string)=>s[0]?.toUpperCase()).join("")}</span>
          <div className="min-w-0"><p className="truncate text-sm font-semibold">{u.full_name||u.email} {self&&<span className="text-xs text-muted-foreground">(You)</span>}</p><p className="truncate text-xs text-muted-foreground">{u.email}</p></div>
        </div>
        <div className="text-sm capitalize">{(u.roles??[]).join(", ")||"—"}</div>
        <div className="text-sm"><span className={u.is_active?"text-success":"text-muted-foreground"}>{u.is_active?"● Active":"○ Inactive"}</span></div>
        <div className="text-sm text-muted-foreground">{u.is_active?"Assigned":"Released"}</div>
        <Button variant="outline" size="sm" aria-expanded={manageOpen} onClick={()=>{setManageOpen(v=>!v);setPermsOpen(false)}}>{manageOpen?"Close":"Manage"}</Button>
      </div>
      {manageOpen && <>
      {!self&&customRoles?.length>0&&<div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
        <Label>Custom role</Label>
        <Select value={assignedRole??""} onValueChange={v=>onAssign(u.id,v)}>
          <SelectTrigger className="w-64"><SelectValue placeholder="Assign business role"/></SelectTrigger>
          <SelectContent>{customRoles.map((r:any)=><SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>}
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
        <Button variant="outline" size="sm" onClick={() => setPermsOpen((s) => !s)}><Settings2 className="mr-2 h-4 w-4" /> {permsOpen ? "Hide" : "Permissions"}</Button>
        <Dialog open={resetOpen} onOpenChange={setResetOpen}>
          <DialogTrigger asChild><Button variant="outline" size="sm"><KeyRound className="mr-2 h-4 w-4" /> Reset password</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Reset password for {u.email}</DialogTitle><DialogDescription>Set a temporary password. The user must change it on next sign-in.</DialogDescription></DialogHeader>
            <div className="space-y-2 py-2"><Label>New temporary password</Label><Input type="password" autoComplete="new-password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} /></div>
            <DialogFooter><Button variant="outline" onClick={() => setResetOpen(false)}>Cancel</Button><Button onClick={async () => { const issue=passwordPolicyError(newPwd); if(issue)return toast.error(issue); try { await onReset(u.id, newPwd); setNewPwd(""); setResetOpen(false); } catch {} }}>Save</Button></DialogFooter>
          </DialogContent>
        </Dialog>
        <div className="flex items-center gap-2 text-sm"><Switch checked={u.is_active !== false} disabled={self} onCheckedChange={(v) => onActive(u.id, v)} /><span className="text-muted-foreground">{u.is_active !== false ? "Active" : "Inactive"}</span></div>
        {!self && u.is_active && <Button variant="outline" size="sm" disabled={!transferAllowed} onClick={()=>onTransfer(u.id)}>Transfer license</Button>}
        {!self && (
          <AlertDialog>
            <AlertDialogTrigger asChild><Button variant="destructive" size="sm" className="ml-auto"><Trash2 className="mr-2 h-4 w-4" /> Remove access</Button></AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader><AlertDialogTitle>Remove this user's access?</AlertDialogTitle><AlertDialogDescription>This will block <strong>{u.email}</strong> from signing in and archive their profile, releasing the active license. Their asset and audit history will remain.</AlertDialogDescription></AlertDialogHeader>
              <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => onDelete(u.id)}>Remove access</AlertDialogAction></AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>

      {permsOpen && (
        <div className="mt-3 grid gap-4 border-t pt-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Core system role</p>
            <div className="flex flex-wrap gap-2">
              {ROLES.map((r)=>{
                const on=u.roles.includes(r);
                return <button key={r} onClick={()=>onRole(u.id,r,u.roles)} disabled={self&&r==="admin"&&on}
                  className={`rounded-full border px-3 py-1 text-xs font-medium capitalize ${on?"border-primary bg-primary text-primary-foreground":"bg-background hover:bg-muted"} disabled:opacity-50`}>{r}</button>;
              })}
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Modules they can view</p>
            <div className="grid grid-cols-2 gap-2">
              {ALL_MODULES.map((m) => { const on = u.modules.has(m); return <label key={m} className="flex items-center gap-2 text-sm capitalize"><Checkbox checked={on} onCheckedChange={() => onModule(u.id, m, on)} />{m.replace(/_/g, " ")}</label>; })}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Tenant admins automatically see modules allowed by the SaaS plan.</p>
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Approval rights</p>
            <div className="grid grid-cols-1 gap-2">{ALL_APPROVAL_KINDS.map((k) => { const on = u.approvals.has(k); return <label key={k} className="flex items-center gap-2 text-sm capitalize"><Checkbox checked={on} onCheckedChange={() => onApproval(u.id, k, on)} />{k.replace(/_/g, " ")}</label>; })}</div>
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Asset actions they can initiate</p>
            <div className="grid grid-cols-1 gap-2">{ALL_ACTION_KINDS.map((k) => { const on = u.actions.has(k); return <label key={k} className="flex items-center gap-2 text-sm capitalize"><Checkbox checked={on} onCheckedChange={() => onAction(u.id, k, on)} />{k.replace(/_/g, " ")}</label>; })}</div>
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Visible branches</p>
            {(branchesAll ?? []).length === 0 ? <p className="text-sm text-muted-foreground">No branches created yet.</p> : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{(branchesAll ?? []).map((b: any) => { const on = u.branches.has(b.id); return <label key={b.id} className="flex items-center gap-2 text-sm"><Checkbox checked={on} onCheckedChange={() => onBranch(u.id, b.id, on)} /><span>{b.name}{b.code ? <span className="ml-1 text-xs text-muted-foreground">({b.code})</span> : null}</span></label>; })}</div>
            )}
            <p className="mt-2 text-xs text-muted-foreground">Leave all unticked to grant access to every branch. Tick specific branches to limit visibility.</p>
          </div>
        </div>
      )}
      </>}
    </div>
  );
}