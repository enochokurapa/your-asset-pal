import {createFileRoute,Navigate} from "@tanstack/react-router";
import {useState,useEffect} from "react";
import {useQuery,useQueryClient} from "@tanstack/react-query";
import {useServerFn} from "@tanstack/react-start";
import {useAuth} from "@/hooks/use-auth";
import {getServerAuthHeaders} from "@/lib/auth-headers";
import {getAdminContactRequests,getAdminContactMessages,setAdminContactStatus,
 saveAdminContactTemplate,sendAdminContactReply} from "@/lib/platform-contact.functions";
import {Card} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Textarea} from "@/components/ui/textarea";
import {toast} from "sonner";
import {Mail,Send,Inbox,BookOpen} from "lucide-react";

export const Route=createFileRoute("/_app/saas-admin/contact")({component:ContactInbox});
type Status="new"|"in_progress"|"waiting_for_customer"|"resolved"|"closed";
function ContactInbox(){
 const {loading,isSaasAdmin}=useAuth(),qc=useQueryClient();
 const get=useServerFn(getAdminContactRequests),getMessages=useServerFn(getAdminContactMessages);
 const setStatus=useServerFn(setAdminContactStatus),send=useServerFn(sendAdminContactReply),saveTemplate=useServerFn(saveAdminContactTemplate);
 const [selected,setSelected]=useState<string|null>(null);
 const [statusFilter,setStatusFilter]=useState("all");
 const [subject,setSubject]=useState("Re: {{subject}}"),[body,setBody]=useState("");
 const [sending,setSending]=useState(false);
 const [templateId,setTemplateId]=useState("");
 const [editing,setEditing]=useState(false);
 const [draftTemplate,setDraftTemplate]=useState({id:"",title:"",subject:"Re: {{subject}}",body:"",is_active:true});
 const {data,isLoading,error}=useQuery({queryKey:["platform-contact-inbox"],enabled:isSaasAdmin,
   queryFn:async()=>get({headers:await getServerAuthHeaders()}),refetchInterval:60_000});
 const {data:messages=[]}=useQuery({queryKey:["platform-contact-messages",selected],enabled:isSaasAdmin&&Boolean(selected),
   queryFn:async()=>getMessages({headers:await getServerAuthHeaders(),data:{id:selected!}})});
 const request=data?.requests.find(r=>r.id===selected);
 useEffect(()=>{if(!selected&&data?.requests.length)setSelected(data.requests[0].id)},[data,selected]);
 const refresh=async()=>{await Promise.all([
  qc.invalidateQueries({queryKey:["platform-contact-inbox"]}),
  qc.invalidateQueries({queryKey:["platform-contact-messages",selected]})
 ])};
 const formatLegacy=(v:string)=>v.replace(/\\\\n/g,"\n");
 const useTemplate=(id:string)=>{
  setTemplateId(id);
  const t=data?.templates.find(x=>x.id===id);
  if(t){setSubject(t.subject);setBody(formatLegacy(t.body));}
 };
 if(loading)return null;
 if(!isSaasAdmin)return <Navigate to="/dashboard"/>;
 const filtered=(data?.requests||[]).filter(r=>statusFilter==="all"||r.status===statusFilter);
 return <div className="mx-auto max-w-7xl min-w-0 space-y-5">
  <div className="flex flex-wrap items-center justify-between gap-3">
   <div><h1 className="flex items-center gap-2 text-xl font-semibold sm:text-2xl"><Inbox className="h-5 w-5 text-[#c47a4b]"/>Contact & support inbox</h1>
    <p className="mt-1 text-sm text-muted-foreground">Manage public enquiries, update case status and reply to contacts through the configured SMTP service.</p></div>
   <Button variant="outline" onClick={refresh}>Refresh</Button>
  </div>
  {error&&<p className="text-sm text-destructive">Unable to load contact enquiries.</p>}
  {isLoading&&<p className="text-sm text-muted-foreground">Loading requests…</p>}
  <div className="grid min-w-0 gap-4 lg:grid-cols-[320px_1fr]">
   <Card className="min-w-0 p-3 sm:p-4">
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="text-sm font-semibold">Enquiries ({data?.requests.length||0})</h2>
      <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)} className="max-w-[155px] rounded-md border bg-background p-1.5 text-xs">
       <option value="all">All statuses</option>
       {(["new","in_progress","waiting_for_customer","resolved","closed"] as const).map(v=><option key={v} value={v}>{v.replace(/_/g," ")}</option>)}
      </select>
    </div>
    <div className="max-h-[630px] space-y-2 overflow-y-auto">
     {filtered.map(r=><button type="button" key={r.id} onClick={()=>{setSelected(r.id);setTemplateId("");setSubject("Re: {{subject}}");setBody("");}}
       className={`w-full min-w-0 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50 ${selected===r.id?"border-[#c47a4b] bg-[#fff7f0]":"border-border"}`}>
      <span className="block truncate text-sm font-semibold">{r.subject}</span>
      <span className="mt-1 block truncate text-xs text-muted-foreground">{r.name} · {r.email}</span>
      <span className="mt-1 block text-xs capitalize text-[#996044]">{r.status.replace(/_/g," ")} · {new Date(r.created_at).toLocaleDateString()}</span>
     </button>)}
     {!filtered.length&&<p className="text-sm text-muted-foreground">No enquiries in this view.</p>}
    </div>
   </Card>
   <Card className="min-w-0 space-y-5 p-4 sm:p-6">
    {!request?<p className="text-sm text-muted-foreground">Select an enquiry to view and reply.</p>:<>
     <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
      <div className="min-w-0"><h2 className="break-words text-lg font-semibold">{request.subject}</h2>
       <p className="mt-1 break-all text-xs text-muted-foreground">{request.name} · {request.email}</p>
       <p className="mt-1 text-xs text-muted-foreground">Received {new Date(request.created_at).toLocaleString()}</p>
      </div>
      <select aria-label="Enquiry status" value={request.status} className="rounded-md border bg-background px-3 py-2 text-sm"
        onChange={async e=>{try{await setStatus({headers:await getServerAuthHeaders(),data:{id:request.id,status:e.target.value as Status}});toast.success("Status updated");await refresh()}catch(err:any){toast.error(err.message||"Unable to update status")}}}>
       {(["new","in_progress","waiting_for_customer","resolved","closed"] as const).map(v=><option value={v} key={v}>{v.replace(/_/g," ")}</option>)}
      </select>
     </div>
     <div className="rounded-xl border bg-muted/25 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Original message</p>
      <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">{request.message}</p>
     </div>
     {messages.length>0&&<div className="space-y-2">
      <h3 className="text-sm font-semibold">Reply history</h3>
      {messages.map(m=><div key={m.id} className="rounded-lg border p-3">
       <div className="flex flex-wrap justify-between gap-2"><span className="text-xs font-semibold">{m.subject}</span>
       <span className="text-xs capitalize text-muted-foreground">{m.delivery_status} · {new Date(m.created_at).toLocaleString()}</span></div>
       <p className="mt-2 whitespace-pre-wrap break-words text-xs leading-5">{formatLegacy(m.body)}</p>
       {m.delivery_status==="failed"&&m.delivery_error&&<p className="mt-2 rounded-md bg-red-50 px-2 py-1 text-xs text-red-700">{m.delivery_error}</p>}
      </div>)}
     </div>}
     <div className="space-y-3 border-t pt-5">
      <h3 className="flex items-center gap-2 text-sm font-semibold"><Mail className="h-4 w-4"/>Reply directly by email</h3>
      <label className="block text-xs font-medium">Template
       <select className="mt-1 h-10 w-full rounded-md border bg-background px-2 text-sm" value={templateId}
         onChange={e=>useTemplate(e.target.value)}>
        <option value="">Write a custom reply</option>
        {(data?.templates||[]).filter(t=>t.is_active).map(t=><option key={t.id} value={t.id}>{t.title}</option>)}
       </select>
      </label>
      <label className="block text-xs font-medium">Email subject
       <Input className="mt-1" maxLength={180} value={subject} onChange={e=>setSubject(e.target.value)}/>
      </label>
      <label className="block text-xs font-medium">Reply content
       <Textarea className="mt-1" rows={7} maxLength={6000} value={body} onChange={e=>setBody(e.target.value)}
         placeholder="Write a response. Use {{name}} and {{subject}} as placeholders."/>
      </label>
      <Button disabled={sending||body.trim().length<2||subject.trim().length<3}
       onClick={async()=>{
        if(!window.confirm(`Send this reply to ${request.email}?`))return;
        setSending(true);
        try{await send({headers:await getServerAuthHeaders(),data:{id:request.id,subject,body}});
         toast.success("Reply accepted by SMTP");setBody("");await refresh();
        }catch(err:any){toast.error(err.message||"Reply was not delivered");await refresh();}
        finally{setSending(false)}
       }}><Send className="mr-2 h-4 w-4"/>{sending?"Sending…":"Send email reply"}</Button>
      <p className="text-xs leading-5 text-muted-foreground">Replies are saved in the case history. If SMTP fails, the message shows as failed rather than sent. An SMTP acceptance is not proof of delivery to the recipient's inbox.</p>
     </div>
    </>}
   </Card>
  </div>
  <Card className="space-y-4 p-4 sm:p-6">
   <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="flex items-center gap-2 text-base font-semibold"><BookOpen className="h-4 w-4"/>Response templates</h2>
    <Button variant="outline" size="sm" onClick={()=>{setEditing(v=>!v);setDraftTemplate({id:"",title:"",subject:"Re: {{subject}}",body:"",is_active:true})}}>{editing?"Close editor":"Add template"}</Button>
   </div>
   <div className="flex flex-wrap gap-2">
    {(data?.templates||[]).map(t=><Button variant="outline" key={t.id} size="sm" onClick={()=>{setDraftTemplate(t);setEditing(true)}}>{t.title}</Button>)}
   </div>
   {editing&&<div className="space-y-3">
    <label className="block text-xs font-medium">Template name<Input className="mt-1" value={draftTemplate.title} maxLength={90} onChange={e=>setDraftTemplate(v=>({...v,title:e.target.value}))}/></label>
    <label className="block text-xs font-medium">Subject<Input className="mt-1" value={draftTemplate.subject} maxLength={180} onChange={e=>setDraftTemplate(v=>({...v,subject:e.target.value}))}/></label>
    <label className="block text-xs font-medium">Content<Textarea className="mt-1" rows={6} maxLength={6000} value={draftTemplate.body} onChange={e=>setDraftTemplate(v=>({...v,body:e.target.value}))}/></label>
    <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={draftTemplate.is_active} onChange={e=>setDraftTemplate(v=>({...v,is_active:e.target.checked}))}/> Available in reply selection</label>
    <Button disabled={draftTemplate.title.trim().length<3||draftTemplate.subject.trim().length<3||draftTemplate.body.trim().length<10} onClick={async()=>{
     try{await saveTemplate({headers:await getServerAuthHeaders(),data:{
      ...(draftTemplate.id?{id:draftTemplate.id}:{}),title:draftTemplate.title,subject:draftTemplate.subject,body:formatLegacy(draftTemplate.body),is_active:draftTemplate.is_active,
     }});toast.success("Template saved");setEditing(false);await refresh();}
     catch(err:any){toast.error(err.message||"Unable to save template")}
    }}>Save template</Button>
   </div>}
  </Card>
 </div>;
}
