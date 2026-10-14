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
import {Plus,Save,Archive,LockKeyhole,ArrowUp,ArrowDown,Download,CheckCircle2} from "lucide-react";
import * as XLSX from "xlsx";
import {setActiveRegisterDefinition} from "@/lib/builders.functions";

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
 const activate=useServerFn(setActiveRegisterDefinition);
 const [activationPrompt,setActivationPrompt]=useState<string|null>(null);
 const [activeRegister,setActiveRegister]=useState<string|null>(null);
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
 const moveField=(id:string,step:number)=>setFields(previous=>{const next=[...previous];const index=next.findIndex(field=>field.id===id);const target=index+step;if(index<0||target<0||target>=next.length)return previous;[next[index],next[target]]=[next[target],next[index]];return next;});
 const downloadRegister=()=>{const columns=["asset_tag","name",...fields.map(f=>f.key)];const worksheet=XLSX.utils.aoa_to_sheet([columns]);const workbook=XLSX.utils.book_new();XLSX.utils.book_append_sheet(workbook,worksheet,"Assets");XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([["Field","Type","Required"],...fields.map(f=>[f.key,f.type,f.required?"Yes":"No"])]),"Field definitions");XLSX.writeFile(workbook,`${slug(name||"custom_register")||"custom_register"}_template.xlsx`);};
 const confirmActive=async(id:string|null)=>{setBusy(true);try{const headers=await getServerAuthHeaders();await activate({headers,data:{definitionId:id}});setActiveRegister(id);setActivationPrompt(null);toast.success(id?"Custom register set as primary.":"Default register restored.");}catch(e:any){toast.error(e?.message||"Unable to activate register");}finally{setBusy(false);}};
 const persist=async()=>{
   if(name.trim().length<2){toast.error("Enter a name of at least 2 characters.");return;}
   setBusy(true);
   try{
     const headers=await getServerAuthHeaders();
     const saved=await save({headers,data:{kind,id:selected||undefined,name:name.trim(),description,
       configuration:{source,fields},is_active:true}});
     const rows=await list({headers,data:{kind}});
     setItems(rows as Definition[]);setSelected(saved.id);setEditing(false);setError("");if(kind==="register_builder")setActivationPrompt(saved.id);toast.success("Template saved.");
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

 if(isSaasAdmin)return <Card className="p-4">Use SaaS Global Modules to manage builder availability.</Card>;
 if(!isTenantAdmin)return <Card className="p-4">Only business administrators can configure builders.</Card>;
 const previewField=(f:Field)=> f.type==="boolean" ? "☐" : f.type==="date" ? "DD/MM/YYYY" : f.type==="currency" ? "UGX 0" : f.type==="number" ? "0" : f.type==="select" ? "Choose option ▾" : f.type==="attachment" ? "Attach file" : "Enter "+f.label.toLowerCase();
 const active=definitions.find(d=>d.key===kind)!;
 return <div className="mx-auto w-full max-w-7xl space-y-3">
   <div className="flex flex-wrap items-center justify-between gap-2"><div><h1 className="text-xl font-bold">Builder Studio</h1><p className="text-xs text-muted-foreground">Add fields at the top. Your spreadsheet preview updates immediately below.</p></div><span className="text-xs text-muted-foreground">Preview only • Not published</span></div>
   <div className="flex flex-wrap items-center gap-1.5 rounded-lg border bg-card p-2">{definitions.map(d=><Button key={d.key} size="sm" variant={kind===d.key?"default":"ghost"} onClick={()=>setKind(d.key)} className="text-xs">{d.label.replace(" Builder","")}</Button>)}</div>
   {!allowed?<Card className="flex items-center gap-2 p-4 text-sm"><LockKeyhole className="h-4 w-4"/>{locked?"This builder is not included in your business plan.":"This builder is disabled by SaaS Admin."}</Card>:
   <div className="grid min-w-0 items-start gap-3">
     <Card className="min-w-0 space-y-3 p-4">
       <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-semibold">{active.label}</h2><p className="text-xs text-muted-foreground">{active.purpose}</p></div>
         <Button size="sm" variant="outline" onClick={()=>{setSelected(null);setName("");setDescription("");setSource("assets");setFields([]);setEditing(true)}}><Plus className="mr-1 h-3.5 w-3.5"/>New</Button>
       </div>
       {error&&<p className="rounded border border-destructive p-2 text-xs text-destructive" role="alert">{error}</p>}
       <div className="flex items-center gap-2"><Label className="whitespace-nowrap text-xs">Saved layouts</Label><Select value={selected??"new"} onValueChange={id=>{if(id==="new"){setSelected(null);setName("");setDescription("");setFields([])}else{const item=items.find(x=>x.id===id);if(item)choose(item)}}}><SelectTrigger className="h-8 flex-1"><SelectValue placeholder="New template"/></SelectTrigger><SelectContent><SelectItem value="new">New template</SelectItem>{items.map(item=><SelectItem key={item.id} value={item.id}>{item.name}{item.is_active?"":" (archived)"}</SelectItem>)}</SelectContent></Select></div>
       <div className="space-y-1"><Label className="text-xs">Template name</Label><Input className="h-9" value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Hospital equipment register"/></div>
       <div className="grid grid-cols-2 gap-2"><div className="min-w-0 space-y-1"><Label className="text-xs">Data source</Label><Select value={source} onValueChange={setSource}><SelectTrigger className="h-9"><SelectValue/></SelectTrigger><SelectContent>{["assets","verification","depreciation","maintenance","movements","disposals"].map(x=><SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent></Select></div><div className="min-w-0 space-y-1"><Label className="text-xs">Description (optional)</Label><Input className="h-9" value={description} onChange={e=>setDescription(e.target.value)} placeholder="Purpose"/></div></div>
       <div className="flex items-center justify-between border-t pt-3"><h3 className="text-sm font-semibold">Custom fields <span className="text-muted-foreground">({fields.length})</span></h3><span className="text-xs text-muted-foreground">See spreadsheet below ↓</span></div>
       <div className="max-h-48 space-y-1 overflow-auto">{fields.map(f=><div key={f.id} className="flex min-w-0 items-center gap-2 rounded border p-2 text-xs"><Input aria-label="Field label" className="h-8 min-w-24 flex-1" value={f.label} onChange={e=>setFields(p=>p.map(x=>x.id===f.id?{...x,label:e.target.value}:x))}/><Select value={f.type} onValueChange={value=>setFields(p=>p.map(x=>x.id===f.id?{...x,type:value}:x))}><SelectTrigger className="h-8 w-28"><SelectValue/></SelectTrigger><SelectContent>{types.map(t=><SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select><Button size="icon" variant="ghost" aria-label="Move field up" onClick={()=>moveField(f.id,-1)}><ArrowUp className="h-4 w-4"/></Button><Button size="icon" variant="ghost" aria-label="Move field down" onClick={()=>moveField(f.id,1)}><ArrowDown className="h-4 w-4"/></Button><label className="flex items-center gap-1">Required <Switch checked={f.required} onCheckedChange={v=>setFields(p=>p.map(x=>x.id===f.id?{...x,required:v}:x))}/></label><Button size="sm" variant="ghost" className="h-7 px-2" onClick={()=>setFields(p=>p.filter(x=>x.id!==f.id))}>Remove</Button></div>)}</div>
       <div className="flex flex-wrap gap-2"><Input className="h-9 min-w-32 flex-1" value={draftLabel} onChange={e=>setDraftLabel(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();addField()}}} placeholder="Field name"/><Select value={draftType} onValueChange={setDraftType}><SelectTrigger className="h-9 w-32"><SelectValue/></SelectTrigger><SelectContent>{types.map(t=><SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select><Button size="sm" variant="outline" className="h-9" onClick={addField} disabled={!draftLabel.trim()}><Plus className="h-4 w-4"/> Add</Button></div>
       <div className="flex items-center justify-between gap-2 border-t pt-3"><p className="text-xs text-muted-foreground">Saving stores this template; it does not change live assets.</p><div className="flex shrink-0 gap-2">{selected&&<Button variant="outline" size="sm" disabled={busy} onClick={deactivate}><Archive className="h-4 w-4"/></Button>}<Button size="sm" onClick={persist} disabled={busy}><Save className="mr-1 h-4 w-4"/>{busy?"Saving...":"Save"}</Button></div></div>
     </Card>
     <Card className="min-w-0 overflow-hidden p-4 lg:sticky lg:top-4">
       <div className="mb-3 flex items-center justify-between"><div><h2 className="font-semibold">Live preview</h2><p className="text-xs text-muted-foreground">{name.trim()||"Untitled template"}</p></div><span className="rounded-full bg-muted px-2 py-1 text-xs">{fields.length} custom fields</span></div>
       {(kind==="register_builder"||kind==="report_builder")?<div className="overflow-x-auto rounded border"><table className="w-full min-w-[420px] text-left text-xs"><thead className="bg-muted"><tr><th className="p-2">Asset Tag</th><th className="p-2">Asset Name</th>{fields.map(f=><th key={f.id} className="p-2">{f.label}</th>)}</tr></thead><tbody><tr><td className="border-t p-2">AF-001</td><td className="border-t p-2">Sample Laptop</td>{fields.map(f=><td key={f.id} className="border-t p-2 text-muted-foreground">{previewField(f)}</td>)}</tr></tbody></table></div>:
         kind==="dashboard_builder"?<div className="grid grid-cols-2 gap-2">{(fields.length?fields:[{id:"default",label:"Total Assets",type:"number",key:"default",required:false}]).map(f=><div key={f.id} className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">{f.label}</p><p className="mt-2 text-lg font-semibold">{f.type==="currency"?"UGX 0":"—"}</p></div>)}</div>:
         kind==="document_builder"?<div className="rounded border bg-background p-5"><h3 className="border-b pb-2 text-center font-semibold">{name||"Asset Document"}</h3><p className="my-3 text-xs">Organization: [Organization Name]</p>{fields.map(f=><p key={f.id} className="border-b py-2 text-xs">{f.label}: <span className="text-muted-foreground">[ {f.key} ]</span></p>)}<p className="mt-6 text-xs text-muted-foreground">Authorized signature: ______________</p></div>:
         <div className="space-y-3 rounded border p-4"><h3 className="text-sm font-semibold">{name||"New asset form"}</h3><div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1"><Label className="text-xs">Asset Name</Label><Input disabled placeholder="Enter asset name" className="h-9"/></div><div className="space-y-1"><Label className="text-xs">Asset Tag</Label><Input disabled placeholder="AF-001" className="h-9"/></div>{fields.map(f=><div className="space-y-1" key={f.id}><Label className="text-xs">{f.label}{f.required?" *":""}</Label><Input disabled className="h-9" placeholder={previewField(f)}/></div>)}</div></div>}
       {!fields.length&&<p className="mt-3 text-xs text-muted-foreground">Add fields on the left to see them appear here immediately.</p>}
       <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t pt-3"><p className="text-xs text-muted-foreground">The preview reflects your field order. Save the layout before activating it.</p>{kind==="register_builder"&&<Button variant="outline" size="sm" onClick={downloadRegister}><Download className="mr-1 h-4 w-4"/> Download this template</Button>}</div>
     </Card>
   </div>}
   {kind==="register_builder"&&activationPrompt&&<div role="dialog" aria-modal="true" aria-label="Activate custom register" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><Card className="w-full max-w-md space-y-4 p-6"><h2 className="text-lg font-semibold">Use this register as the primary layout?</h2><p className="text-sm text-muted-foreground">Your original default register and existing asset records will be retained. You can keep multiple named registers and download their individual templates.</p><div className="flex flex-wrap justify-end gap-2"><Button variant="outline" onClick={()=>setActivationPrompt(null)}>Keep current default</Button><Button disabled={busy} onClick={()=>confirmActive(activationPrompt)}><CheckCircle2 className="mr-1 h-4 w-4"/> Make primary</Button></div></Card></div>}
 </div>;
}
