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
 const [editing,setEditing]=useState(false);
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
   setItems([]);setSelected(null);setName("");setDescription("");setFields([]);setError("");setEditing(false);
   if(!allowed||!isTenantAdmin||isSaasAdmin)return;
   setBusy(true);
   getServerAuthHeaders().then(headers=>list({data:{kind},headers})).then(rows=>{
     if(valid){if(!Array.isArray(rows))throw Error("Unexpected response from server");setItems(rows as Definition[]);}
   }).catch(e=>{if(valid)setError(e?.message||"Unable to load definitions")})
     .finally(()=>{if(valid)setBusy(false)});
   return()=>{valid=false};
 },[kind,allowed,isTenantAdmin,isSaasAdmin,list]);
 const choose=(d:Definition)=>{
   setEditing(true);
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
     setItems(rows as Definition[]);setEditing(false);setError("");toast.success("Template saved.");
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
   <div><h1 className="text-2xl font-bold">Builders</h1><p className="text-sm text-muted-foreground">Choose what you want to customize. Create and save templates in two simple steps.</p></div>
   <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{definitions.map(d=><button key={d.key} onClick={()=>{setKind(d.key);setEditing(false)}} className={`rounded-xl border bg-card p-4 text-left hover:border-primary ${kind===d.key?"border-primary ring-1 ring-primary":""}`}><div className="font-semibold">{d.label}</div><p className="mt-2 text-xs text-muted-foreground">{d.purpose}</p><span className="mt-3 inline-block text-xs text-primary">{canView(d.key)?"Available":"Not enabled"}</span></button>)}</div>
   <Card className="p-5 space-y-4">
     <div><h2 className="font-semibold">{definitions.find(d=>d.key===kind)?.label}</h2><p className="text-sm text-muted-foreground">{definitions.find(d=>d.key===kind)?.purpose}</p></div>
     {!allowed?<div className="flex items-center gap-2 rounded-lg border p-4 text-sm"><LockKeyhole className="h-4 w-4"/>{locked?"This builder is not enabled for your current plan or business.":"This builder is disabled. Ask the SaaS administrator to enable it."}</div>:<>
       {error&&<p role="alert" className="rounded-md border border-destructive p-3 text-sm text-destructive">{error}</p>}
       {!editing ? <div className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold">Saved templates</h3><Button onClick={()=>{setSelected(null);setName("");setDescription("");setFields([]);setEditing(true)}}><Plus className="mr-2 h-4 w-4"/>Create new {kind.replace("_builder","").replace("_"," ")}</Button></div>{!busy && !items.length && <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">Nothing created yet. Use Create new to begin.</p>}<div className="grid gap-3 sm:grid-cols-2">{items.map(item=><button key={item.id} onClick={()=>choose(item)} className="rounded-lg border p-4 text-left hover:border-primary"><strong>{item.name}</strong><p className="mt-2 text-xs text-muted-foreground">{item.description || "Click to edit"} · {item.configuration?.fields?.length||0} items</p></button>)}</div></div> : <div className="space-y-5"><Button variant="outline" onClick={()=>setEditing(false)}>← Back to saved templates</Button><div className="grid gap-5 lg:grid-cols-[220px_1fr]">
         <div className="space-y-2"><p className="text-sm font-medium">Your saved templates</p><Button variant="outline" className="w-full" onClick={()=>{setSelected(null);setName("");setDescription("");setFields([])}}><Plus className="mr-2 h-4 w-4"/>Start fresh</Button>
           {items.map(item=><button key={item.id} onClick={()=>choose(item)} className={`block w-full rounded-md border p-3 text-left text-sm ${selected===item.id?"border-primary bg-primary/5":""}`}><span className="font-medium">{item.name}</span><span className="block text-xs text-muted-foreground">{item.is_active?"Active":"Archived"}</span></button>)}
         </div>
         <div className="space-y-4">
           <div className="grid gap-3 sm:grid-cols-2">
             <div className="space-y-1"><Label>Step 1 — Give this template a name</Label><Input value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Hospital equipment register"/></div>
             <div className="space-y-1"><Label>Choose information source</Label><Select value={source} onValueChange={setSource}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{["assets","verification","depreciation","maintenance","movements","disposals"].map(x=><SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent></Select></div>
           </div>
           <div className="space-y-1"><Label>Purpose (optional)</Label><Input value={description} onChange={e=>setDescription(e.target.value)} placeholder="Purpose and intended users"/></div>
           <div className="rounded-lg border p-4 space-y-3">
             <div><h3 className="font-semibold">Step 2 — Add items to your template</h3><p className="text-xs text-muted-foreground">Configure the fields for this builder. System-controlled asset identifiers and financial fields cannot be replaced.</p></div>
             {fields.map(f=><div key={f.id} className="flex flex-wrap items-center gap-2 border-b pb-2">
               <span className="flex-1 text-sm">{f.label} <span className="text-xs text-muted-foreground">({f.type})</span></span>
               <label className="flex items-center gap-2 text-xs">Required <Switch checked={f.required} onCheckedChange={v=>setFields(p=>p.map(x=>x.id===f.id?{...x,required:v}:x))}/></label>
               <Button size="sm" variant="ghost" onClick={()=>setFields(p=>p.filter(x=>x.id!==f.id))}>Remove</Button>
             </div>)}
             <div className="flex flex-wrap gap-2"><Input className="min-w-40 flex-1" value={draftLabel} onChange={e=>setDraftLabel(e.target.value)} placeholder="Enter a field name, e.g. Warranty expiry"/>
               <Select value={draftType} onValueChange={setDraftType}><SelectTrigger className="w-40"><SelectValue/></SelectTrigger><SelectContent>{types.map(t=><SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select>
               <Button variant="outline" onClick={addField} disabled={!draftLabel.trim()}><Plus className="mr-1 h-4 w-4"/>Add</Button>
             </div>
           </div>
           <p className="text-xs text-muted-foreground">This saves a configuration template; it does not yet change live forms or reports.</p><div className="flex gap-2"><Button onClick={persist} disabled={busy}><Save className="mr-2 h-4 w-4"/>Save configuration</Button>{selected&&<Button variant="outline" onClick={deactivate} disabled={busy}><Archive className="mr-2 h-4 w-4"/>Archive</Button>}</div>
         </div>
       </div></div>
     </>}
   </Card>
 </div>;
}
