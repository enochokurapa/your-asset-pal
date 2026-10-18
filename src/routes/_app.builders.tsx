import {supabase} from "@/integrations/supabase/client";
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
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from "@/components/ui/dialog";
import {toast} from "sonner";
import {Plus,Save,Archive,LockKeyhole,ArrowUp,ArrowDown,Download,CheckCircle2,GripVertical, Type, Hash, CalendarDays, ListChecks, ToggleLeft, Paperclip, Coins, ChevronRight, ChevronLeft, Settings2, PanelLeft, Eye, Pencil, Trash2} from "lucide-react";
import {downloadTemplate as downloadImportTemplate} from "@/lib/bulk-import";
import {LocationSettingsPanel} from "@/components/location-settings-panel";
import {VisualCanvasBuilder} from "@/components/visual-canvas-builder";
import {setActiveRegisterDefinition,getRegisterCatalog,getAssetTagSettings,saveAssetTagSettings,previewRegisterMigration,executeRegisterMigration,reverseRegisterMigration,listRegisterMigrations} from "@/lib/builders.functions";

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
type Field={id:string,label:string,key:string,type:string,required:boolean,options?:string[],section?:string};
type Definition={id:string,name:string,description:string,is_active:boolean,configuration:{fields?:Field[],source?:string},updated_at:string};
const types=["text","textarea","email","phone","url","number","date","currency","select","radio","boolean","attachment"] as const;
function ChoiceEditor({options,onChange}:{options:string[],onChange:(next:string[])=>void}){
 const [draft,setDraft]=useState("");
 const add=()=>{const value=draft.trim();if(!value)return;if(options.some(x=>x.toLowerCase()===value.toLowerCase())){toast.error("Choice already exists");return;}onChange([...options,value]);setDraft("")};
 return <div className="space-y-2"><Label>Choices</Label><div className="space-y-2">{options.map((option,index)=><div key={index} className="flex items-center gap-2"><Input aria-label={`Edit choice ${index+1}`} className="h-10" value={option} onChange={e=>onChange(options.map((x,i)=>i===index?e.target.value:x))}/><Button size="icon" variant="outline" aria-label="Remove choice" onClick={()=>onChange(options.filter((_,i)=>i!==index))}><Trash2 className="h-4 w-4"/></Button></div>)}</div><div className="flex gap-2"><Input className="h-11" aria-label="New choice" placeholder="Type a choice then press Enter" value={draft} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();add()}}}/><Button type="button" onClick={add}><Plus className="h-4 w-4"/></Button></div><p className="text-xs text-muted-foreground">Enter adds one choice. Edit or remove choices above.</p></div>
}
const protectedKeys=new Set(["id","tenant_id","asset_id","asset_tag","purchase_value","purchase_date","status","created_at","updated_at"]);
const slug=(v:string)=>v.toLowerCase().trim().replace(/[^a-z0-9]+/g,"_").replace(/^_+|_+$/g,"").slice(0,50);

function BuildersPage(){
 const {isTenantAdmin,isSaasAdmin,isPaidFeature,isAddOnFeature,canView}=useAuth();
 const search=Route.useSearch();
 const initial=definitions.some(d=>d.key===search.type)?search.type as Kind:"register_builder";
 const [kind,setKind]=useState<Kind>(initial);
 const [showLocationBuilder,setShowLocationBuilder]=useState(false);
 const [editing,setEditing]=useState(false);
 const [items,setItems]=useState<Definition[]>([]);
 const [selected,setSelected]=useState<string|null>(null);
 const [name,setName]=useState("");
 const [description,setDescription]=useState("");
 const [source,setSource]=useState("assets");
 const [tagPolicy,setTagPolicy]=useState<"optional"|"required"|"automatic">("optional");
 const [fields,setFields]=useState<Field[]>([]);
 const [dragging,setDragging]=useState<string|null>(null);
 const [draftLabel,setDraftLabel]=useState("");
 const [draftType,setDraftType]=useState("text");
 const [step,setStep]=useState(2);
 const [focusField,setFocusField]=useState<string|null>(null);
 const [busy,setBusy]=useState(false);
 const [previewOpen,setPreviewOpen]=useState(false);
 const [archiveReason,setArchiveReason]=useState("");
 const [archiveOpen,setArchiveOpen]=useState(false);
 const [tablePreviewOpen,setTablePreviewOpen]=useState(false);
 const [error,setError]=useState("");
 const list=useServerFn(listBuilderDefinitions);
 const save=useServerFn(saveBuilderDefinition);
 const archive=useServerFn(archiveBuilderDefinition);
 const activate=useServerFn(setActiveRegisterDefinition);
 const catalog=useServerFn(getRegisterCatalog);
 const getTagSettings=useServerFn(getAssetTagSettings);
 const saveTagSettings=useServerFn(saveAssetTagSettings);
 const migrationPreview=useServerFn(previewRegisterMigration);
 const migrate=useServerFn(executeRegisterMigration);
 const undoMigration=useServerFn(reverseRegisterMigration);
 const migrationHistory=useServerFn(listRegisterMigrations);
 const [migrationOpen,setMigrationOpen]=useState(false);
 const [sourceRegister,setSourceRegister]=useState("default");
 const [targetRegister,setTargetRegister]=useState("");
 const [fieldMapping,setFieldMapping]=useState<Record<string,string>>({});
 const [unmappedPolicy,setUnmappedPolicy]=useState("preserve");
 const [migrationReview,setMigrationReview]=useState<{count:number,sourceName:string,targetName:string,unmapped:string[]}|null>(null);
 const [recentMigrations,setRecentMigrations]=useState<Array<{id:string,status:string,affected_count:number}>>([]);
 const [tagPrefix,setTagPrefix]=useState("AST");
 const [tagSeparator,setTagSeparator]=useState("-");
 const [tagPadding,setTagPadding]=useState(5);
 const [activationPrompt,setActivationPrompt]=useState<string|null>(null);
 const [activeRegister,setActiveRegister]=useState<string|null>(null);
 const [includeLocation,setIncludeLocation]=useState(true);
 const allowed=canView(kind);
 const locked=isPaidFeature(kind)||isAddOnFeature(kind);
 useEffect(()=>{setKind(initial)},[initial]);
 useEffect(()=>{
   let valid=true;
   setItems([]);setSelected(null);setName("");setDescription("");setFields([]);setError("");setEditing(false);setStep(2);
   if(!allowed||!isTenantAdmin||isSaasAdmin)return;
   setBusy(true);
   (kind==="register_builder" ? catalog({headers:await getServerAuthHeaders()}).then(c=>({data:c.definitions,error:null,catalog:c})) : supabase.rpc("my_builder_definitions" as any,{p_kind:kind})).then(async ({data:rows,error:catalogError,...rest})=>{ if(catalogError)throw new Error(catalogError.message);
     if(valid){if(!Array.isArray(rows))throw Error("Unexpected response from server");setItems(rows.filter((row):row is Definition=>Boolean(row&&typeof row==="object"&&typeof row.id==="string"&&typeof row.name==="string")).map(row=>({...row,configuration:{...((row.configuration&&typeof row.configuration==="object"&&!Array.isArray(row.configuration))?row.configuration:{}),fields:Array.isArray(row.configuration?.fields)?row.configuration.fields:[]}})));if(kind==="register_builder"){const c=(rest as any).catalog;if(c){setActiveRegister(c.primaryId??null);setIncludeLocation(c.includeLocation??true)}}}
   }).catch(e=>{if(valid)setError(e?.message||"Unable to load definitions")})
     .finally(()=>{if(valid)setBusy(false)});
   return()=>{valid=false};
 },[kind,allowed,isTenantAdmin,isSaasAdmin,list]);
 useEffect(()=>{if(kind!=="register_builder"||!isTenantAdmin)return;getServerAuthHeaders().then(headers=>getTagSettings({headers})).then(x=>{setTagPrefix(x.prefix);setTagSeparator(x.separator);setTagPadding(x.padding)}).catch(()=>{});},[kind,isTenantAdmin,getTagSettings]);
 const saveNumbering=async()=>{setBusy(true);try{const headers=await getServerAuthHeaders();await saveTagSettings({headers,data:{prefix:tagPrefix,separator:tagSeparator as "-"|"/"|"",padding:tagPadding}});toast.success("Tag numbering saved");}catch(e:any){toast.error(e?.message||"Unable to save numbering");}finally{setBusy(false)}};
 const currentTarget=items.find(x=>x.id===targetRegister);
 const currentSource=items.find(x=>x.id===sourceRegister);
 const sourceOptions=[{key:"core:asset_tag",label:"Original tag"},{key:"core:name",label:"Original asset name"},{key:"core:serial_number",label:"Serial number"},{key:"core:description",label:"Description"},{key:"core:purchase_date",label:"Purchase date"},{key:"core:purchase_value",label:"Purchase value"},{key:"core:status",label:"Status"},...(currentSource?.configuration?.fields??[]).map(f=>({key:"custom:"+f.key,label:f.label}))];
 const refreshMigrations=async()=>{try{const headers=await getServerAuthHeaders();setRecentMigrations(await migrationHistory({headers}))}catch(e:any){toast.error(e?.message||"Cannot load migration history")}};
 const prepareMigration=async()=>{if(!targetRegister||targetRegister===sourceRegister){toast.error("Choose a different destination register.");return;}setBusy(true);try{const headers=await getServerAuthHeaders();const review=await migrationPreview({headers,data:{sourceId:sourceRegister==="default"?null:sourceRegister,targetId:targetRegister,mapping:fieldMapping,policy:unmappedPolicy as "preserve"|"skip"}});setMigrationReview(review)}catch(e:any){toast.error(e?.message||"Migration preview failed")}finally{setBusy(false)}};
 const finishMigration=async()=>{if(!migrationReview)return;setBusy(true);try{const headers=await getServerAuthHeaders();const result=await migrate({headers,data:{sourceId:sourceRegister==="default"?null:sourceRegister,targetId:targetRegister,mapping:fieldMapping,policy:unmappedPolicy as "preserve"|"skip"}});toast.success(`Migrated ${result.affected_count} assets`);setMigrationReview(null);await refreshMigrations()}catch(e:any){toast.error(e?.message||"Migration failed")}finally{setBusy(false)}};
 const reverseMigration=async(id:string)=>{setBusy(true);try{const headers=await getServerAuthHeaders();const result=await undoMigration({headers,data:{migrationId:id}});toast.success(`Restored ${result.count} assets`);await refreshMigrations()}catch(e:any){toast.error(e?.message||"Unable to undo migration")}finally{setBusy(false)}};
 const startDefaultCustomization=()=>{
    setSelected(null);setName("New Asset Register");setDescription("");setSource("assets");
    setFields([]);setTagPolicy("optional");setFocusField(null);setStep(2);setEditing(true);
    toast.message("Blank register ready. Add only the fields your business needs.");
  };
  const choose=(d:Definition)=>{
   setEditing(true);
   setSelected(d.id);setName(d.name);setDescription(d.description||"");setSource(d.configuration?.source||"assets");setTagPolicy((d.configuration as any)?.tag_policy||"optional");
   setFields(Array.isArray(d.configuration?.fields)?d.configuration.fields:[]);setStep(2);setFocusField(null);
 };
 const addQuick=(type:string)=>{const labels:Record<string,string>={text:"New text field",textarea:"New long text",email:"New email",phone:"New phone",url:"New website",number:"New number",currency:"New amount",date:"New date",select:"New dropdown",radio:"New single choice",boolean:"New yes/no",attachment:"New attachment"};const prefix=labels[type]||"New field";let n=1;let key=slug(prefix);while(protectedKeys.has(key)||fields.some(f=>f.key===key)){n++;key=slug(prefix+" "+n);}const id=crypto.randomUUID();setFields(p=>[...p,{id,label:n===1?prefix:`${prefix} ${n}`,key,type,required:false,section:"classify",options:["select","radio"].includes(type)?[]:undefined}]);setFocusField(id);setStep(2);};
 const addField=()=>{
   const key=slug(draftLabel);
   if(!key||protectedKeys.has(key)||fields.some(f=>f.key===key)){
     toast.error("Choose a unique field name that does not replace a system field.");return;
   }
   setFields(p=>[...p,{id:crypto.randomUUID(),label:draftLabel.trim(),key,type:draftType,required:false,section:"classify",options:["select","radio"].includes(draftType)?[]:undefined}]);
   setDraftLabel("");setStep(2);
 };
 const dropField=(source:string,target:string)=>setFields(previous=>{const next=[...previous];const from=next.findIndex(f=>f.id===source),to=next.findIndex(f=>f.id===target);if(from<0||to<0||from===to)return previous;next.splice(to,0,...next.splice(from,1));return next;});
 const moveField=(id:string,step:number)=>setFields(previous=>{const next=[...previous];const index=next.findIndex(field=>field.id===id);const target=index+step;if(index<0||target<0||target>=next.length)return previous;[next[index],next[target]]=[next[target],next[index]];return next;});
 const downloadRegister=()=>{if(!fields.length){toast.error("Add at least one field before downloading an import template.");return;}try{downloadImportTemplate({id:selected??"",name:name.trim()||"Custom Register",configuration:{fields}},{show_in_custom_register:includeLocation});toast.success("Excel import template prepared.");}catch(err){toast.error(err instanceof Error?err.message:"Could not generate the Excel template.");}};
 const confirmActive=async(id:string|null)=>{setBusy(true);try{const headers=await getServerAuthHeaders();await activate({headers,data:{definitionId:id}});setActiveRegister(id);setActivationPrompt(null);toast.success(id?"Custom register set as primary.":"Default register restored.");}catch(e:any){toast.error(e?.message||"Unable to activate register");setError(e?.message||"Could not change the primary register. Your saved register is safe.");}finally{setBusy(false);}};
 const persist=async(makePrimary=false)=>{
   if(kind==="register_builder"&&fields.length===0){toast.error("Add at least one field before saving this register.");return;}
   if(name.trim().length<2){toast.error("Enter a name of at least 2 characters.");return;}
   setBusy(true);
   try{
     const headers=await getServerAuthHeaders();
     const saved=await save({headers,data:{kind,id:selected||undefined,name:name.trim(),description,
       configuration:{source,fields,tag_policy:tagPolicy},is_active:true}});
     const {data:rows,error:reloadError}=kind==="register_builder" ? {data:(await catalog({headers})).definitions,error:null} : await supabase.rpc("my_builder_definitions" as any,{p_kind:kind});
     if(reloadError)throw new Error(reloadError.message);
     if(!Array.isArray(rows))throw new Error("Saved, but unable to reload your register list.");
     setItems(rows.filter((row):row is Definition=>Boolean(row&&typeof row==="object"&&typeof row.id==="string"&&typeof row.name==="string")).map(row=>({...row,configuration:{...((row.configuration&&typeof row.configuration==="object"&&!Array.isArray(row.configuration))?row.configuration:{}),fields:Array.isArray(row.configuration?.fields)?row.configuration.fields:[]}})));setSelected(saved.id);setStep(3);setEditing(false);setError("");if(makePrimary&&kind==="register_builder"){await activate({headers,data:{definitionId:saved.id}});setActiveRegister(saved.id);toast.success("Register saved and made primary.");}else toast.success("Register saved. You can keep using your current primary.");
   }catch(e:any){setError(e?.message||"Save failed");toast.error(e?.message||"Save failed");}
   finally{setBusy(false);}
 };
 const deactivate=async()=>{
   if(!selected)return;
   setBusy(true);
   try{const headers=await getServerAuthHeaders();
     await archive({headers,data:{kind,id:selected,reason:archiveReason.trim()}});
     setItems((p)=>p.map(x=>x.id===selected?{...x,is_active:false}:x));
     setSelected(null);setName("");setFields([]);setArchiveReason("");setArchiveOpen(false);toast.success("Configuration archived with recorded justification.");
   }catch(e:any){toast.error(e?.message||"Could not archive");}
   finally{setBusy(false);}
 };

 if(isSaasAdmin)return <Card className="p-4">Use SaaS Global Modules to manage builder availability.</Card>;
 if(!isTenantAdmin)return <Card className="p-4">Only business administrators can configure builders.</Card>;
 const previewField=(f:Field)=> f.type==="radio" ? (f.options?.map(x=>"◯ "+x).join("   ")||"Add choices") : f.type==="boolean" ? "☐" : f.type==="date" ? "DD/MM/YYYY" : f.type==="currency" ? "UGX 0" : f.type==="number" ? "0" : f.type==="select" ? (f.options?.[0]??"Choose option ▾") : f.type==="attachment" ? "Attach file" : f.type==="textarea" ? "Enter a longer note" : "Enter "+f.label.toLowerCase();
 const active=definitions.find(d=>d.key===kind)!;
 return <div className="mx-auto w-full max-w-7xl space-y-3">
   <div className="flex flex-wrap items-center justify-between gap-2"><div><h1 className="text-xl font-bold">Builder Studio</h1><p className="text-xs text-muted-foreground">Set up your register on the left. Add and edit fields directly in the workspace.</p></div><span className="text-xs text-muted-foreground">Preview only • Not published</span></div>
   <div className="grid items-start gap-5 lg:grid-cols-[230px_minmax(0,1fr)]">
   <nav aria-label="Builder sections" className="flex flex-col gap-1 rounded-xl border bg-card p-3 lg:sticky lg:top-5"><p className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Builder modules</p>{definitions.map(d=><Button key={d.key} size="sm" variant={!showLocationBuilder&&kind===d.key?"secondary":"ghost"} onClick={()=>{setShowLocationBuilder(false);setKind(d.key)}} className="w-full justify-start text-left">{d.label.replace(" Builder","")}</Button>)}<Button size="sm" variant={showLocationBuilder?"secondary":"ghost"} className="w-full justify-start text-left" onClick={()=>setShowLocationBuilder(true)}>Location</Button></nav>
   <div className="min-w-0">
   {showLocationBuilder?<LocationSettingsPanel/>:!allowed?<Card className="flex items-center gap-2 p-5 text-base"><LockKeyhole className="h-5 w-5"/>{locked?"This builder is not included in your business plan.":"This feature is currently unavailable for your account."}</Card>:
   <div className="space-y-4">
     {(kind==="dashboard_builder"||kind==="report_builder")?<VisualCanvasBuilder key={kind} kind={kind}/>:<>
     {kind==="register_builder"&&<div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3"><div><p className="text-sm font-semibold">Active register: {items.find(i=>i.id===activeRegister)?.name??"Default register"}</p><p className="text-xs text-muted-foreground">Customize a copy or create a new register. Existing asset data stays intact.</p></div><Button size="sm" variant="outline" disabled={busy} onClick={()=>confirmActive(null)}>Use original register</Button></div>}
     {error&&<p className="rounded-lg border border-destructive p-3 text-sm text-destructive" role="alert">{error}</p>}
     {<div className="grid items-start gap-4 lg:grid-cols-[295px_minmax(0,1fr)]">
       <Card className="space-y-4 p-4 lg:sticky lg:top-4"><div><h2 className="text-base font-bold">Register setup</h2><p className="text-xs text-muted-foreground">Choose an existing layout or start fresh.</p></div>
       {kind==="register_builder"&&<div className="grid grid-cols-2 gap-2"><Button size="sm" variant="outline" className="col-span-2 h-10" onClick={startDefaultCustomization}><Plus className="mr-1 h-4 w-4"/>Create new register</Button></div>}
       <div className="space-y-2"><Label>Saved registers</Label><Select value={selected??"new"} onValueChange={id=>{if(id==="new"){startDefaultCustomization()}else{const item=items.find(x=>x.id===id);if(item)choose(item)}}}><SelectTrigger><SelectValue placeholder="Choose register"/></SelectTrigger><SelectContent><SelectItem value="new">Unsaved layout</SelectItem>{items.map(item=><SelectItem key={item.id} value={item.id}>{item.name}{!item.is_active?" (archived)":""}</SelectItem>)}</SelectContent></Select></div>
       {kind==="register_builder"&&<div className="space-y-2"><Label>Asset tag policy</Label><Select value={tagPolicy} onValueChange={v=>setTagPolicy(v as typeof tagPolicy)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="optional">Optional: allow untagged assets</SelectItem><SelectItem value="required">Required: tagged assets only</SelectItem><SelectItem value="automatic">Automatically assign tag</SelectItem></SelectContent></Select></div>}
        <div className="space-y-2"><Label>Register name</Label><Input value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Office assets"/></div>
       <details className="rounded-lg border p-3"><summary className="cursor-pointer text-sm font-semibold">More register settings</summary><div className="mt-3 space-y-3"><div><Label>Description</Label><Input value={description} onChange={e=>setDescription(e.target.value)}/></div><div><Label>Data source</Label><Select value={source} onValueChange={setSource}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{["assets","verification","depreciation","maintenance","movements","disposals"].map(x=><SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent></Select></div></div></details>
       <div className="border-t pt-3"><h2 className="text-sm font-bold">Add a field</h2><p className="text-xs text-muted-foreground">Click or drag a field into the layout. Edit it in place.</p><div className="grid grid-cols-2 gap-2">{[{type:"text",label:"Text",icon:Type},{type:"textarea",label:"Long text",icon:Type},{type:"email",label:"Email",icon:Type},{type:"phone",label:"Phone",icon:Type},{type:"url",label:"Website",icon:Type},{type:"radio",label:"Radio",icon:ListChecks},{type:"number",label:"Number",icon:Hash},{type:"currency",label:"Amount",icon:Coins},{type:"date",label:"Date",icon:CalendarDays},{type:"select",label:"Dropdown",icon:ListChecks},{type:"boolean",label:"Yes / No",icon:ToggleLeft},{type:"attachment",label:"File",icon:Paperclip}].map(item=><button key={item.type} draggable onDragStart={e=>e.dataTransfer.setData("text/x-builder-type",item.type)} onClick={()=>addQuick(item.type)} className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-lg border bg-background p-2 text-center text-xs font-medium hover:border-primary hover:bg-primary/5"><item.icon className="h-4 w-4 text-primary"/>{item.label}</button>)}</div></div></Card>
       <Card className="min-w-0 space-y-4 p-4 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold">{name||"Your asset register"}</h2><p className="text-sm text-muted-foreground">Select a field to edit it directly below. Drag to reorder.</p></div><span className="rounded-full bg-muted px-3 py-1 text-xs">{fields.length} custom fields</span></div>
       <div className="space-y-2 rounded-xl border border-dashed bg-muted/15 p-3" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();const type=e.dataTransfer.getData("text/x-builder-type");if(types.some(t=>t===type))addQuick(type)}}>
         {!fields.length&&<div className="py-12 text-center text-sm text-muted-foreground">Drop a field here or click an option on the left</div>}
         {fields.map((f,index)=><div key={f.id} className={`rounded-xl border bg-card p-3 ${focusField===f.id?"border-primary shadow-sm":""}`} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.stopPropagation();e.preventDefault();const from=e.dataTransfer.getData("text/x-builder-field");const type=e.dataTransfer.getData("text/x-builder-type");if(from)dropField(from,f.id);else if(types.some(t=>t===type))addQuick(type)}}>
           <div className="flex items-center gap-2"><span draggable onDragStart={e=>{e.dataTransfer.setData("text/x-builder-field",f.id);setDragging(f.id)}} onDragEnd={()=>setDragging(null)} className="cursor-grab p-1"><GripVertical className="h-4 w-4 text-muted-foreground"/></span><button className="min-w-0 flex-1 text-left" onClick={()=>setFocusField(focusField===f.id?null:f.id)}><span className="block truncate text-sm font-semibold">{f.label||"Untitled field"}</span><span className="text-xs text-muted-foreground">{f.type}{f.required?" · Required":""}</span></button><Button size="icon" variant="ghost" disabled={index===0} onClick={()=>moveField(f.id,-1)}><ArrowUp className="h-4 w-4"/></Button><Button size="icon" variant="ghost" disabled={index===fields.length-1} onClick={()=>moveField(f.id,1)}><ArrowDown className="h-4 w-4"/></Button><Button size="sm" variant={focusField===f.id?"secondary":"outline"} onClick={()=>setFocusField(focusField===f.id?null:f.id)}>{focusField===f.id?"Close":"Edit"}</Button></div>
           {focusField===f.id&&<div className="mt-3 grid gap-3 border-t pt-3 sm:grid-cols-2"><div className="space-y-1"><Label>Field name</Label><Input value={f.label} onChange={e=>setFields(p=>p.map(x=>x.id===f.id?{...x,label:e.target.value}:x))}/></div><div className="space-y-1"><Label>Field type</Label><Select value={f.type} onValueChange={type=>setFields(p=>p.map(x=>x.id===f.id?{...x,type,options:["radio","select"].includes(type)?x.options??[]:undefined}:x))}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{types.map(t=><SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1"><Label>Show in form</Label><Select value={["location","assignment"].includes(f.section??"")?f.section:"classify"} onValueChange={section=>setFields(p=>p.map(x=>x.id===f.id?{...x,section}:x))}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="classify">Asset details</SelectItem><SelectItem value="location">Location details</SelectItem><SelectItem value="assignment">Assignment & value</SelectItem></SelectContent></Select></div><label className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">Required <Switch checked={f.required} onCheckedChange={required=>setFields(p=>p.map(x=>x.id===f.id?{...x,required}:x))}/></label>{["select","radio"].includes(f.type)&&<div className="sm:col-span-2"><ChoiceEditor options={f.options??[]} onChange={options=>setFields(p=>p.map(x=>x.id===f.id?{...x,options}:x))}/></div>}<Button variant="outline" className="sm:col-span-2 text-destructive" onClick={()=>{setFields(p=>p.filter(x=>x.id!==f.id));setFocusField(null)}}><Trash2 className="mr-2 h-4 w-4"/>Remove field</Button></div>}
         </div>)}
       </div><div className="space-y-3 border-t pt-4"><div className="flex flex-wrap items-center gap-2"><Button variant="outline" size="sm" onClick={()=>setPreviewOpen(true)}><Eye className="mr-1 h-4 w-4"/>Preview form</Button><Button variant="outline" size="sm" onClick={()=>setTablePreviewOpen(true)}><Eye className="mr-1 h-4 w-4"/>Preview register table</Button><Button variant="outline" size="sm" onClick={downloadRegister}><Download className="mr-1 h-4 w-4"/>Excel template</Button>{selected&&<Button variant="outline" size="sm" disabled={busy} onClick={()=>setArchiveOpen(true)}><Archive className="mr-1 h-4 w-4"/>Archive</Button>}</div><div className="flex flex-wrap items-center justify-end gap-2 border-t pt-3"><Button disabled={busy||name.trim().length<2} variant="outline" onClick={()=>persist(false)}><Save className="mr-1 h-4 w-4"/>Save</Button>{kind==="register_builder"&&<Button disabled={busy||name.trim().length<2} onClick={()=>persist(true)}><CheckCircle2 className="mr-1 h-4 w-4"/>Save & make primary</Button>}</div></div></Card>
     </div>}
     {kind==="register_builder"&&<details className="rounded-xl border bg-card p-4"><summary className="cursor-pointer text-sm font-semibold">Advanced tools: migrate assets, numbering and register management</summary><div className="mt-4">     {kind==="register_builder"&&<Card className="p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-base font-semibold">Move existing assets to a custom register</h2><p className="text-sm text-muted-foreground">Match columns, preview the changes and undo a migration if needed.</p></div><Button variant="outline" onClick={()=>{setMigrationOpen(!migrationOpen);setMigrationReview(null);if(!migrationOpen)refreshMigrations()}}>{migrationOpen?"Close migration":"Migrate existing assets"}</Button></div>{migrationOpen&&<div className="mt-4 space-y-4 border-t pt-4"><div className="grid gap-3 sm:grid-cols-2"><div><Label>From register</Label><Select value={sourceRegister} onValueChange={v=>{setSourceRegister(v);setFieldMapping({});setMigrationReview(null)}}><SelectTrigger className="h-11"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="default">Original register</SelectItem>{items.filter(x=>x.is_active).map(x=><SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>)}</SelectContent></Select></div><div><Label>Move into</Label><Select value={targetRegister||"none"} onValueChange={v=>{setTargetRegister(v==="none"?"":v);setFieldMapping({});setMigrationReview(null)}}><SelectTrigger className="h-11"><SelectValue placeholder="Choose a register"/></SelectTrigger><SelectContent><SelectItem value="none">Choose destination</SelectItem>{items.filter(x=>x.is_active&&x.id!==sourceRegister).map(x=><SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>)}</SelectContent></Select></div></div>{currentTarget&&<div className="space-y-3"><p className="font-semibold">Match fields</p>{(currentTarget.configuration?.fields??[]).map(f=><div key={f.key} className="grid items-center gap-2 sm:grid-cols-2"><span className="text-sm font-medium">{f.label}</span><Select value={fieldMapping[f.key]??"unmapped"} onValueChange={v=>{setFieldMapping(p=>{const q={...p};if(v==="unmapped")delete q[f.key];else q[f.key]=v;return q});setMigrationReview(null)}}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="unmapped">Leave empty</SelectItem>{sourceOptions.map(option=><SelectItem key={option.key} value={option.key}>{option.label}</SelectItem>)}</SelectContent></Select></div>)}</div>}<div><Label>Existing values not mapped</Label><Select value={unmappedPolicy} onValueChange={v=>{setUnmappedPolicy(v);setMigrationReview(null)}}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="preserve">Preserve safely for possible recovery</SelectItem><SelectItem value="skip">Only keep mapped custom fields (snapshot retained)</SelectItem></SelectContent></Select></div>{migrationReview?<div className="rounded-lg border p-4 space-y-3"><p className="font-semibold">{migrationReview.count} existing assets: {migrationReview.sourceName} → {migrationReview.targetName}</p><p className="text-sm">Unmapped destination fields: {migrationReview.unmapped.join(", ")||"None"}</p><div className="flex gap-2"><Button variant="outline" onClick={()=>setMigrationReview(null)}>Edit mapping</Button><Button disabled={busy} onClick={finishMigration}>Confirm migration</Button></div></div>:<Button disabled={busy||!targetRegister} onClick={prepareMigration}>Preview migration</Button>}<div className="space-y-2 border-t pt-3"><h3 className="font-semibold">Migration history</h3>{recentMigrations.length===0?<p className="text-sm text-muted-foreground">No migrations yet</p>:recentMigrations.map(m=><div key={m.id} className="flex items-center justify-between gap-2 text-sm"><span>{m.affected_count} assets · {m.status}</span>{m.status==="completed"&&<Button size="sm" variant="outline" disabled={busy} onClick={()=>reverseMigration(m.id)}>Undo</Button>}</div>)}</div></div>}</Card>}
</div></details>}
     </>}
   </div>}
   </div>
   </div>
   <Dialog open={archiveOpen} onOpenChange={setArchiveOpen}><DialogContent><DialogHeader><DialogTitle>Archive configuration</DialogTitle><DialogDescription>The reason is mandatory and recorded in the business audit history. Asset records are never deleted by archiving a register.</DialogDescription></DialogHeader><Label htmlFor="archive-reason">Reason for archiving</Label><textarea id="archive-reason" className="min-h-24 w-full rounded-md border bg-background p-3 text-sm" maxLength={1000} value={archiveReason} onChange={e=>setArchiveReason(e.target.value)} placeholder="Explain why this configuration should be archived"/><div className="flex justify-end gap-2"><Button variant="outline" onClick={()=>setArchiveOpen(false)}>Cancel</Button><Button variant="destructive" disabled={busy||archiveReason.trim().length<10} onClick={deactivate}>Confirm archive</Button></div></DialogContent></Dialog>
   <Dialog open={tablePreviewOpen} onOpenChange={setTablePreviewOpen}><DialogContent className="max-w-5xl"><DialogHeader><DialogTitle>{name||"Asset Register"} · Table preview</DialogTitle><DialogDescription>Column layout preview with illustrative values. No asset records are created or changed.</DialogDescription></DialogHeader><div className="overflow-x-auto rounded-lg border"><table className="w-full text-sm"><thead className="bg-muted"><tr>{[...fields.map(f=>f.label)].map((v,i)=><th key={i} className="whitespace-nowrap border-b px-3 py-3 text-left">{v}</th>)}</tr></thead><tbody>{[1,2,3].map((n)=><tr key={n} className="border-b">{[...fields.map(f=>f.type==="date"?"2026-10-15":f.type==="number"?"100":f.type==="boolean"?"Yes":f.options?.[0]||"Sample value")].map((v,i)=><td key={i} className="whitespace-nowrap px-3 py-3">{v}</td>)}</tr>)}</tbody></table></div><Button onClick={()=>setTablePreviewOpen(false)}>Close preview</Button></DialogContent></Dialog>
   <Dialog open={previewOpen} onOpenChange={setPreviewOpen}><DialogContent className="max-h-[88vh] max-w-3xl overflow-y-auto"><DialogHeader><DialogTitle>{name.trim()||"Asset Register"} · Form preview</DialogTitle><DialogDescription>This is how your asset-entry form will be organised. Preview only, no records are created.</DialogDescription></DialogHeader><div className="space-y-5">{[{id:"identify",name:"1. Asset identification"},{id:"classify",name:"2. Asset details"},{id:"location",name:"3. Location"},{id:"assignment",name:"4. Assignment & value"}].map(section=><section key={section.id} className="rounded-xl border p-4"><h3 className="mb-3 text-sm font-bold">{section.name}</h3>{section.id==="identify"&&<div className="grid gap-3 sm:grid-cols-2"><div><Label>Asset name</Label><Input disabled placeholder="Asset name"/></div><div><Label>Asset tag</Label><Input disabled placeholder="Automatically generated or entered"/></div><div><Label>Serial number</Label><Input disabled placeholder="Serial number"/></div></div>}{section.id==="location"&&<p className="mb-3 text-xs text-muted-foreground">Built-in branch, internal and geographic location controls follow your company settings.</p>}<div className="grid gap-3 sm:grid-cols-2">{fields.filter(f=>(["location","assignment"].includes(f.section??"")?f.section:"classify")===section.id).map(f=><div key={f.id} className="space-y-1.5"><Label>{f.label||"Untitled field"}{f.required?" *":""}</Label>{["select","radio"].includes(f.type)?f.type==="select"?<Select><SelectTrigger><SelectValue placeholder="Select an option"/></SelectTrigger><SelectContent>{(f.options??[]).filter(Boolean).map((x,i)=><SelectItem key={i} value={x}>{x}</SelectItem>)}</SelectContent></Select>:<div className="flex flex-wrap gap-3 rounded-lg border p-3">{(f.options??[]).filter(Boolean).length?(f.options??[]).filter(Boolean).map((x,i)=><label key={i} className="flex items-center gap-1.5 text-sm"><input type="radio" name={f.id}/>{x}</label>):<span className="text-xs text-muted-foreground">No choices configured</span>}</div>:f.type==="boolean"?<label className="flex items-center gap-2 rounded-lg border p-3 text-sm"><input type="checkbox"/>Yes</label>:f.type==="attachment"?<Input type="file" disabled/>:f.type==="textarea"?<textarea className="min-h-20 w-full rounded-md border bg-background p-3 text-sm" placeholder={f.label}/>:<Input type={f.type==="number"||f.type==="currency"?"number":f.type==="date"?"date":f.type==="email"?"email":f.type==="phone"?"tel":f.type==="url"?"url":"text"} placeholder={f.label}/>}</div>)}</div>{section.id==="assignment"&&<p className="mt-3 text-xs text-muted-foreground">Built-in custodian, department and valuation fields remain part of asset entry.</p>}</section>)}</div><Button onClick={()=>setPreviewOpen(false)} className="w-full">Close preview</Button></DialogContent></Dialog>
   {kind==="register_builder"&&activationPrompt&&<div role="dialog" aria-modal="true" aria-label="Activate custom register" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><Card className="w-full max-w-md space-y-4 p-6"><h2 className="text-lg font-semibold">Use this register as the primary layout?</h2><p className="text-sm text-muted-foreground">Your original default register and existing asset records will be retained. You can keep multiple named registers and download their individual templates.</p><div className="flex flex-wrap justify-end gap-2"><Button variant="outline" onClick={()=>setActivationPrompt(null)}>Keep current default</Button><Button disabled={busy} onClick={()=>confirmActive(activationPrompt)}><CheckCircle2 className="mr-1 h-4 w-4"/> Make primary</Button></div></Card></div>}
 </div>;
}
