import { useEffect, useState } from "react";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, Link2, Plus, Save, Trash2 } from "lucide-react";
import { getServerAuthHeaders } from "@/lib/auth-headers";
import { useAuth } from "@/hooks/use-auth";
import { getAdminImportantLinks, saveImportantLink, deleteImportantLink, type ImportantLink } from "@/lib/platform-links.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/saas-admin/links")({ component: ImportantLinksPage });

type FormState = Omit<ImportantLink, "id"> & { id?: string };
const empty:FormState = { title:"", url:"", description:"", sort_order:0, is_active:true };

function ImportantLinksPage(){
 const {isSaasAdmin,loading}=useAuth();
 const fetchLinks=useServerFn(getAdminImportantLinks);
 const save=useServerFn(saveImportantLink);
 const remove=useServerFn(deleteImportantLink);
 const qc=useQueryClient();
 const {data:links=[],error,isLoading}=useQuery({
   queryKey:["admin-important-links"],queryFn:()=>fetchLinks(),enabled:isSaasAdmin,
 });
 const [form,setForm]=useState<FormState>(empty);
 const [busy,setBusy]=useState(false);
 useEffect(()=>{if(!form.id) setForm(old=>({...old,sort_order:links.length*10}));},[links.length,form.id]);
 if(loading)return null;
 if(!isSaasAdmin)return <Navigate to="/dashboard"/>;
 const update=(partial:Partial<FormState>)=>setForm(current=>({...current,...partial}));
 const refresh=async()=>{
   await qc.invalidateQueries({queryKey:["admin-important-links"]});
   await qc.invalidateQueries({queryKey:["public-important-links"]});
 };
 const persist=async()=>{
   setBusy(true);
   try {
     const headers=await getServerAuthHeaders();
     await save({data:{...form,title:form.title.trim(),url:form.url.trim(),description:form.description.trim()},headers});
     await refresh();setForm(empty);toast.success("Link saved");
   }catch(e:any){toast.error(e?.message||"Unable to save link");}
   finally{setBusy(false);}
 };
 const erase=async(id:string)=>{
   if(!window.confirm("Permanently delete this important link?"))return;
   setBusy(true);
   try{
     const headers=await getServerAuthHeaders();
     await remove({data:{id},headers});await refresh();
     if(form.id===id)setForm(empty);
     toast.success("Link deleted");
   }catch(e:any){toast.error(e?.message||"Unable to delete link");}
   finally{setBusy(false);}
 };
 return <div className="mx-auto max-w-5xl space-y-6">
   <div><h1 className="text-2xl font-semibold tracking-tight">Important links</h1>
   <p className="mt-1 text-sm text-muted-foreground">Manage secure links to your other systems and websites. Active links appear in the public footer.</p></div>
   <div className="grid min-w-0 gap-5 lg:grid-cols-[1fr_.9fr]">
     <Card className="min-w-0 p-5"><h2 className="flex items-center gap-2 text-base font-semibold"><Link2 className="h-4 w-4"/>Saved links</h2>
       {error&&<p className="mt-3 text-sm text-destructive">Could not load links.</p>}
       {isLoading?<p className="mt-3 text-sm text-muted-foreground">Loading…</p>
       :links.length===0?<p className="mt-3 text-sm text-muted-foreground">No links added yet.</p>
       :<ul className="mt-4 space-y-2">{links.map(link=><li key={link.id} className="min-w-0 rounded-xl border bg-background p-3">
         <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
           <div className="min-w-0 flex-1"><p className="break-words text-sm font-semibold">{link.title}</p>
           <a href={link.url} target="_blank" rel="noopener noreferrer" className="mt-1 block truncate text-xs text-primary hover:underline">{link.url} <ExternalLink className="inline h-3 w-3"/></a>
           <p className="mt-1 text-xs text-muted-foreground">{link.is_active?"Visible":"Hidden"} · Order {link.sort_order}</p></div>
           <div className="flex gap-1">
             <Button size="sm" variant="outline" disabled={busy} onClick={()=>setForm(link)}>Edit</Button>
             <Button size="icon" variant="ghost" aria-label={"Delete "+link.title} disabled={busy} onClick={()=>erase(link.id)}><Trash2 className="h-4 w-4"/></Button>
           </div>
         </div>
       </li>)}</ul>}
     </Card>
     <Card className="min-w-0 space-y-4 p-5"><h2 className="text-base font-semibold">{form.id?"Edit link":"Add a link"}</h2>
       <div className="space-y-1.5"><Label htmlFor="external-title">Title</Label><Input id="external-title" maxLength={80} value={form.title} onChange={e=>update({title:e.target.value})} placeholder="e.g. AROSOFT Labs"/></div>
       <div className="space-y-1.5"><Label htmlFor="external-url">Website URL</Label><Input id="external-url" type="url" value={form.url} onChange={e=>update({url:e.target.value})} placeholder="https://example.com"/></div>
       <div className="space-y-1.5"><Label htmlFor="external-description">Description (optional)</Label><Input id="external-description" maxLength={180} value={form.description} onChange={e=>update({description:e.target.value})}/></div>
       <div className="flex flex-wrap items-center gap-5">
         <div className="space-y-1.5"><Label htmlFor="external-order">Display order</Label><Input id="external-order" className="w-28" type="number" min={0} max={1000} value={form.sort_order} onChange={e=>update({sort_order:Number(e.target.value)})}/></div>
         <label className="mt-5 flex cursor-pointer items-center gap-2 text-sm"><input type="checkbox" checked={form.is_active} onChange={e=>update({is_active:e.target.checked})}/> Visible publicly</label>
       </div>
       <p className="text-xs text-muted-foreground">Only HTTPS websites are allowed. You may add up to 24 links and hide them without deleting them.</p>
       <div className="flex flex-wrap gap-2">
         <Button onClick={persist} disabled={busy||form.title.trim().length<2||!form.url.startsWith("https://")}><Save className="mr-2 h-4 w-4"/>{busy?"Saving…":"Save link"}</Button>
         <Button variant="outline" onClick={()=>setForm(empty)} disabled={busy}><Plus className="mr-2 h-4 w-4"/>New link</Button>
       </div>
     </Card>
   </div>
 </div>;
}
