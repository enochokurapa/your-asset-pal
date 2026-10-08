import {useEffect,useState} from "react";
import {createFileRoute} from "@tanstack/react-router";
import {useServerFn} from "@tanstack/react-start";
import {useAuth} from "@/hooks/use-auth";
import {getServerAuthHeaders} from "@/lib/auth-headers";
import {listBuilderDefinitions,saveBuilderDefinition,archiveBuilderDefinition} from "@/lib/builders.functions";
import {Card} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from "@/components/ui/select";
import {Switch} from "@/components/ui/switch";
import {toast} from "sonner";
import {Plus,Save,Archive,LockKeyhole} from "lucide-react";

export const Route=createFileRoute("/_app/builders")({
 validateSearch:(s:Record<string,unknown>)=>({type:typeof s.type==="string"?s.type:undefined}),
 component:BuildersPage,
});
const definitions=[
 {key:"register_builder",label:"Register Builder",purpose:"Design additional asset register columns and saved register layouts."},
 {key:"report_builder",label:"Report Builder",purpose:"Save column, filter, grouping and calculation specifications."},
 {key:"form_builder",label:"Form Builder",purpose:"Design category-specific data capture forms and required fields."},
 {key:"dashboard_builder",label:"Dashboard Builder",purpose:"Compose saved KPI, report and chart widget layouts."},
 {key:"document_builder",label:"Document Builder",purpose:"Define document templates and dynamic placeholders."},
] as const;
type Kind=typeof definitions[number]["key"];
type Field={id:string,label:string,key:string,type:string,required:boolean};
type Definition={id:string,name:string,description:string,is_active:boolean,configuration:{fields?:Field[],source?:string},updated_at:string};
const types=["text","number","date","currency","select","boolean","attachment"] as const;
const protectedKeys=new Set(["id","tenant_id","asset_id","asset_tag","purchase_value","purchase_date","status","created_at","updated_at"]);
const slug=(v:string)=>v.toLowerCase().trim().replace(/[^a-z0-9]+/g,"_").replace(/^_+|_+$/g,"").slice(0,50);

function BuildersPage(){
 const {isTenantAdmin,isSaasAdmin,isPaidFeature,isAddOnFeature,canView}=useAuth();
 const search=Route.useSearch();
 const initial=definitions.some(d=>d.key===search.type)?search.type as Kind:"register_builder";
 const [kind,setKind]=useState<Kind>(initial);
 const [items,setItems]=useState<Definition[]>([]);
 const [selected,setSelected]=useState<string|null>(null);
 const [name,setName]=useState("");
 const [description,setDescription]=useState("");
 const [source,setSource]=useState("assets");
 const [fields,setFields]=useState<Field[]>([]);
 const [draftLabel,setDraftLabel]=useState("");
 const [draftType,setDraftType]=useState("text");
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const list=useServerFn(listBuilderDefinitions);
 const save=useServerFn(saveBuilderDefinition);
 const archive=useServerFn(archiveBuilderDefinition);
 const allowed=canView(kind);
 const locked=isPaidFeature(kind)||isAddOnFeature(kind);
 useEffect(()=>{setKind(initial)},[initial]);
 useEffect(()=>{
   let valid=true;
   setItems([]);setSelected(null);setName("");setDescription("");setFields([]);setError("");
   if(!allowed||!isTenantAdmin||isSaasAdmin)return;
   setBusy(true);
   getServerAuthHeaders().then(headers=>list({data:{kind},headers})).then(rows=>{
     if(valid){if(!Array.isArray(rows))throw Error("Unexpected response from server");setItems(rows as Definition[]);}
   }).catch(e=>{if(valid)setError(e?.message||"Unable to load definitions")})
     .finally(()=>{if(valid)setBusy(false)});
   return()=>{valid=false};
 },[kind,allowed,isTenantAdmin,isSaasAdmin,list]);
 const choose=(d:Definition)=>{
   setSelected(d.id);setName(d.name);setDescription(d.description||"");setSource(d.configuration?.source||"assets");
   setFields(Array.isArray(d.configuration?.fields)?d.configuration.fields:[]);
 };
 const addField=()=>{
   const key=slug(draftLabel);
   if(!key||protectedKeys.has(key)||fields.some(f=>f.key===key)){
     toast.error("Choose a unique field name that does not replace a system field.");return;
   }
   setFields(p=>[...p,{id:crypto.randomUUID(),label:draftLabel.trim(),key,type:draftType,required:false}]);
   setDraftLabel("");
 };
 const persist=async()=>{
   if(name.trim().length<2){toast.error("Enter a name of at least 2 characters.");return;}
   setBusy(true);
   try{
     const headers=await getServerAuthHeaders();
     await save({headers,data:{kind,id:selected||undefined,name:name.trim(),description,
       configuration:{source,fields},is_active:true}});
     const rows=await list({headers,data:{kind}});
     setItems(rows as Definition[]);setError("");toast.success("Builder configuration saved.");
   }catch(e:any){setError(e?.message||"Save failed");toast.error(e?.message||"Save failed");}
   finally{setBusy(false);}
 };
 const deactivate=async()=>{
   if(!selected)return;
   setBusy(true);
   try{const headers=await getServerAuthHeaders();
     await archive({headers,data:{kind,id:selected}});
     setItems((p)=>p.map(x=>x.id===selected?{...x,is_active:false}:x));
     setSelected(null);setName("");setFields([]);toast.success("Configuration archived.");
   }catch(e:any){toast.error(e?.message||"Could not archive");}
   finally{setBusy(false);}
 };
 if(isSaasAdmin)return <Card className="p-6">Builder configurations are managed inside business workspaces. Use Global Modules to enable them.</Card>;
 if(!isTenantAdmin)return <Card className="p-6">Only business administrators may design builder configurations.</Card>;
 return <div className="space-y-5">
   <div><h1 className="text-2xl font-bold">Builders</h1><p className="text-sm text-muted-foreground">Each builder is independently controlled by SaaS Admin and by your business plan.</p></div>
   <div className="flex flex-wrap gap-2">{definitions.map(d=><Button key={d.key} variant={kind===d.key?"default":"outline"} onClick={()=>setKind(d.key)}>{d.label}</Button>)}</div>
   <Card className="p-5 space-y-4">
     <div><h2 className="font-semibold">{definitions.find(d=>d.key===kind)?.label}</h2><p className="text-sm text-muted-foreground">{definitions.find(d=>d.key===kind)?.purpose}</p></div>
     {!allowed?<div className="flex items-center gap-2 rounded-lg border p-4 text-sm"><LockKeyhole className="h-4 w-4"/>{locked?"This builder is not enabled for your current plan or business.":"This builder is disabled. Ask the SaaS administrator to enable it."}</div>:<>
       {error&&<p role="alert" className="rounded-md border border-destructive p-3 text-sm text-destructive">{error}</p>}
       <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
         <div className="space-y-2"><Button variant="outline" className="w-full" onClick={()=>{setSelected(null);setName("");setDescription("");setFields([])}}><Plus className="mr-2 h-4 w-4"/>New configuration</Button>
           {items.map(item=><button key={item.id} onClick={()=>choose(item)} className={`block w-full rounded-md border p-3 text-left text-sm ${selected===item.id?"border-primary bg-primary/5":""}`}><span className="font-medium">{item.name}</span><span className="block text-xs text-muted-foreground">{item.is_active?"Active":"Archived"}</span></button>)}
         </div>
         <div className="space-y-4">
           <div className="grid gap-3 sm:grid-cols-2">
             <div className="space-y-1"><Label>Configuration name</Label><Input value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Hospital equipment register"/></div>
             <div className="space-y-1"><Label>Data source</Label><Select value={source} onValueChange={setSource}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{["assets","verification","depreciation","maintenance","movements","disposals"].map(x=><SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent></Select></div>
           </div>
           <div className="space-y-1"><Label>Description</Label><Input value={description} onChange={e=>setDescription(e.target.value)} placeholder="Purpose and intended users"/></div>
           <div className="rounded-lg border p-4 space-y-3">
             <div><h3 className="font-semibold">Fields / columns / widgets</h3><p className="text-xs text-muted-foreground">Configure the fields for this builder. System-controlled asset identifiers and financial fields cannot be replaced.</p></div>
             {fields.map(f=><div key={f.id} className="flex flex-wrap items-center gap-2 border-b pb-2">
               <span className="flex-1 text-sm">{f.label} <span className="text-xs text-muted-foreground">({f.type})</span></span>
               <label className="flex items-center gap-2 text-xs">Required <Switch checked={f.required} onCheckedChange={v=>setFields(p=>p.map(x=>x.id===f.id?{...x,required:v}:x))}/></label>
               <Button size="sm" variant="ghost" onClick={()=>setFields(p=>p.filter(x=>x.id!==f.id))}>Remove</Button>
             </div>)}
             <div className="flex flex-wrap gap-2"><Input className="min-w-40 flex-1" value={draftLabel} onChange={e=>setDraftLabel(e.target.value)} placeholder="New field or widget"/>
               <Select value={draftType} onValueChange={setDraftType}><SelectTrigger className="w-40"><SelectValue/></SelectTrigger><SelectContent>{types.map(t=><SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select>
               <Button variant="outline" onClick={addField} disabled={!draftLabel.trim()}><Plus className="mr-1 h-4 w-4"/>Add</Button>
             </div>
           </div>
           <div className="flex gap-2"><Button onClick={persist} disabled={busy}><Save className="mr-2 h-4 w-4"/>Save configuration</Button>{selected&&<Button variant="outline" onClick={deactivate} disabled={busy}><Archive className="mr-2 h-4 w-4"/>Archive</Button>}</div>
         </div>
       </div>
     </>}
   </Card>
 </div>;
}
