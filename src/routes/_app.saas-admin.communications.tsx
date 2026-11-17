import {createFileRoute,Navigate} from "@tanstack/react-router";
import {useEffect,useState} from "react";
import {useAuth} from "@/hooks/use-auth";
import {getServerAuthHeaders} from "@/lib/auth-headers";
import {sendOperationsBroadcast,getOperationsAudience,getOperationsCampaigns} from "@/lib/platform-operations-notices.functions";
import {Card} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {toast} from "sonner";
import {Mail,Send,Paperclip} from "lucide-react";
export const Route=createFileRoute("/_app/saas-admin/communications")({component:CommunicationsPage});
type Scope="all"|"business"|"user";
type Attachment={name:string;mime:string;base64:string};
function CommunicationsPage(){
 const {loading,isSaasAdmin}=useAuth();
 const [scope,setScope]=useState<Scope>("business");
 const [tenantId,setTenantId]=useState("");
 const [userId,setUserId]=useState("");
 const [subject,setSubject]=useState("");
 const [body,setBody]=useState("");
 const [attachment,setAttachment]=useState<Attachment|undefined>();
 const [audience,setAudience]=useState<{tenants:{id:string;name:string}[];users:{id:string;name:string;email:string}[]}>({tenants:[],users:[]});
 const [campaigns,setCampaigns]=useState<{id:string;subject:string;scope:string;created_at:string;total:number;sent:number;failed:number}[]>([]);
 const [sending,setSending]=useState(false);
 const refresh=async()=>{
  const headers=await getServerAuthHeaders();
  const [a,c]=await Promise.all([getOperationsAudience({headers}),getOperationsCampaigns({headers})]);
  setAudience(a);setCampaigns(c);
 };
 useEffect(()=>{if(isSaasAdmin){void refresh().catch(()=>toast.error("Could not load communications"))}},[isSaasAdmin]);
 if(loading)return null;
 if(!isSaasAdmin)return <Navigate to="/dashboard"/>;
 const loadFile=async(file?:File)=>{
  setAttachment(undefined);
  if(!file)return;
  if(file.size>512*1024){toast.error("Attachments must be 512 KB or smaller");return;}
  const allowed=["application/pdf","image/jpeg","image/png","application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
  if(!allowed.includes(file.type)){toast.error("Attach PDF, PNG, JPG or DOCX only");return;}
  const base64=await new Promise<string>((resolve,reject)=>{
   const reader=new FileReader();
   reader.onload=()=>resolve(String(reader.result||"").split(",")[1]||"");
   reader.onerror=()=>reject(Error("Could not read attachment"));
   reader.readAsDataURL(file);
  });
  setAttachment({name:file.name,mime:file.type,base64});
 };
 const submit=async()=>{
  if(scope==="business"&&!tenantId){toast.error("Select a business");return;}
  if(scope==="user"&&!userId){toast.error("Select a user");return;}
  if(!window.confirm(scope==="all"?"Send this message to every active user?":"Confirm sending this notification?"))return;
  setSending(true);
  try{
   const headers=await getServerAuthHeaders();
   const r=await sendOperationsBroadcast({headers,data:{
    scope,tenantId:scope==="business"?tenantId:undefined,userId:scope==="user"?userId:undefined,
    subject,body,attachment
   }});
   toast.success("Queued for "+r.queued+" recipient"+(r.queued===1?"":"s")+". Delivery status is tracked below.");
   setSubject("");setBody("");setAttachment(undefined);
   await refresh();
  }catch(e:any){toast.error(e?.message||"Notification could not be queued")}
  finally{setSending(false)}
 };
 return <div className="mx-auto w-full max-w-5xl space-y-6">
  <header className="flex items-start gap-3">
   <span className="rounded-xl bg-primary/10 p-3"><Mail className="h-6 w-6 text-primary"/></span>
   <div><h1 className="text-2xl font-semibold">Business communications</h1>
    <p className="text-sm text-muted-foreground">Send trusted, branded AssetFlow Operations emails and workspace notifications.</p></div>
  </header>
  <Card className="space-y-5 p-4 sm:p-6">
   <div className="grid gap-4 md:grid-cols-2">
    <div className="space-y-2"><Label htmlFor="notice-scope">Recipients</Label>
     <select id="notice-scope" className="h-11 w-full rounded-md border bg-background px-3" value={scope} onChange={e=>setScope(e.target.value as Scope)}>
      <option value="business">Everyone in one business</option><option value="user">Specific user</option><option value="all">All active users</option>
     </select></div>
    {scope==="business"&&<div className="space-y-2"><Label htmlFor="notice-business">Business</Label>
     <select id="notice-business" className="h-11 w-full rounded-md border bg-background px-3" value={tenantId} onChange={e=>setTenantId(e.target.value)}>
      <option value="">Choose a business</option>{audience.tenants.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
     </select></div>}
    {scope==="user"&&<div className="space-y-2"><Label htmlFor="notice-user">User</Label>
     <select id="notice-user" className="h-11 w-full rounded-md border bg-background px-3" value={userId} onChange={e=>setUserId(e.target.value)}>
      <option value="">Choose a recipient</option>{audience.users.map(u=><option key={u.id} value={u.id}>{u.name} · {u.email}</option>)}
     </select></div>}
   </div>
   <div className="space-y-2"><Label htmlFor="notice-subject">Subject</Label>
    <Input id="notice-subject" className="h-11" maxLength={170} value={subject} onChange={e=>setSubject(e.target.value)} placeholder="Important update about your workspace"/></div>
   <div className="space-y-2"><Label htmlFor="notice-message">Message</Label>
    <textarea id="notice-message" className="min-h-44 w-full resize-y rounded-lg border bg-background px-3 py-3 text-sm leading-6 focus-visible:outline-primary" maxLength={6000} value={body} onChange={e=>setBody(e.target.value)} placeholder="Write a clear, helpful message to your customers..."/></div>
   <div className="space-y-2"><Label htmlFor="notice-file">Attachment (optional, maximum 512 KB)</Label>
    <Input id="notice-file" type="file" accept=".pdf,.png,.jpg,.jpeg,.docx" onChange={e=>{void loadFile(e.target.files?.[0]).catch(()=>toast.error("Attachment could not be loaded"))}}/>
    {attachment&&<p className="flex items-center gap-1 text-xs text-muted-foreground"><Paperclip className="h-3 w-3"/>{attachment.name}</p>}</div>
   <div className="flex justify-end"><Button disabled={sending||!subject.trim()||!body.trim()} onClick={submit}><Send className="mr-2 h-4 w-4"/>{sending?"Queueing…":"Send notification"}</Button></div>
  </Card>
  <Card className="space-y-3 p-4 sm:p-6">
   <div className="flex items-center justify-between"><h2 className="font-semibold">Delivery history</h2><Button variant="outline" size="sm" onClick={()=>void refresh()}>Refresh</Button></div>
   {campaigns.length===0?<p className="text-sm text-muted-foreground">No communications have been sent yet.</p>:
    <div className="space-y-2">{campaigns.map(c=><div key={c.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
     <div className="min-w-0"><p className="font-medium break-words">{c.subject}</p><p className="text-xs text-muted-foreground">{c.scope} · {new Date(c.created_at).toLocaleString()}</p></div>
     <p className="text-xs tabular-nums">{c.sent}/{c.total} delivered{c.failed>0? ` · ${c.failed} failed`:""}</p>
    </div>)}</div>}
  </Card>
 </div>;
}
