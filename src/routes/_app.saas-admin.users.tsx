import {createFileRoute,Link} from "@tanstack/react-router";
import {useState} from "react";
import {useQuery,useQueryClient} from "@tanstack/react-query";
import {useServerFn} from "@tanstack/react-start";
import {getServerAuthHeaders} from "@/lib/auth-headers";
import {listPlatformUsersAndRoles,createPlatformStaffUser,changePlatformStaffRole,getPlatformRoleCatalog} from "@/lib/platform-staff-rbac.functions";
import {Card} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {toast} from "sonner";
const roleOptions=["finance","support","operations","viewer"] as const;
type Role=typeof roleOptions[number];
export const Route=createFileRoute("/_app/saas-admin/users")({component:PlatformUsersRoles});
function PlatformUsersRoles(){
 const qc=useQueryClient();
 const list=useServerFn(listPlatformUsersAndRoles);
 const create=useServerFn(createPlatformStaffUser);
 const change=useServerFn(changePlatformStaffRole);
 const catalog=useServerFn(getPlatformRoleCatalog);
 const [email,setEmail]=useState("");
 const [name,setName]=useState("");
 const [role,setRole]=useState<Role>("finance");
 const [reason,setReason]=useState("");
 const [editing,setEditing]=useState<any>(null);
 const [editRole,setEditRole]=useState("viewer");
 const [editReason,setEditReason]=useState("");
 const [busy,setBusy]=useState(false);
 const call=async(fn:any,data?:any)=>fn({headers:await getServerAuthHeaders(),...(data?{data}:{})});
 const users=useQuery({queryKey:["platform-staff-users"],queryFn:()=>call(list)});
 const roles=useQuery({queryKey:["platform-rbac-role-catalog"],queryFn:()=>call(catalog)});
 async function act(task:()=>Promise<any>,message:string){
  setBusy(true);
  try{await task();toast.success(message);await qc.invalidateQueries({queryKey:["platform-staff-users"]});}
  catch(e:any){toast.error(e?.message||"Action denied")}finally{setBusy(false);}
 }
 async function invite(){
  await act(()=>call(create,{email,name,role,reason}),"Staff invitation requested and recorded");
  setEmail("");setName("");setReason("");
 }
 async function save(){
  if(!editing)return;
  await act(()=>call(change,{userId:editing.id,role:editRole==="none"?null:editRole,reason:editReason}),"Platform staff role updated");
  setEditing(null);setEditReason("");
 }
 return <div className="space-y-6">
  <header><h1 className="text-2xl font-bold">Users & Roles</h1>
    <p className="text-sm text-muted-foreground">Platform staff use dedicated accounts, never customer accounts. Only SaaS Administrators may create or assign roles.</p>
  </header>
  <Card className="space-y-3 p-5">
   <div className="flex flex-wrap items-center justify-between gap-3">
    <h2 className="font-semibold">SaaS Administrators</h2>
    <Button asChild variant="outline"><Link to="/saas-admin/administrators">Manage SaaS Admins (max 3)</Link></Button>
   </div>
   <p className="text-sm text-muted-foreground">Full platform-owner role with elevated authentication, recorded role changes and separate tenant intervention audit.</p>
  </Card>
  <Card className="space-y-3 p-5"><h2 className="font-semibold">Create a platform staff account</h2>
   <p className="text-sm text-muted-foreground">An invitation will be sent to the new user's email. No shared password is generated.</p>
   <div className="grid gap-3 sm:grid-cols-2">
    <div className="space-y-1"><Label>Full name</Label><Input value={name} maxLength={200} onChange={e=>setName(e.target.value)}/></div>
    <div className="space-y-1"><Label>Email address</Label><Input type="email" value={email} maxLength={254} onChange={e=>setEmail(e.target.value)}/></div>
   </div>
   <div className="space-y-1"><Label>Role</Label><select className="w-full rounded-md border bg-background p-2" value={role} onChange={e=>setRole(e.target.value as Role)}>
    {roleOptions.map(r=><option key={r} value={r}>{r[0].toUpperCase()+r.slice(1)}</option>)}
   </select></div>
   <div className="space-y-1"><Label>Reason for adding this user</Label><Input value={reason} maxLength={1000} onChange={e=>setReason(e.target.value)}/></div>
   <Button disabled={busy||name.trim().length<2||!/^\S+@\S+\.\S+$/.test(email)||reason.trim().length<15} onClick={invite}>Invite staff user</Button>
  </Card>
  <Card className="space-y-3 p-5"><h2 className="font-semibold">Platform users</h2>
   {users.error&&<p className="text-destructive">Unable to load staff accounts.</p>}
   {(users.data??[]).map((u:any)=><div key={u.id} className="flex flex-wrap items-center justify-between gap-3 border-b py-3 text-sm">
    <div><p className="font-medium">{u.full_name||"Staff member"}</p><p className="text-xs text-muted-foreground">{u.email} · {u.is_saas_admin?"SaaS Admin":u.role||"No platform role"} · {u.is_active?"Active":"Inactive"}</p></div>
    {!u.is_saas_admin&&<Button size="sm" variant="outline" onClick={()=>{setEditing(u);setEditRole(u.role||"viewer");setEditReason("");}}>Change role</Button>}
   </div>)}
   {editing&&<div className="space-y-3 rounded-md border p-4">
    <h3 className="font-semibold">Change role: {editing.email}</h3>
    <select className="w-full rounded-md border bg-background p-2" value={editRole} onChange={e=>setEditRole(e.target.value)}>
     {roleOptions.map(r=><option key={r} value={r}>{r}</option>)}<option value="none">Remove platform staff role</option>
    </select>
    <div className="space-y-1"><Label>Reason</Label><Input value={editReason} maxLength={1000} onChange={e=>setEditReason(e.target.value)}/></div>
    <div className="flex gap-2"><Button disabled={busy||editReason.trim().length<15} onClick={save}>Apply and audit</Button><Button variant="outline" onClick={()=>setEditing(null)}>Cancel</Button></div>
   </div>}
  </Card>
  <Card className="space-y-3 p-5"><h2 className="font-semibold">Role permissions</h2>
   <p className="text-sm text-muted-foreground">Role access is checked on the server for each operation. Staff roles do not receive the SaaS Admin authentication or cross-business edit powers.</p>
   {Object.entries(roles.data??{}).map(([name,permissions])=><div className="border-b py-2 text-sm" key={name}><strong className="capitalize">{name}</strong><p className="text-xs text-muted-foreground">{(permissions as string[]).join(" · ")}</p></div>)}
  </Card>
 </div>;
}
