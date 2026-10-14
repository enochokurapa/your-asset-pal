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
import {setActiveRegisterDefinition,getRegisterCatalog,getAssetTagSettings,saveAssetTagSettings} from "@/lib/builders.functions";

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
type Field={id:string,label:string,key:string,type:string,required:boolean,options?:string[]};
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
 const [tagPrefix,setTagPrefix]=useState("AST");
 const [tagSeparator,setTagSeparator]=useState("-");
 const [tagPadding,setTagPadding]=useState(5);
 const [activationPrompt,setActivationPrompt]=useState<string|null>(null);
 const [activeRegister,setActiveRegister]=useState<string|null>(null);
 const allowed=canView(kind);
 const locked=isPaidFeature(kind)||isAddOnFeature(kind);
 useEffect(()=>{setKind(initial)},[initial]);
 useEffect(()=>{
   let valid=true;
   setItems([]);setSelected(null);setName("");setDescription("");setFields([]);setError("");setEditing(false);setStep(1);
   if(!allowed||!isTenantAdmin||isSaasAdmin)return;
   setBusy(true);
   getServerAuthHeaders().then(headers=>list({data:{kind},headers})).then(async rows=>{
     if(valid){if(!Array.isArray(rows))throw Error("Unexpected response from server");setItems(rows as Definition[]);if(kind==="register_builder")catalog({headers:await getServerAuthHeaders()}).then(c=>{if(valid)setActiveRegister(c.primaryId??null)}).catch(()=>{});}
   }).catch(e=>{if(valid)setError(e?.message||"Unable to load definitions")})
     .finally(()=>{if(valid)setBusy(false)});
   return()=>{valid=false};
 },[kind,allowed,isTenantAdmin,isSaasAdmin,list]);
 useEffect(()=>{if(kind!=="register_builder"||!isTenantAdmin)return;getServerAuthHeaders().then(headers=>getTagSettings({headers})).then(x=>{setTagPrefix(x.prefix);setTagSeparator(x.separator);setTagPadding(x.padding)}).catch(()=>{});},[kind,isTenantAdmin,getTagSettings]);
 const saveNumbering=async()=>{setBusy(true);try{const headers=await getServerAuthHeaders();await saveTagSettings({headers,data:{prefix:tagPrefix,separator:tagSeparator as "-"|"/"|"",padding:tagPadding}});toast.success("Tag numbering saved");}catch(e:any){toast.error(e?.message||"Unable to save numbering");}finally{setBusy(false)}};
 const choose=(d:Definition)=>{
   setEditing(true);
   setSelected(d.id);setName(d.name);setDescription(d.description||"");setSource(d.configuration?.source||"assets");
   setFields(Array.isArray(d.configuration?.fields)?d.configuration.fields:[]);setStep(2);setFocusField(null);
 };
 const addQuick=(type:string)=>{const labels:Record<string,string>={text:"New text field",number:"New number",currency:"New amount",date:"New date",select:"New dropdown",boolean:"New yes/no",attachment:"New attachment"};const prefix=labels[type]||"New field";let n=1;let key=slug(prefix);while(protectedKeys.has(key)||fields.some(f=>f.key===key)){n++;key=slug(prefix+" "+n);}const id=crypto.randomUUID();setFields(p=>[...p,{id,label:n===1?prefix:`${prefix} ${n}`,key,type,required:false,options:type==="select"?["Option 1","Option 2"]:undefined}]);setFocusField(id);setStep(2);};
 const addField=()=>{
   const key=slug(draftLabel);
   if(!key||protectedKeys.has(key)||fields.some(f=>f.key===key)){
     toast.error("Choose a unique field name that does not replace a system field.");return;
   }
   setFields(p=>[...p,{id:crypto.randomUUID(),label:draftLabel.trim(),key,type:draftType,required:false}]);
   setDraftLabel("");setStep(2);
 };
 const dropField=(source:string,target:string)=>setFields(previous=>{const next=[...previous];const from=next.findIndex(f=>f.id===source),to=next.findIndex(f=>f.id===target);if(from<0||to<0||from===to)return previous;next.splice(to,0,...next.splice(from,1));return next;});
 const moveField=(id:string,step:number)=>setFields(previous=>{const next=[...previous];const index=next.findIndex(field=>field.id===id);const target=index+step;if(index<0||target<0||target>=next.length)return previous;[next[index],next[target]]=[next[target],next[index]];return next;});
 const downloadRegister=()=>downloadImportTemplate({id:selected??"",name:name.trim()||"Custom Register",configuration:{fields}});
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
 const previewField=(f:Field)=> f.type==="boolean" ? "☐" : f.type==="date" ? "DD/MM/YYYY" : f.type==="currency" ? "UGX 0" : f.type==="number" ? "0" : f.type==="select" ? (f.options?.[0]??"Choose option ▾") : f.type==="attachment" ? "Attach file" : "Enter "+f.label.toLowerCase();
 const active=definitions.find(d=>d.key===kind)!;
 return <div className="mx-auto w-full max-w-7xl space-y-3">
   <div className="flex flex-wrap items-center justify-between gap-2"><div><h1 className="text-xl font-bold">Builder Studio</h1><p className="text-xs text-muted-foreground">Add fields at the top. Your spreadsheet preview updates immediately below.</p></div><span className="text-xs text-muted-foreground">Preview only • Not published</span></div>
   <div className="flex flex-wrap items-center gap-1.5 rounded-lg border bg-card p-2">{definitions.map(d=><Button key={d.key} size="sm" variant={kind===d.key?"default":"ghost"} onClick={()=>setKind(d.key)} className="text-xs">{d.label.replace(" Builder","")}</Button>)}</div>
   {!allowed?<Card className="flex items-center gap-2 p-5 text-base"><LockKeyhole className="h-5 w-5"/>{locked?"This builder is not included in your business plan.":"This builder is disabled by SaaS Admin."}</Card>:
   <div className="space-y-4">
     {kind==="register_builder"&&<div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3"><div><p className="text-base font-semibold">Using: {items.find(item=>item.id===activeRegister)?.name??"Default register"}</p><p className="text-sm text-muted-foreground">Keep both layouts, or change which one is primary.</p></div><Button variant="outline" disabled={busy} onClick={()=>confirmActive(null)}>Restore default register</Button></div>}
     <div className="grid gap-2 sm:grid-cols-3">{[{n:1,title:"Name",subtitle:"Choose a register"},{n:2,title:"Design",subtitle:"Drag, add and edit"},{n:3,title:"Finish",subtitle:"Save and use"}].map(item=><button key={item.n} type="button" onClick={()=>setStep(item.n)} className={`flex items-center gap-3 rounded-xl border p-3 text-left transition-colors ${step===item.n?"border-primary bg-primary/5 shadow-sm":"bg-card hover:bg-muted/50"}`}><span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-base font-bold ${step===item.n?"bg-primary text-primary-foreground":"bg-muted"}`}>{item.n}</span><span><span className="block text-base font-semibold">{item.title}</span><span className="block text-sm text-muted-foreground">{item.subtitle}</span></span></button>)}</div>
     {error&&<p className="rounded-lg border border-destructive p-3 text-sm text-destructive" role="alert">{error}</p>}
     {step===1&&<Card className="mx-auto w-full max-w-3xl space-y-5 p-5 sm:p-8"><div className="flex items-center justify-between"><div><h2 className="text-xl font-bold">Choose your layout</h2><p className="text-sm text-muted-foreground">Start fresh or continue editing a saved layout.</p></div><Button size="lg" variant="outline" onClick={()=>{setSelected(null);setName("");setDescription("");setSource("assets");setFields([]);setFocusField(null)}}><Plus className="mr-2 h-5 w-5"/>New</Button></div><div className="space-y-2"><Label className="text-base">Saved layouts</Label><Select value={selected??"new"} onValueChange={id=>{if(id==="new"){setSelected(null);setName("");setDescription("");setSource("assets");setFields([])}else{const item=items.find(x=>x.id===id);if(item)choose(item)}}}><SelectTrigger className="h-12 text-base"><SelectValue placeholder="Choose a layout"/></SelectTrigger><SelectContent><SelectItem value="new">Create a new layout</SelectItem>{items.map(item=><SelectItem key={item.id} value={item.id}>{item.name}{item.is_active?"":" (archived)"}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label className="text-base">Register name</Label><Input className="h-12 text-base" value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Office equipment"/></div><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Data source</Label><Select value={source} onValueChange={setSource}><SelectTrigger className="h-11"><SelectValue/></SelectTrigger><SelectContent>{["assets","verification","depreciation","maintenance","movements","disposals"].map(x=><SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Description (optional)</Label><Input className="h-11" value={description} onChange={e=>setDescription(e.target.value)} placeholder="What is this layout for?"/></div></div><div className="flex justify-end"><Button size="lg" onClick={()=>setStep(2)}>Design layout <ChevronRight className="ml-2 h-5 w-5"/></Button></div></Card>}
     {step===2&&<div className="grid items-start gap-4 lg:grid-cols-[250px_minmax(0,1fr)_280px]">
       <Card className="space-y-4 p-4 lg:sticky lg:top-4"><div><h2 className="flex items-center gap-2 text-lg font-bold"><PanelLeft className="h-5 w-5"/>Add fields</h2><p className="text-sm text-muted-foreground">Tap a field or drag it into the register.</p></div><div className="grid grid-cols-2 gap-2">{[{type:"text",label:"Text",icon:Type},{type:"number",label:"Number",icon:Hash},{type:"currency",label:"Amount",icon:Coins},{type:"date",label:"Date",icon:CalendarDays},{type:"select",label:"Dropdown",icon:ListChecks},{type:"boolean",label:"Yes / No",icon:ToggleLeft},{type:"attachment",label:"File",icon:Paperclip}].map(item=><button key={item.type} type="button" draggable onDragStart={e=>{e.dataTransfer.setData("text/x-builder-type",item.type)}} onClick={()=>addQuick(item.type)} className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed bg-background p-2 text-center text-sm font-semibold transition-all hover:border-primary hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-primary"><item.icon className="h-6 w-6 text-primary"/>{item.label}</button>)}</div><div className="border-t pt-3"><Label className="text-sm">Custom name</Label><div className="mt-2 flex gap-2"><Input value={draftLabel} onChange={e=>setDraftLabel(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();addField()}}} placeholder="Field name" className="h-10"/><Button aria-label="Add named field" onClick={addField} disabled={!draftLabel.trim()}><Plus className="h-5 w-5"/></Button></div><Select value={draftType} onValueChange={setDraftType}><SelectTrigger className="mt-2 h-10"><SelectValue/></SelectTrigger><SelectContent>{types.map(t=><SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></div></Card>
       <Card className="min-w-0 space-y-3 overflow-hidden p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-lg font-bold">{name.trim()||"Your register"}</h2><p className="text-sm text-muted-foreground">Every field appears here instantly. Select one to edit it.</p></div><span className="rounded-full bg-muted px-3 py-1.5 text-sm font-medium">{fields.length} fields</span></div>
       <div onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();const type=e.dataTransfer.getData("text/x-builder-type");if(types.some(t=>t===type))addQuick(type)}} className="min-h-[260px] rounded-xl border-2 border-dashed bg-muted/20 p-3">
         <div className="mb-3 flex items-center gap-2 rounded-lg border bg-card p-3 text-sm font-semibold"><GripVertical className="h-4 w-4 text-muted-foreground"/>Asset Tag <span className="ml-auto text-xs text-muted-foreground">Built-in</span></div>
         <div className="mb-3 flex items-center gap-2 rounded-lg border bg-card p-3 text-sm font-semibold"><GripVertical className="h-4 w-4 text-muted-foreground"/>Asset Name <span className="ml-auto text-xs text-muted-foreground">Built-in</span></div>
         {fields.map((f,index)=><div key={f.id} draggable onDragStart={e=>{e.dataTransfer.setData("text/x-builder-field",f.id);setDragging(f.id)}} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.stopPropagation();e.preventDefault();const id=e.dataTransfer.getData("text/x-builder-field")||dragging;const type=e.dataTransfer.getData("text/x-builder-type");if(id)dropField(id,f.id);else if(types.some(t=>t===type))addQuick(type);setDragging(null)}} onDragEnd={()=>setDragging(null)} className={`mb-2 flex items-center gap-2 rounded-xl border bg-card p-3 transition-colors ${focusField===f.id?"border-primary ring-2 ring-primary/15":"hover:border-primary/60"}`}><GripVertical className="h-5 w-5 shrink-0 cursor-grab text-muted-foreground"/><button className="min-w-0 flex-1 text-left" onClick={()=>setFocusField(f.id)}><span className="block truncate text-base font-semibold">{f.label}</span><span className="block text-sm text-muted-foreground">{f.type}{f.required?" · Required":""}</span></button><Button size="icon" variant="ghost" aria-label="Move up" disabled={index===0} onClick={()=>moveField(f.id,-1)}><ArrowUp className="h-4 w-4"/></Button><Button size="icon" variant="ghost" aria-label="Move down" disabled={index===fields.length-1} onClick={()=>moveField(f.id,1)}><ArrowDown className="h-4 w-4"/></Button><Button size="icon" variant="outline" aria-label="Edit field" onClick={()=>setFocusField(f.id)}><Pencil className="h-4 w-4"/></Button></div>)}
         <button type="button" onClick={()=>addQuick("text")} className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed p-4 text-base font-semibold text-muted-foreground hover:border-primary hover:text-primary"><Plus className="h-5 w-5"/>Add another field</button>
       </div><div className="overflow-x-auto rounded-xl border"><table className="min-w-full text-left text-sm"><thead className="bg-muted"><tr><th className="whitespace-nowrap p-3">Asset Tag</th><th className="whitespace-nowrap p-3">Asset Name</th>{fields.map(f=><th key={f.id} className="whitespace-nowrap p-3">{f.label}</th>)}</tr></thead><tbody><tr><td className="p-3">AF-001</td><td className="p-3">Example asset</td>{fields.map(f=><td key={f.id} className="whitespace-nowrap p-3 text-muted-foreground">{previewField(f)}</td>)}</tr></tbody></table></div>
       <div className="flex flex-wrap items-center justify-between border-t pt-3"><Button variant="outline" onClick={()=>setStep(1)}><ChevronLeft className="mr-1 h-4 w-4"/>Back</Button><Button size="lg" onClick={()=>setStep(3)}>Continue <ChevronRight className="ml-1 h-5 w-5"/></Button></div></Card>
       <Card className="space-y-4 p-4 lg:sticky lg:top-4"><h2 className="flex items-center gap-2 text-lg font-bold"><Settings2 className="h-5 w-5"/>Field settings</h2>{fields.find(f=>f.id===focusField)?<>{fields.filter(f=>f.id===focusField).map(f=><div key={f.id} className="space-y-4"><div className="space-y-2"><Label>Field label</Label><Input className="h-11 text-base" value={f.label} onChange={e=>setFields(p=>p.map(x=>x.id===f.id?{...x,label:e.target.value}:x))}/></div><div className="space-y-2"><Label>Type</Label><Select value={f.type} onValueChange={value=>setFields(p=>p.map(x=>x.id===f.id?{...x,type:value}:x))}><SelectTrigger className="h-11"><SelectValue/></SelectTrigger><SelectContent>{types.map(t=><SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></div>{f.type==="select"&&<div className="space-y-2"><Label>Dropdown choices</Label><Input className="h-11" placeholder="Good, Damaged, Repair" value={(f.options??[]).join(", ")} onChange={e=>setFields(p=>p.map(x=>x.id===f.id?{...x,options:e.target.value.split(",").map(v=>v.trim()).filter(Boolean)}:x))}/></div>}<label className="flex items-center justify-between rounded-lg border p-3 text-sm font-medium">Required <Switch checked={f.required} onCheckedChange={v=>setFields(p=>p.map(x=>x.id===f.id?{...x,required:v}:x))}/></label><Button variant="outline" className="w-full text-destructive" onClick={()=>{setFields(p=>p.filter(x=>x.id!==f.id));setFocusField(null)}}><Trash2 className="mr-2 h-4 w-4"/>Remove field</Button></div>)}</>:<div className="rounded-xl border-2 border-dashed p-6 text-center text-sm text-muted-foreground"><Eye className="mx-auto mb-3 h-7 w-7"/>Select any field in your register to change its settings.</div>}</Card>
     </div>}
     {step===3&&<Card className="mx-auto w-full max-w-3xl space-y-5 p-5 sm:p-8"><div><h2 className="text-xl font-bold">Save your layout</h2><p className="text-sm text-muted-foreground">Choose what your business uses. The original register stays available.</p></div><div className="space-y-2"><Label>Register name</Label><Input className="h-12 text-base" value={name} onChange={e=>setName(e.target.value)} placeholder="Name your layout"/></div><div className="rounded-xl border p-4 space-y-3"><div><p className="text-base font-semibold">Automatic tag numbering</p><p className="text-sm text-muted-foreground">Configure tags for new records without a supplied tag. Example: {tagPrefix}{tagSeparator}{String(16).padStart(tagPadding,"0")}</p></div><div className="grid grid-cols-3 gap-2"><div><Label>Company initials</Label><Input aria-label="Company tag initials" value={tagPrefix} maxLength={10} onChange={e=>setTagPrefix(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,""))}/></div><div><Label>Separator</Label><Select value={tagSeparator||"none"} onValueChange={v=>setTagSeparator(v==="none"?"":v)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="-">Dash</SelectItem><SelectItem value="/">Slash</SelectItem><SelectItem value="none">None</SelectItem></SelectContent></Select></div><div><Label>Digits</Label><Select value={String(tagPadding)} onValueChange={v=>setTagPadding(Number(v))}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{[2,3,4,5,6,7,8,9,10].map(n=><SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent></Select></div></div><Button variant="outline" disabled={busy||!tagPrefix} onClick={saveNumbering}>Save numbering</Button></div><div className="rounded-xl border bg-muted/30 p-4"><p className="text-base font-semibold">Primary register: {items.find(item=>item.id===activeRegister)?.name??"Default register"}</p><p className="mt-1 text-sm text-muted-foreground">Choose Save layout to keep both registers. Choose Save and make primary to use this layout in Assets, Import and Export. Your default register is never deleted.</p></div><div className="rounded-xl border p-4"><p className="font-semibold">{fields.length} custom fields</p><p className="mt-1 text-sm text-muted-foreground">{fields.map(f=>f.label).join(" · ")||"Standard fields only"}</p></div><div className="flex flex-wrap gap-2">{kind==="register_builder"&&<Button size="lg" variant="outline" onClick={downloadRegister}><Download className="mr-2 h-5 w-5"/>Download template</Button>}{selected&&<Button variant="outline" size="lg" disabled={busy} onClick={deactivate}><Archive className="mr-2 h-4 w-4"/>Archive</Button>}{kind==="register_builder"&&<Button variant="outline" size="lg" disabled={busy} onClick={()=>confirmActive(null)}>Use original register</Button>}</div><div className="flex items-center justify-between border-t pt-4"><Button variant="outline" onClick={()=>setStep(2)}><ChevronLeft className="mr-1 h-4 w-4"/>Edit fields</Button><Button size="lg" disabled={busy} onClick={()=>persist(false)}><Save className="mr-2 h-5 w-5"/>{busy?"Saving...":"Save layout"}</Button></div>{kind==="register_builder"&&<Button disabled={busy} className="w-full h-12 text-base font-semibold" onClick={()=>persist(true)}><CheckCircle2 className="mr-2 h-5 w-5"/>Save and make primary register</Button>}</Card>}
   </div>}
   {kind==="register_builder"&&activationPrompt&&<div role="dialog" aria-modal="true" aria-label="Activate custom register" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><Card className="w-full max-w-md space-y-4 p-6"><h2 className="text-lg font-semibold">Use this register as the primary layout?</h2><p className="text-sm text-muted-foreground">Your original default register and existing asset records will be retained. You can keep multiple named registers and download their individual templates.</p><div className="flex flex-wrap justify-end gap-2"><Button variant="outline" onClick={()=>setActivationPrompt(null)}>Keep current default</Button><Button disabled={busy} onClick={()=>confirmActive(activationPrompt)}><CheckCircle2 className="mr-1 h-4 w-4"/> Make primary</Button></div></Card></div>}
 </div>;
}
