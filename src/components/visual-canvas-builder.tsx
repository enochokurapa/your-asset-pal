import {useEffect,useMemo,useState} from "react";
import {useServerFn} from "@tanstack/react-start";
import {useQuery,useQueryClient} from "@tanstack/react-query";
import {getServerAuthHeaders} from "@/lib/auth-headers";
import {listBuilderDefinitions,saveBuilderDefinition,archiveBuilderDefinition,getPublishedCanvasLayouts} from "@/lib/builders.functions";
import {supabase} from "@/integrations/supabase/client";
import {useAuth} from "@/hooks/use-auth";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {Card} from "@/components/ui/card";
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from "@/components/ui/select";
import {toast} from "sonner";
import {BarChart3,LineChart,PieChart as PieIcon,Hash,Type,Image as ImageIcon,Table2,GripVertical,Trash2,ArrowUp,ArrowDown,Save,Plus,Download} from "lucide-react";
import {ResponsiveContainer,BarChart,Bar,LineChart as LinePlot,Line,PieChart,Pie,Cell,XAxis,YAxis,Tooltip} from "recharts";
import * as XLSX from "xlsx";

export type CanvasKind="dashboard_builder"|"report_builder";
export type CanvasWidget={id:string,type:"kpi"|"bar"|"line"|"pie"|"text"|"image"|"table",title:string,metric?:string,groupBy?:string,content?:string,imageUrl?:string,columns?:string[],width?:"third"|"half"|"twoThirds"|"full",sectionId?:string};
export type CanvasSection={id:string,title:string,columns:1|2|3};
export type CanvasConfig={widgets:CanvasWidget[],sections?:CanvasSection[],source:"assets"};
type Saved={id:string,name:string,description:string,configuration:CanvasConfig,is_active:boolean};

const METRICS=[{id:"count",label:"Number of assets"},{id:"value",label:"Purchase value"},{id:"in_use",label:"Assets in use"},{id:"in_storage",label:"Assets in storage"},{id:"missing",label:"Missing assets"},{id:"under_repair",label:"Under repair"}];
const GROUPS=[{id:"status",label:"Status"},{id:"branch",label:"Branch"},{id:"category",label:"Category"},{id:"location",label:"Location"},{id:"month",label:"Registration month"}];
const COLUMNS=[{id:"asset_tag",label:"Asset tag"},{id:"name",label:"Asset name"},{id:"serial_number",label:"Serial number"},{id:"status",label:"Status"},{id:"branch",label:"Branch"},{id:"category",label:"Category"},{id:"location",label:"Location"},{id:"purchase_value",label:"Purchase value"}];
const TYPES=[{type:"kpi",label:"Number / KPI",icon:Hash},{type:"bar",label:"Bar chart",icon:BarChart3},{type:"line",label:"Line chart",icon:LineChart},{type:"pie",label:"Pie chart",icon:PieIcon},{type:"text",label:"Heading / Text",icon:Type},{type:"image",label:"Image",icon:ImageIcon},{type:"table",label:"Data table",icon:Table2}] as const;
const initial=(type:CanvasWidget["type"]):CanvasWidget=>({id:crypto.randomUUID(),type,title:TYPES.find(t=>t.type===type)?.label??"Widget",metric:"count",groupBy:"status",content:"",columns:["asset_tag","name","status"],width:type==="table"?"full":"half"});

function metricValue(rows:any[],metric:string){
 if(metric==="value")return rows.reduce((sum,a)=>sum+Number(a.purchase_value??0),0);
 if(metric==="count")return rows.length;
 return rows.filter(a=>a.status===metric).length;
}
function groupValue(a:any,key:string){
 if(key==="month")return a.created_at?String(a.created_at).slice(0,7):"Unknown";
 if(key==="branch")return a.branches?.name??"Unassigned";
 if(key==="category")return a.categories?.name??"Unassigned";
 if(key==="location")return a.locations?.name??"Unassigned";
 return String(a.status??"Unknown").replaceAll("_"," ");
}
function chartRows(assets:any[],widget:CanvasWidget){
 const buckets=new Map<string,any[]>();
 for(const a of assets){const k=groupValue(a,widget.groupBy??"status");buckets.set(k,[...(buckets.get(k)??[]),a]);}
 return [...buckets].map(([name,items])=>({name,value:metricValue(items,widget.metric??"count")})).sort((a,b)=>b.value-a.value).slice(0,20);
}
const palette=["#2563eb","#16a34a","#d97706","#9333ea","#0891b2","#dc2626","#64748b"];
function Widget({widget,assets,preview=false}:{widget:CanvasWidget,assets:any[],preview?:boolean}){
 const rows=chartRows(assets,widget);
 return <div className="min-w-0 space-y-2">
  <h3 className="text-base font-semibold">{widget.title||"Untitled"}</h3>
  {widget.type==="text"&&<p className="whitespace-pre-wrap text-sm">{widget.content||"Enter text in the settings panel"}</p>}
  {widget.type==="image"&&(widget.imageUrl&&/^https:\/\//i.test(widget.imageUrl)?<img alt={widget.title} src={widget.imageUrl} className="max-h-64 w-full rounded-lg object-contain"/>:<p className="text-sm text-muted-foreground">Choose an HTTPS image link</p>)}
  {widget.type==="kpi"&&<p className="text-3xl font-bold tabular-nums">{metricValue(assets,widget.metric??"count").toLocaleString()}</p>}
  {(widget.type==="bar"||widget.type==="line"||widget.type==="pie")&&<div className="h-56 w-full">
   <ResponsiveContainer width="100%" height="100%">
    {widget.type==="bar"?<BarChart data={rows}><XAxis dataKey="name" hide={rows.length>8}/><YAxis/><Tooltip/><Bar dataKey="value" fill={palette[0]}/></BarChart>:
     widget.type==="line"?<LinePlot data={rows}><XAxis dataKey="name" hide={rows.length>8}/><YAxis/><Tooltip/><Line dataKey="value" stroke={palette[0]} strokeWidth={2}/></LinePlot>:
     <PieChart><Pie data={rows} dataKey="value" nameKey="name" outerRadius={78} label={rows.length<=6}>{rows.map((r,i)=><Cell key={r.name} fill={palette[i%palette.length]}/>)}</Pie><Tooltip/></PieChart>}
   </ResponsiveContainer>
  </div>}
  {widget.type==="table"&&<div className="max-h-80 overflow-auto"><table className="w-full text-sm"><thead><tr className="border-b">{(widget.columns??["asset_tag","name"]).map(c=><th className="p-2 text-left" key={c}>{COLUMNS.find(x=>x.id===c)?.label??c}</th>)}</tr></thead><tbody>{assets.slice(0,preview?5:100).map((a,i)=><tr key={a.id??i} className="border-b">{(widget.columns??["asset_tag","name"]).map(c=><td className="p-2" key={c}>{c==="branch"?a.branches?.name??"":c==="category"?a.categories?.name??"":c==="location"?a.locations?.name??"":String(a[c]??"")}</td>)}</tr>)}</tbody></table></div>}
 </div>;
}
const widthSpan=(width:CanvasWidget["width"],columns:1|2|3=2)=>columns===1?"lg:col-span-12":columns===3?(width==="full"?"lg:col-span-12":width==="twoThirds"?"lg:col-span-8":"lg:col-span-4"):(width==="full"?"lg:col-span-12":width==="twoThirds"?"lg:col-span-8":width==="third"?"lg:col-span-4":"lg:col-span-6");
export function CanvasDisplay({widgets,assets,preview=false,sections=[]}:{widgets:CanvasWidget[],assets:any[],preview?:boolean,sections?:CanvasSection[]}){
 const groups=sections.length?sections:[{id:"default",title:"",columns:2 as const}];
 return <div className="space-y-5">{groups.map(section=><section key={section.id} className="min-w-0 space-y-3">{section.title&&<h2 className="text-lg font-semibold">{section.title}</h2>}<div className="grid grid-cols-1 gap-4 lg:grid-cols-12">{widgets.filter(w=>sections.length?w.sectionId===section.id||(!w.sectionId&&section.id===sections[0].id):true).map(w=><Card key={w.id} className={`min-w-0 p-5 ${widthSpan(w.width,section.columns)}`}><Widget widget={w} assets={assets} preview={preview}/></Card>)}</div></section>)}</div>;
}
export function useCanvasAssets(enabled=true){
 const {tenantId,canSeeBranch}=useAuth();
 return useQuery({queryKey:["custom-canvas-assets",tenantId],enabled:enabled&&!!tenantId,queryFn:async()=>{
  const {data,error}=await supabase.from("assets").select("id,name,asset_tag,serial_number,status,purchase_value,created_at,branch_id,branches(name),categories(name),locations(name)");
  if(error)throw error;
  return (data??[]).filter(a=>canSeeBranch(a.branch_id));
 }});
}
export function VisualCanvasBuilder({kind}:{kind:CanvasKind}){
 const [items,setItems]=useState<Saved[]>([]);
 const [selected,setSelected]=useState("new");
 const [title,setTitle]=useState("");
 const [description,setDescription]=useState("");
 const [widgets,setWidgets]=useState<CanvasWidget[]>([]);
 const [sections,setSections]=useState<CanvasSection[]>([{id:"default",title:"Main section",columns:2}]);
 const [activeSection,setActiveSection]=useState("default");
 const [focused,setFocused]=useState<string|null>(null);
 const [dragged,setDragged]=useState<string|null>(null);
 const [saving,setSaving]=useState(false);
 const list=useServerFn(listBuilderDefinitions),save=useServerFn(saveBuilderDefinition),archive=useServerFn(archiveBuilderDefinition);
 const data=useCanvasAssets();
 const refresh=async()=>{const result=await list({headers:await getServerAuthHeaders(),data:{kind}});if(!Array.isArray(result))throw new Error("Unable to load layout definitions");setItems(result.filter((item):item is Saved=>Boolean(item&&typeof item.id==="string")))};
 useEffect(()=>{let valid=true;(async()=>{const result=await list({headers:await getServerAuthHeaders(),data:{kind}});if(!Array.isArray(result))throw new Error("Unable to load layout definitions");if(!valid)return;const rows=result.filter((item):item is Saved=>Boolean(item&&typeof item.id==="string"));setItems(rows);const latest=rows.find(item=>item.is_active);if(latest){setSelected(latest.id);setTitle(latest.name);setDescription(latest.description??"");setWidgets(Array.isArray(latest.configuration?.widgets)?latest.configuration.widgets:[]);const loaded=Array.isArray(latest.configuration?.sections)&&latest.configuration.sections.length?latest.configuration.sections:[{id:"default",title:"Main section",columns:2 as const}];setSections(loaded);setActiveSection(loaded[0].id);setFocused(null);}})().catch(e=>{if(valid)toast.error(e.message)});return()=>{valid=false}},[kind]);
 const choose=(id:string)=>{setSelected(id);const item=items.find(x=>x.id===id);setTitle(item?.name??"");setDescription(item?.description??"");setWidgets(Array.isArray(item?.configuration?.widgets)?item.configuration.widgets:[]);const loaded=Array.isArray(item?.configuration?.sections)&&item.configuration.sections.length?item.configuration.sections:[{id:"default",title:"Main section",columns:2 as const}];setSections(loaded);setActiveSection(loaded[0].id);setFocused(null)};
 const add=(type:CanvasWidget["type"])=>{const w={...initial(type),sectionId:activeSection};setWidgets(x=>[...x,w]);setFocused(w.id)};
 const patch=(id:string,change:Partial<CanvasWidget>)=>setWidgets(x=>x.map(w=>w.id===id?{...w,...change}:w));
 const move=(from:string,to:string)=>setWidgets(x=>{const a=[...x],i=a.findIndex(w=>w.id===from),j=a.findIndex(w=>w.id===to);if(i<0||j<0||i===j)return x;a.splice(j,0,...a.splice(i,1));return a});
 const persist=async()=>{if(title.trim().length<2||!widgets.length){toast.error("Give your layout a name and add at least one element.");return;}setSaving(true);try{const headers=await getServerAuthHeaders();const row=await save({headers,data:{kind,id:selected==="new"?undefined:selected,name:title.trim(),description,configuration:{source:"assets",widgets,sections},is_active:true}});if(!Array.isArray(row.definitions)||!row.definitions.some((item:Saved)=>item.id===row.id))throw new Error("Layout save was not verified in the business catalog");setItems(row.definitions.filter((item:Saved)=>item&&typeof item.id==="string"));setSelected(row.id);toast.success("Layout published to your "+(kind==="dashboard_builder"?"dashboard":"reports")+" page");}catch(e:any){toast.error(e.message||"Could not save layout")}finally{setSaving(false)}};
 const remove=async()=>{if(selected==="new")return;setSaving(true);try{const headers=await getServerAuthHeaders();await archive({headers,data:{kind,id:selected,reason:"Archived by the owner from the canvas builder"}});await refresh();choose("new");toast.success("Layout archived")}catch(e:any){toast.error(e.message)}finally{setSaving(false)}};
 const active=widgets.find(w=>w.id===focused);
 return <div className="space-y-4">
 <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4"><div className="min-w-48 flex-1"><Label>Saved {kind==="dashboard_builder"?"dashboards":"reports"}</Label><Select value={selected} onValueChange={choose}><SelectTrigger className="mt-2 h-11"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="new">New layout</SelectItem>{items.filter(i=>i.is_active).map(item=><SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select></div><div className="min-w-52 flex-[2]"><Label>Title</Label><Input className="mt-2 h-11" value={title} onChange={e=>setTitle(e.target.value)} placeholder="My asset dashboard"/></div><Button variant="outline" onClick={()=>choose("new")}><Plus className="mr-2 h-4 w-4"/>New</Button><Button onClick={persist} disabled={saving}><Save className="mr-2 h-4 w-4"/>{saving?"Saving…":"Save & publish"}</Button>{selected!=="new"&&<Button variant="outline" onClick={remove} disabled={saving}>Archive</Button>}</div>
 <div className="rounded-xl border bg-card p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-semibold">Page sections</h2><p className="text-xs text-muted-foreground">Design full-width or side-by-side sections, then drag elements to reorder.</p></div><Button variant="outline" size="sm" onClick={()=>{const id=crypto.randomUUID();setSections(x=>[...x,{id,title:"New section",columns:2}]);setActiveSection(id)}}><Plus className="mr-2 h-4 w-4"/>Add section</Button></div><div className="mt-3 flex flex-wrap gap-2">{sections.map(sec=><button type="button" key={sec.id} onClick={()=>setActiveSection(sec.id)} className={`rounded-lg border px-3 py-2 text-sm ${activeSection===sec.id?"border-primary bg-primary/5":""}`}>{sec.title||"Untitled section"}</button>)}</div><div className="mt-3 flex flex-wrap items-center gap-3"><Label>Section title</Label><Input className="max-w-52" value={sections.find(x=>x.id===activeSection)?.title??""} onChange={e=>setSections(x=>x.map(y=>y.id===activeSection?{...y,title:e.target.value}:y))}/><Label>Columns</Label><Select value={String(sections.find(x=>x.id===activeSection)?.columns??2)} onValueChange={v=>setSections(x=>x.map(y=>y.id===activeSection?{...y,columns:Number(v) as 1|2|3}:y))}><SelectTrigger className="w-44"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="1">Full-width</SelectItem><SelectItem value="2">Two columns</SelectItem><SelectItem value="3">Three columns</SelectItem></SelectContent></Select>{sections.length>1&&<Button size="sm" variant="outline" onClick={()=>{const fallback=sections.find(x=>x.id!==activeSection)!;setWidgets(x=>x.map(w=>w.sectionId===activeSection?{...w,sectionId:fallback.id}:w));setSections(x=>x.filter(y=>y.id!==activeSection));setActiveSection(fallback.id)}}>Remove section (retain elements)</Button>}</div></div>
 <div className="grid items-start gap-4 lg:grid-cols-[210px_minmax(0,1fr)_260px]">
  <Card className="space-y-3 p-4"><h2 className="font-semibold">Elements</h2><p className="text-sm text-muted-foreground">Click or drag into your design</p><div className="grid grid-cols-2 gap-2 lg:grid-cols-1">{TYPES.map(t=><button key={t.type} draggable onDragStart={e=>e.dataTransfer.setData("text/widget-type",t.type)} onClick={()=>add(t.type)} className="flex items-center gap-3 rounded-lg border p-3 text-left text-sm hover:border-primary hover:bg-muted"><t.icon className="h-5 w-5 text-primary"/>{t.label}</button>)}</div></Card>
  <div className="min-w-0 space-y-3 rounded-xl border bg-muted/20 p-4" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();const type=e.dataTransfer.getData("text/widget-type");if(TYPES.some(t=>t.type===type))add(type as CanvasWidget["type"])}}>
   <h2 className="text-lg font-semibold">Live {kind==="dashboard_builder"?"dashboard":"report"}</h2>
   {!widgets.length&&<div className="rounded-xl border-2 border-dashed p-12 text-center text-muted-foreground">Add an element from the left. Your layout appears here instantly.</div>}
   <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">{widgets.filter(w=>w.sectionId===activeSection||(!w.sectionId&&activeSection===sections[0].id)).map((w,i)=><div key={w.id} draggable onDragStart={e=>{setDragged(w.id);e.dataTransfer.setData("text/widget-id",w.id)}} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.stopPropagation();const id=e.dataTransfer.getData("text/widget-id")||dragged;if(id)move(id,w.id);setDragged(null)}} className={`min-w-0 rounded-xl border bg-card p-3 ${widthSpan(w.width,sections.find(s=>s.id===activeSection)?.columns??2)} ${focused===w.id?"border-primary ring-2 ring-primary/20":""}`}><div className="mb-2 flex items-center gap-1 border-b pb-2"><GripVertical className="h-4 w-4 cursor-grab text-muted-foreground"/><button className="flex-1 truncate text-left text-sm font-medium" onClick={()=>setFocused(w.id)}>{w.title}</button><Button size="icon" variant="ghost" disabled={i===0} onClick={()=>move(w.id,widgets.filter(q=>q.sectionId===activeSection||(!q.sectionId&&activeSection===sections[0].id))[i-1].id)}><ArrowUp className="h-4 w-4"/></Button><Button size="icon" variant="ghost" disabled={i===widgets.filter(q=>q.sectionId===activeSection||(!q.sectionId&&activeSection===sections[0].id)).length-1} onClick={()=>move(w.id,widgets.filter(q=>q.sectionId===activeSection||(!q.sectionId&&activeSection===sections[0].id))[i+1].id)}><ArrowDown className="h-4 w-4"/></Button><Button size="icon" variant="ghost" onClick={()=>{setWidgets(x=>x.filter(v=>v.id!==w.id));setFocused(null)}}><Trash2 className="h-4 w-4"/></Button></div><div onClick={()=>setFocused(w.id)}><Widget widget={w} assets={data.data??[]} preview/></div></div>)}</div>
  </div>
  <Card className="space-y-4 p-4"><h2 className="font-semibold">Element settings</h2>{!active?<p className="text-sm text-muted-foreground">Select an element to edit its content, chart, or appearance.</p>:<><div><Label>Title</Label><Input className="mt-1" value={active.title} onChange={e=>patch(active.id,{title:e.target.value})}/></div><div><Label>Width</Label><Select value={active.width??"half"} onValueChange={v=>patch(active.id,{width:v as CanvasWidget["width"]})}><SelectTrigger className="mt-1"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="third">One third</SelectItem><SelectItem value="half">Half width</SelectItem><SelectItem value="twoThirds">Two thirds</SelectItem><SelectItem value="full">Full width</SelectItem></SelectContent></Select></div><div><Label>Section</Label><Select value={active.sectionId??sections[0].id} onValueChange={v=>patch(active.id,{sectionId:v})}><SelectTrigger className="mt-1"><SelectValue/></SelectTrigger><SelectContent>{sections.map(x=><SelectItem key={x.id} value={x.id}>{x.title||"Section"}</SelectItem>)}</SelectContent></Select></div>{["kpi","bar","line","pie"].includes(active.type)&&<div><Label>Measure</Label><Select value={active.metric??"count"} onValueChange={v=>patch(active.id,{metric:v})}><SelectTrigger className="mt-1"><SelectValue/></SelectTrigger><SelectContent>{METRICS.map(m=><SelectItem value={m.id} key={m.id}>{m.label}</SelectItem>)}</SelectContent></Select></div>}{["bar","line","pie"].includes(active.type)&&<div><Label>Group by</Label><Select value={active.groupBy??"status"} onValueChange={v=>patch(active.id,{groupBy:v})}><SelectTrigger className="mt-1"><SelectValue/></SelectTrigger><SelectContent>{GROUPS.map(g=><SelectItem value={g.id} key={g.id}>{g.label}</SelectItem>)}</SelectContent></Select></div>}{active.type==="text"&&<div><Label>Text</Label><textarea rows={5} className="mt-1 w-full rounded-md border bg-background p-2 text-sm" value={active.content??""} onChange={e=>patch(active.id,{content:e.target.value})}/></div>}{active.type==="image"&&<div><Label>HTTPS image URL</Label><Input className="mt-1" value={active.imageUrl??""} onChange={e=>patch(active.id,{imageUrl:e.target.value})}/></div>}{active.type==="table"&&<div className="space-y-2"><Label>Table columns</Label>{COLUMNS.map(c=><label key={c.id} className="flex gap-2 text-sm"><input type="checkbox" checked={(active.columns??[]).includes(c.id)} onChange={e=>patch(active.id,{columns:e.target.checked?[...(active.columns??[]),c.id]:(active.columns??[]).filter(x=>x!==c.id)})}/>{c.label}</label>)}</div>}</>}</Card>
 </div>
 <p className="text-xs text-muted-foreground">Charts and tables use tenant-scoped asset records and respect branch access. Existing operational dashboards and reports remain available.</p>
 </div>;
}
export function PublishedCanvases({kind}:{kind:CanvasKind}){
 const {tenantId}=useAuth();
 const publishedFn=useServerFn(getPublishedCanvasLayouts);const {data:rawLayouts,isLoading,error:layoutsError}=useQuery({queryKey:["published-canvas",tenantId,kind],enabled:!!tenantId,retry:1,queryFn:async()=>{const response=await publishedFn({headers:await getServerAuthHeaders(),data:{kind}});if(!Array.isArray(response))throw new Error("Published layouts service returned an invalid response");return response.filter((row):row is Saved=>Boolean(row&&typeof row==="object"&&typeof row.id==="string"&&typeof row.name==="string"));}});const layouts=Array.isArray(rawLayouts)?rawLayouts:[];
 const assets=useCanvasAssets(layouts.length>0);
 const [selected,setSelected]=useState("");
 useEffect(()=>{if(layouts.length&&!layouts.some(x=>x.id===selected))setSelected(layouts[0].id)},[layouts,selected]);
 const current=layouts.find(x=>x.id===selected);
 const exportTable=()=>{if(!current)return;const wb=XLSX.utils.book_new();const ws=XLSX.utils.json_to_sheet((assets.data??[]).map(a=>({Tag:a.asset_tag,Name:a.name,Status:a.status,Value:a.purchase_value,Branch:a.branches?.name,Location:a.locations?.name})));XLSX.utils.book_append_sheet(wb,ws,"Assets");XLSX.writeFile(wb,current.name.replace(/[^a-z0-9]/gi,"_")+".xlsx");};
 if(layoutsError){console.error("[PublishedCanvases] Could not load layouts",layoutsError);return <Card className="p-4 text-sm text-destructive">Custom layouts could not be loaded: {layoutsError.message}</Card>;}if(!layouts.length)return null;
 return <Card className="space-y-4 p-5">{kind==="report_builder"&&<div className="space-y-2"><h3 className="font-semibold">Saved report catalog</h3><p className="text-xs text-muted-foreground">Select a report to preview its configured layout and data.</p><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{layouts.map(layout=><button key={layout.id} type="button" onClick={()=>setSelected(layout.id)} className={`rounded-lg border p-3 text-left text-sm transition-colors ${selected===layout.id?"border-primary bg-primary/5":"hover:bg-muted/50"}`}><span className="block font-medium">{layout.name}</span><span className="text-xs text-muted-foreground">{(layout.configuration?.widgets??[]).length} report elements · {selected===layout.id?"Previewing":"Click to preview"}</span></button>)}</div></div>}<div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-lg font-bold">Custom {kind==="dashboard_builder"?"dashboards":"reports"}</h2><p className="text-sm text-muted-foreground">Layouts created in Builder Studio</p></div><div className="flex gap-2"><Select value={selected} onValueChange={setSelected}><SelectTrigger className="min-w-44"><SelectValue/></SelectTrigger><SelectContent>{layouts.map(l=><SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectContent></Select>{kind==="report_builder"&&<Button variant="outline" onClick={exportTable}><Download className="mr-2 h-4 w-4"/>Excel</Button>}</div></div>{current&&<CanvasDisplay widgets={current.configuration?.widgets??[]} assets={assets.data??[]} sections={current.configuration?.sections??[]}/>}</Card>;
}
