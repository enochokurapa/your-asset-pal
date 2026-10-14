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
 const [fields,setFields]=useState<Field[]>([]);
 const [dragging,setDragging]=useState<string|null>(null);
 const [draftLabel,setDraftLabel]=useState("");
 const [draftType,setDraftType]=useState("text");
 const [step,setStep]=useState(1);
 const [focusField,setFocusField]=useState<string|null>(null);
 const [busy,setBusy]=useState(false);
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
   setItems([]);setSelected(null);setName("");setDescription("");setFields([]);setError("");setEditing(false);setStep(1);
   if(!allowed||!isTenantAdmin||isSaasAdmin)return;
   setBusy(true);
   getServerAuthHeaders().then(headers=>list({data:{kind},headers})).then(async rows=>{
     if(valid){if(!Array.isArray(rows))throw Error("Unexpected response from server");setItems(rows as Definition[]);if(kind==="register_builder")catalog({headers:await getServerAuthHeaders()}).then(c=>{if(valid){setActiveRegister(c.primaryId??null);setIncludeLocation(c.includeLocation??true)}}).catch(()=>{});}
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
   setSelected(null);setName("Customized Asset Register");setDescription("Customized version of the standard asset register");setSource("assets");
   setFields([
     {id:crypto.randomUUID(),key:"custom_asset_name",label:"Asset Name",type:"text",required:false,section:"classify"},
     {id:crypto.randomUUID(),key:"custom_category",label:"Category",type:"text",required:false,section:"classify"},
     {id:crypto.randomUUID(),key:"custom_condition",label:"Condition",type:"select",required:false,options:["Good","Fair","Needs repair"],section:"classify"},
   ]);setFocusField(null);setStep(2);setEditing(true);
   toast.message("Editing a customizable copy. Native asset identity and database fields stay protected; publish to set as primary.");
 };
 const choose=(d:Definition)=>{
   setEditing(true);
   setSelected(d.id);setName(d.name);setDescription(d.description||"");setSource(d.configuration?.source||"assets");
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
 const downloadRegister=()=>downloadImportTemplate({id:selected??"",name:name.trim()||"Custom Register",configuration:{fields}},includeLocation);
 const confirmActive=async(id:string|null)=>{setBusy(true);try{const headers=await getServerAuthHeaders();await activate({headers,data:{definitionId:id}});setActiveRegister(id);setActivationPrompt(null);toast.success(id?"Custom register set as primary.":"Default register restored.");}catch(e:any){toast.error(e?.message||"Unable to activate register");setError(e?.message||"Could not change the primary register. Your saved register is safe.");}finally{setBusy(false);}};
 const persist=async(makePrimary=false)=>{
   if(name.trim().length<2){toast.error("Enter a name of at least 2 characters.");return;}
   setBusy(true);
   try{
     const headers=await getServerAuthHeaders();
     const saved=await save({headers,data:{kind,id:selected||undefined,name:name.trim(),description,
       configuration:{source,fields},is_active:true}});
     const rows=await list({headers,data:{kind}});
     setItems(rows as Definition[]);setSelected(saved.id);setStep(3);setEditing(false);setError("");if(makePrimary&&kind==="register_builder"){await activate({headers,data:{definitionId:saved.id}});setActiveRegister(saved.id);toast.success("Register saved and made primary.");}else toast.success("Register saved. You can keep using your current primary.");
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
 const previewField=(f:Field)=> f.type==="radio" ? (f.options?.map(x=>"◯ "+x).join("   ")||"Add choices") : f.type==="boolean" ? "☐" : f.type==="date" ? "DD/MM/YYYY" : f.type==="currency" ? "UGX 0" : f.type==="number" ? "0" : f.type==="select" ? (f.options?.[0]??"Choose option ▾") : f.type==="attachment" ? "Attach file" : f.type==="textarea" ? "Enter a longer note" : "Enter "+f.label.toLowerCase();
 const active=definitions.find(d=>d.key===kind)!;
 return <div className="mx-auto w-full max-w-7xl space-y-3">
   <div className="flex flex-wrap items-center justify-between gap-2"><div><h1 className="text-xl font-bold">Builder Studio</h1><p className="text-xs text-muted-foreground">Add fields at the top. Your spreadsheet preview updates immediately below.</p></div><span className="text-xs text-muted-foreground">Preview only • Not published</span></div>
   <div className="flex flex-wrap items-center gap-1.5 rounded-lg border bg-card p-2">{definitions.map(d=><Button key={d.key} size="sm" variant={!showLocationBuilder&&kind===d.key?"default":"ghost"} onClick={()=>{setShowLocationBuilder(false);setKind(d.key)}} className="text-sm">{d.label.replace(" Builder","")}</Button>)}<Button size="sm" variant={showLocationBuilder?"default":"ghost"} className="text-sm" onClick={()=>setShowLocationBuilder(true)}>Location</Button></div>
   {showLocationBuilder?<LocationSettingsPanel/>:!allowed?<Card className="flex items-center gap-2 p-5 text-base"><LockKeyhole className="h-5 w-5"/>{locked?"This builder is not included in your business plan.":"This builder is disabled by SaaS Admin."}</Card>:
   <div className="space-y-4">
     {(kind==="dashboard_builder"||kind==="report_builder")?<VisualCanvasBuilder key={kind} kind={kind}/>:<>
     {kind==="register_builder"&&<div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3"><div><p className="text-base font-semibold">Using: {items.find(item=>item.id===activeRegister)?.name??"Default register"}</p><p className="text-sm text-muted-foreground">Keep both layouts, or change which one is primary.</p></div><Button variant="outline" disabled={busy} onClick={()=>confirmActive(null)}>Restore default register</Button></div>}
     {kind==="register_builder"&&<Card className="p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-base font-semibold">Move existing assets to a custom register</h2><p className="text-sm text-muted-foreground">Match columns, preview the changes and undo a migration if needed.</p></div><Button variant="outline" onClick={()=>{setMigrationOpen(!migrationOpen);setMigrationReview(null);if(!migrationOpen)refreshMigrations()}}>{migrationOpen?"Close migration":"Migrate existing assets"}</Button></div>{migrationOpen&&<div className="mt-4 space-y-4 border-t pt-4"><div className="grid gap-3 sm:grid-cols-2"><div><Label>From register</Label><Select value={sourceRegister} onValueChange={v=>{setSourceRegister(v);setFieldMapping({});setMigrationReview(null)}}><SelectTrigger className="h-11"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="default">Original register</SelectItem>{items.filter(x=>x.is_active).map(x=><SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>)}</SelectContent></Select></div><div><Label>Move into</Label><Select value={targetRegister||"none"} onValueChange={v=>{setTargetRegister(v==="none"?"":v);setFieldMapping({});setMigrationReview(null)}}><SelectTrigger className="h-11"><SelectValue placeholder="Choose a register"/></SelectTrigger><SelectContent><SelectItem value="none">Choose destination</SelectItem>{items.filter(x=>x.is_active&&x.id!==sourceRegister).map(x=><SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>)}</SelectContent></Select></div></div>{currentTarget&&<div className="space-y-3"><p className="font-semibold">Match fields</p>{(currentTarget.configuration?.fields??[]).map(f=><div key={f.key} className="grid items-center gap-2 sm:grid-cols-2"><span className="text-sm font-medium">{f.label}</span><Select value={fieldMapping[f.key]??"unmapped"} onValueChange={v=>{setFieldMapping(p=>{const q={...p};if(v==="unmapped")delete q[f.key];else q[f.key]=v;return q});setMigrationReview(null)}}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="unmapped">Leave empty</SelectItem>{sourceOptions.map(option=><SelectItem key={option.key} value={option.key}>{option.label}</SelectItem>)}</SelectContent></Select></div>)}</div>}<div><Label>Existing values not mapped</Label><Select value={unmappedPolicy} onValueChange={v=>{setUnmappedPolicy(v);setMigrationReview(null)}}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="preserve">Preserve safely for possible recovery</SelectItem><SelectItem value="skip">Only keep mapped custom fields (snapshot retained)</SelectItem></SelectContent></Select></div>{migrationReview?<div className="rounded-lg border p-4 space-y-3"><p className="font-semibold">{migrationReview.count} existing assets: {migrationReview.sourceName} → {migrationReview.targetName}</p><p className="text-sm">Unmapped destination fields: {migrationReview.unmapped.join(", ")||"None"}</p><div className="flex gap-2"><Button variant="outline" onClick={()=>setMigrationReview(null)}>Edit mapping</Button><Button disabled={busy} onClick={finishMigration}>Confirm migration</Button></div></div>:<Button disabled={busy||!targetRegister} onClick={prepareMigration}>Preview migration</Button>}<div className="space-y-2 border-t pt-3"><h3 className="font-semibold">Migration history</h3>{recentMigrations.length===0?<p className="text-sm text-muted-foreground">No migrations yet</p>:recentMigrations.map(m=><div key={m.id} className="flex items-center justify-between gap-2 text-sm"><span>{m.affected_count} assets · {m.status}</span>{m.status==="completed"&&<Button size="sm" variant="outline" disabled={busy} onClick={()=>reverseMigration(m.id)}>Undo</Button>}</div>)}</div></div>}</Card>}
     <div className="grid gap-2 sm:grid-cols-3">{[{n:1,title:"Name",subtitle:"Choose a register"},{n:2,title:"Design",subtitle:"Drag, add and edit"},{n:3,title:"Finish",subtitle:"Save and use"}].map(item=><button key={item.n} type="button" onClick={()=>setStep(item.n)} className={`flex items-center gap-3 rounded-xl border p-3 text-left transition-colors ${step===item.n?"border-primary bg-primary/5 shadow-sm":"bg-card hover:bg-muted/50"}`}><span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-base font-bold ${step===item.n?"bg-primary text-primary-foreground":"bg-muted"}`}>{item.n}</span><span><span className="block text-base font-semibold">{item.title}</span><span className="block text-sm text-muted-foreground">{item.subtitle}</span></span></button>)}</div>
     {error&&<p className="rounded-lg border border-destructive p-3 text-sm text-destructive" role="alert">{error}</p>}
     {kind==="register_builder"&&step===1&&<div className="grid gap-3 sm:grid-cols-2"><button onClick={startDefaultCustomization} className="rounded-xl border bg-card p-5 text-left hover:border-primary"><Pencil className="mb-2 h-6 w-6 text-primary"/><h3 className="font-semibold">Customize default register</h3><p className="mt-1 text-sm text-muted-foreground">Start from familiar fields, rename and add fields in one visual editor. Original records remain safe.</p></button><button onClick={()=>{setSelected(null);setName("");setDescription("");setFields([]);setStep(2)}} className="rounded-xl border bg-card p-5 text-left hover:border-primary"><Plus className="mb-2 h-6 w-6 text-primary"/><h3 className="font-semibold">Create a new register</h3><p className="mt-1 text-sm text-muted-foreground">Start from an empty layout.</p></button></div>}
     {step===1&&<Card className="mx-auto w-full max-w-3xl space-y-5 p-5 sm:p-8"><div className="flex items-center justify-between"><div><h2 className="text-xl font-bold">Choose your layout</h2><p className="text-sm text-muted-foreground">Start fresh or continue editing a saved layout.</p></div><Button size="lg" variant="outline" onClick={()=>{setSelected(null);setName("");setDescription("");setSource("assets");setFields([]);setFocusField(null)}}><Plus className="mr-2 h-5 w-5"/>New</Button></div><div className="space-y-2"><Label className="text-base">Saved layouts</Label><Select value={selected??"new"} onValueChange={id=>{if(id==="new"){setSelected(null);setName("");setDescription("");setSource("assets");setFields([])}else{const item=items.find(x=>x.id===id);if(item)choose(item)}}}><SelectTrigger className="h-12 text-base"><SelectValue placeholder="Choose a layout"/></SelectTrigger><SelectContent><SelectItem value="new">Create a new layout</SelectItem>{items.map(item=><SelectItem key={item.id} value={item.id}>{item.name}{item.is_active?"":" (archived)"}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label className="text-base">Register name</Label><Input className="h-12 text-base" value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Office equipment"/></div><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Data source</Label><Select value={source} onValueChange={setSource}><SelectTrigger className="h-11"><SelectValue/></SelectTrigger><SelectContent>{["assets","verification","depreciation","maintenance","movements","disposals"].map(x=><SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Description (optional)</Label><Input className="h-11" value={description} onChange={e=>setDescription(e.target.value)} placeholder="What is this layout for?"/></div></div><div className="flex justify-end"><Button size="lg" onClick={()=>setStep(2)}>Design layout <ChevronRight className="ml-2 h-5 w-5"/></Button></div></Card>}
     {step===2&&<div className="grid items-start gap-4 lg:grid-cols-[210px_minmax(0,1fr)]">
       <Card className="space-y-3 p-4 lg:sticky lg:top-4"><h2 className="text-base font-bold">Add fields</h2><p className="text-xs text-muted-foreground">Click or drag a field into the layout. Edit it in place.</p><div className="grid grid-cols-2 gap-2">{[{type:"text",label:"Text",icon:Type},{type:"textarea",label:"Long text",icon:Type},{type:"email",label:"Email",icon:Type},{type:"phone",label:"Phone",icon:Type},{type:"url",label:"Website",icon:Type},{type:"radio",label:"Radio",icon:ListChecks},{type:"number",label:"Number",icon:Hash},{type:"currency",label:"Amount",icon:Coins},{type:"date",label:"Date",icon:CalendarDays},{type:"select",label:"Dropdown",icon:ListChecks},{type:"boolean",label:"Yes / No",icon:ToggleLeft},{type:"attachment",label:"File",icon:Paperclip}].map(item=><button key={item.type} draggable onDragStart={e=>e.dataTransfer.setData("text/x-builder-type",item.type)} onClick={()=>addQuick(item.type)} className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-lg border bg-background p-2 text-center text-xs font-medium hover:border-primary hover:bg-primary/5"><item.icon className="h-4 w-4 text-primary"/>{item.label}</button>)}</div></Card>
       <Card className="min-w-0 space-y-4 p-4 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold">{name||"Your asset register"}</h2><p className="text-sm text-muted-foreground">Select a field to edit it directly below. Drag to reorder.</p></div><span className="rounded-full bg-muted px-3 py-1 text-xs">{fields.length} custom fields</span></div>
       <div className="space-y-2 rounded-xl border border-dashed bg-muted/15 p-3" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();const type=e.dataTransfer.getData("text/x-builder-type");if(types.some(t=>t===type))addQuick(type)}}>
         {!fields.length&&<div className="py-12 text-center text-sm text-muted-foreground">Drop a field here or click an option on the left</div>}
         {fields.map((f,index)=><div key={f.id} className={`rounded-xl border bg-card p-3 ${focusField===f.id?"border-primary shadow-sm":""}`} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.stopPropagation();e.preventDefault();const from=e.dataTransfer.getData("text/x-builder-field");const type=e.dataTransfer.getData("text/x-builder-type");if(from)dropField(from,f.id);else if(types.some(t=>t===type))addQuick(type)}}>
           <div className="flex items-center gap-2"><span draggable onDragStart={e=>{e.dataTransfer.setData("text/x-builder-field",f.id);setDragging(f.id)}} onDragEnd={()=>setDragging(null)} className="cursor-grab p-1"><GripVertical className="h-4 w-4 text-muted-foreground"/></span><button className="min-w-0 flex-1 text-left" onClick={()=>setFocusField(focusField===f.id?null:f.id)}><span className="block truncate text-sm font-semibold">{f.label||"Untitled field"}</span><span className="text-xs text-muted-foreground">{f.type}{f.required?" · Required":""}</span></button><Button size="icon" variant="ghost" disabled={index===0} onClick={()=>moveField(f.id,-1)}><ArrowUp className="h-4 w-4"/></Button><Button size="icon" variant="ghost" disabled={index===fields.length-1} onClick={()=>moveField(f.id,1)}><ArrowDown className="h-4 w-4"/></Button><Button size="sm" variant={focusField===f.id?"secondary":"outline"} onClick={()=>setFocusField(focusField===f.id?null:f.id)}>{focusField===f.id?"Close":"Edit"}</Button></div>
           {focusField===f.id&&<div className="mt-3 grid gap-3 border-t pt-3 sm:grid-cols-2"><div className="space-y-1"><Label>Field name</Label><Input value={f.label} onChange={e=>setFields(p=>p.map(x=>x.id===f.id?{...x,label:e.target.value}:x))}/></div><div className="space-y-1"><Label>Field type</Label><Select value={f.type} onValueChange={type=>setFields(p=>p.map(x=>x.id===f.id?{...x,type,options:["radio","select"].includes(type)?x.options??[]:undefined}:x))}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{types.map(t=><SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1"><Label>Show in form</Label><Select value={["location","assignment"].includes(f.section??"")?f.section:"classify"} onValueChange={section=>setFields(p=>p.map(x=>x.id===f.id?{...x,section}:x))}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="classify">Asset details</SelectItem><SelectItem value="location">Location details</SelectItem><SelectItem value="assignment">Assignment & value</SelectItem></SelectContent></Select></div><label className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">Required <Switch checked={f.required} onCheckedChange={required=>setFields(p=>p.map(x=>x.id===f.id?{...x,required}:x))}/></label>{["select","radio"].includes(f.type)&&<div className="sm:col-span-2"><ChoiceEditor options={f.options??[]} onChange={options=>setFields(p=>p.map(x=>x.id===f.id?{...x,options}:x))}/></div>}<Button variant="outline" className="sm:col-span-2 text-destructive" onClick={()=>{setFields(p=>p.filter(x=>x.id!==f.id));setFocusField(null)}}><Trash2 className="mr-2 h-4 w-4"/>Remove field</Button></div>}
         </div>)}
       </div><div className="flex items-center justify-between border-t pt-4"><Button variant="outline" onClick={()=>setStep(1)}><ChevronLeft className="mr-1 h-4 w-4"/>Back</Button><Button onClick={()=>setStep(3)}>Continue <ChevronRight className="ml-1 h-4 w-4"/></Button></div></Card>
     </div>}
     {step===3&&<Card className="mx-auto w-full max-w-3xl space-y-5 p-5 sm:p-8"><div><h2 className="text-xl font-bold">Save your layout</h2><p className="text-sm text-muted-foreground">Choose what your business uses. The original register stays available.</p></div><div className="space-y-2"><Label>Register name</Label><Input className="h-12 text-base" value={name} onChange={e=>setName(e.target.value)} placeholder="Name your layout"/></div><div className="rounded-xl border p-4 space-y-3"><div><p className="text-base font-semibold">Automatic tag numbering</p><p className="text-sm text-muted-foreground">Configure tags for new records without a supplied tag. Example: {tagPrefix}{tagSeparator}{String(16).padStart(tagPadding,"0")}</p></div><div className="grid grid-cols-3 gap-2"><div><Label>Company initials</Label><Input aria-label="Company tag initials" value={tagPrefix} maxLength={10} onChange={e=>setTagPrefix(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,""))}/></div><div><Label>Separator</Label><Select value={tagSeparator||"none"} onValueChange={v=>setTagSeparator(v==="none"?"":v)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="-">Dash</SelectItem><SelectItem value="/">Slash</SelectItem><SelectItem value="none">None</SelectItem></SelectContent></Select></div><div><Label>Digits</Label><Select value={String(tagPadding)} onValueChange={v=>setTagPadding(Number(v))}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{[2,3,4,5,6,7,8,9,10].map(n=><SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent></Select></div></div><Button variant="outline" disabled={busy||!tagPrefix} onClick={saveNumbering}>Save numbering</Button></div><div className="rounded-xl border bg-muted/30 p-4"><p className="text-base font-semibold">Primary register: {items.find(item=>item.id===activeRegister)?.name??"Default register"}</p><p className="mt-1 text-sm text-muted-foreground">Choose Save layout to keep both registers. Choose Save and make primary to use this layout in Assets, Import and Export. Your default register is never deleted.</p></div><div className="rounded-xl border p-4"><p className="font-semibold">{fields.length} custom fields</p><p className="mt-1 text-sm text-muted-foreground">{fields.map(f=>f.label).join(" · ")||"Standard fields only"}</p></div><div className="flex flex-wrap gap-2">{kind==="register_builder"&&<Button size="lg" variant="outline" onClick={downloadRegister}><Download className="mr-2 h-5 w-5"/>Download template</Button>}{selected&&<Button variant="outline" size="lg" disabled={busy} onClick={deactivate}><Archive className="mr-2 h-4 w-4"/>Archive</Button>}{kind==="register_builder"&&<Button variant="outline" size="lg" disabled={busy} onClick={()=>confirmActive(null)}>Use original register</Button>}</div><div className="flex items-center justify-between border-t pt-4"><Button variant="outline" onClick={()=>setStep(2)}><ChevronLeft className="mr-1 h-4 w-4"/>Edit fields</Button><Button size="lg" disabled={busy} onClick={()=>persist(false)}><Save className="mr-2 h-5 w-5"/>{busy?"Saving...":"Save layout"}</Button></div>{kind==="register_builder"&&<Button disabled={busy} className="w-full h-12 text-base font-semibold" onClick={()=>persist(true)}><CheckCircle2 className="mr-2 h-5 w-5"/>Save and make primary register</Button>}</Card>}
     </>}
   </div>}
   {kind==="register_builder"&&activationPrompt&&<div role="dialog" aria-modal="true" aria-label="Activate custom register" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><Card className="w-full max-w-md space-y-4 p-6"><h2 className="text-lg font-semibold">Use this register as the primary layout?</h2><p className="text-sm text-muted-foreground">Your original default register and existing asset records will be retained. You can keep multiple named registers and download their individual templates.</p><div className="flex flex-wrap justify-end gap-2"><Button variant="outline" onClick={()=>setActivationPrompt(null)}>Keep current default</Button><Button disabled={busy} onClick={()=>confirmActive(activationPrompt)}><CheckCircle2 className="mr-1 h-4 w-4"/> Make primary</Button></div></Card></div>}
 </div>;
}
