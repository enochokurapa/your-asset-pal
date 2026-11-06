import {createFileRoute,Navigate} from "@tanstack/react-router";
import {useState,useEffect} from "react";
import {useQuery,useQueryClient} from "@tanstack/react-query";
import {useServerFn} from "@tanstack/react-start";
import {useAuth} from "@/hooks/use-auth";
import {getServerAuthHeaders} from "@/lib/auth-headers";
import {getAdminSocialLinks,updateAdminSocialLink,type SocialLink} from "@/lib/platform-social.functions";
import {Card} from "@/components/ui/card";
import {Input} from "@/components/ui/input";
import {Button} from "@/components/ui/button";
import {toast} from "sonner";

export const Route=createFileRoute("/_app/saas-admin/social-links")({component:SocialSettingsPage});
function SocialEditor({entry,onSaved}:{entry:SocialLink;onSaved:()=>Promise<void>}){
 const save=useServerFn(updateAdminSocialLink);
 const [form,setForm]=useState(entry),[busy,setBusy]=useState(false);
 useEffect(()=>setForm(entry),[entry]);
 const isWhatsApp=entry.platform==="whatsapp";
 const value=isWhatsApp?form.url.replace(/^https:\/\/wa\.me\//,""):form.url;
 return <Card className="min-w-0 space-y-3 p-4 sm:p-5">
   <div className="flex flex-wrap items-center justify-between gap-3">
     <h2 className="text-base font-semibold capitalize">{entry.platform==="x"?"X (Twitter)":entry.platform}</h2>
     <label className="flex items-center gap-2 text-sm">
       <input type="checkbox" checked={form.is_active} onChange={e=>setForm({...form,is_active:e.target.checked})}/>
       {form.is_active?"Visible":"Hidden"}
     </label>
   </div>
   <label className="block text-xs font-medium">{isWhatsApp?"International WhatsApp number":"Official social profile URL"}
    <Input className="mt-1" maxLength={500} type="text"
      inputMode={isWhatsApp?"tel":"url"}
      placeholder={isWhatsApp?"256772123456":"https://"+entry.platform+".com/your-profile"}
      value={value} onChange={e=>setForm({...form,url:e.target.value})}/>
   </label>
   {isWhatsApp&&<p className="text-xs leading-5 text-muted-foreground">
     Enter an international number such as 256772123456. The public floating icon will open a direct WhatsApp conversation using the saved number.
   </p>}
   <div className="flex flex-wrap items-center justify-between gap-2">
     <label className="flex items-center gap-2 text-xs">Display order
       <Input className="w-20" type="number" min={0} max={100} value={form.sort_order}
         onChange={e=>setForm({...form,sort_order:Number(e.target.value)})}/>
     </label>
     <Button size="sm" disabled={busy||form.is_active&&!value.trim()} onClick={async()=>{
       setBusy(true);
       try{await save({headers:await getServerAuthHeaders(),data:{...form,url:value.trim()}});
         toast.success("Social link saved");await onSaved();
       }catch(error:any){toast.error(error?.message||"Unable to save social link");}
       finally{setBusy(false);}
     }}>{busy?"Saving…":"Save"}</Button>
   </div>
 </Card>;
}
function SocialSettingsPage(){
 const {loading,isSaasAdmin}=useAuth();
 const get=useServerFn(getAdminSocialLinks),qc=useQueryClient();
 const {data=[],error,isLoading}=useQuery({queryKey:["admin-social-links"],enabled:isSaasAdmin,
   queryFn:async()=>get({headers:await getServerAuthHeaders()})});
 if(loading)return null;
 if(!isSaasAdmin)return <Navigate to="/dashboard"/>;
 return <main className="mx-auto max-w-5xl min-w-0 space-y-5">
   <div><h1 className="text-xl font-semibold sm:text-2xl">WhatsApp & social media</h1>
     <p className="mt-2 text-sm leading-6 text-muted-foreground">Manage your official social profiles and the floating WhatsApp support button. Disabled links do not appear publicly. No destination is published until you configure it.</p></div>
   {error&&<p className="text-sm text-destructive">Social media settings could not be loaded.</p>}
   {isLoading&&<p className="text-sm text-muted-foreground">Loading official links…</p>}
   <div className="grid min-w-0 gap-4 md:grid-cols-2">{data.map(entry=>
     <SocialEditor key={entry.platform} entry={entry} onSaved={async()=>{
       await Promise.all([
         qc.invalidateQueries({queryKey:["admin-social-links"]}),
         qc.invalidateQueries({queryKey:["public-social-links"]}),
       ]);
     }}/>)}</div>
 </main>;
}
