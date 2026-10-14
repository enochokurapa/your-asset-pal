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
export type CanvasWidget={id:string,type:"kpi"|"bar"|"line"|"pie"|"text"|"image"|"table",title:string,metric?:string,groupBy?:string,content?:string,imageUrl?:string,columns?:string[],width?:"half"|"full"};
export type CanvasConfig={widgets:CanvasWidget[],source:"assets"};
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
export function CanvasDisplay({widgets,assets,preview=false}:{widgets:CanvasWidget[],assets:any[],preview?:boolean}){
 return <div className="grid gap-4 md:grid-cols-2">{widgets.map(w=><Card key={w.id} className={`p-5 ${w.width==="full"?"md:col-span-2":""}`}><Widget widget={w} assets={assets} preview={preview}/></Card>)}</div>;
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
 const [focused,setFocused]=useState<string|null>(null);
 const [dragged,setDragged]=useState<string|null>(null);
 const [saving,setSaving]=useState(false);
 const list=useServerFn(listBuilderDefinitions),save=useServerFn(saveBuilderDefinition),archive=useServerFn(archiveBuilderDefinition);
 const data=useCanvasAssets();
 const refresh=async()=>{const headers=await getServerAuthHeaders();const result=await list({headers,data:{kind}});setItems(result as Saved[])};
 useEffect(()=>{refresh().catch(e=>toast.error(e.message))},[kind]);
 const choose=(id:string)=>{setSelected(id);const item=items.find(x=>x.id===id);setTitle(item?.name??"");setDescription(item?.description??"");setWidgets(Array.isArray(item?.configuration?.widgets)?item.configuration.widgets:[]);setFocused(null)};
 const add=(type:CanvasWidget["type"])=>{const w=initial(type);setWidgets(x=>[...x,w]);setFocused(w.id)};
 const patch=(id:string,change:Partial<CanvasWidget>)=>setWidgets(x=>x.map(w=>w.id===id?{...w,...change}:w));
 const move=(from:string,to:string)=>setWidgets(x=>{const a=[...x],i=a.findIndex(w=>w.id===from),j=a.findIndex(w=>w.id===to);if(i<0||j<0||i===j)return x;a.splice(j,0,...a.splice(i,1));return a});
 const persist=async()=>{if(title.trim().length<2||!widgets.length){toast.error("Give your layout a name and add at least one element.");return;}setSaving(true);try{const headers=await getServerAuthHeaders();const row=await save({headers,data:{kind,id:selected==="new"?undefined:selected,name:title.trim(),description,configuration:{source:"assets",widgets},is_active:true}});await refresh();setSelected(row.id);toast.success("Layout published to your "+(kind==="dashboard_builder"?"dashboard":"reports")+" page");}catch(e:any){toast.error(e.message||"Could not save layout")}finally{setSaving(false)}};
 const remove=async()=>{if(selected==="new")return;setSaving(true);try{const headers=await getServerAuthHeaders();await archive({headers,data:{kind,id:selected}});await refresh();choose("new");toast.success("Layout archived")}catch(e:any){toast.error(e.message)}finally{setSaving(false)}};
 const active=widgets.find(w=>w.id===focused);
 return <div className="space-y-4">
 <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4"><div className="min-w-48 flex-1"><Label>Saved {kind==="dashboard_builder"?"dashboards":"reports"}</Label><Select value={selected} onValueChange={choose}><SelectTrigger className="mt-2 h-11"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="new">New layout</SelectItem>{items.filter(i=>i.is_active).map(item=><SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select></div><div className="min-w-52 flex-[2]"><Label>Title</Label><Input className="mt-2 h-11" value={title} onChange={e=>setTitle(e.target.value)} placeholder="My asset dashboard"/></div><Button variant="outline" onClick={()=>choose("new")}><Plus className="mr-2 h-4 w-4"/>New</Button><Button onClick={persist} disabled={saving}><Save className="mr-2 h-4 w-4"/>{saving?"Saving…":"Save & publish"}</Button>{selected!=="new"&&<Button variant="outline" onClick={remove} disabled={saving}>Archive</Button>}</div>
 <div className="grid items-start gap-4 lg:grid-cols-[210px_minmax(0,1fr)_260px]">
  <Card className="space-y-3 p-4"><h2 className="font-semibold">Elements</h2><p className="text-sm text-muted-foreground">Click or drag into your design</p><div className="grid grid-cols-2 gap-2 lg:grid-cols-1">{TYPES.map(t=><button key={t.type} draggable onDragStart={e=>e.dataTransfer.setData("text/widget-type",t.type)} onClick={()=>add(t.type)} className="flex items-center gap-3 rounded-lg border p-3 text-left text-sm hover:border-primary hover:bg-muted"><t.icon className="h-5 w-5 text-primary"/>{t.label}</button>)}</div></Card>
  <div className="min-w-0 space-y-3 rounded-xl border bg-muted/20 p-4" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();const type=e.dataTransfer.getData("text/widget-type");if(TYPES.some(t=>t.type===type))add(type as CanvasWidget["type"])}}>
   <h2 className="text-lg font-semibold">Live {kind==="dashboard_builder"?"dashboard":"report"}</h2>
   {!widgets.length&&<div className="rounded-xl border-2 border-dashed p-12 text-center text-muted-foreground">Add an element from the left. Your layout appears here instantly.</div>}
   <div className="grid gap-3 md:grid-cols-2">{widgets.map((w,i)=><div key={w.id} draggable onDragStart={e=>{setDragged(w.id);e.dataTransfer.setData("text/widget-id",w.id)}} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.stopPropagation();const id=e.dataTransfer.getData("text/widget-id")||dragged;if(id)move(id,w.id);setDragged(null)}} className={`min-w-0 rounded-xl border bg-card p-3 ${w.width==="full"?"md:col-span-2":""} ${focused===w.id?"border-primary ring-2 ring-primary/20":""}`}><div className="mb-2 flex items-center gap-1 border-b pb-2"><GripVertical className="h-4 w-4 cursor-grab text-muted-foreground"/><button className="flex-1 truncate text-left text-sm font-medium" onClick={()=>setFocused(w.id)}>{w.title}</button><Button size="icon" variant="ghost" disabled={i===0} onClick={()=>move(w.id,widgets[i-1].id)}><ArrowUp className="h-4 w-4"/></Button><Button size="icon" variant="ghost" disabled={i===widgets.length-1} onClick={()=>move(w.id,widgets[i+1].id)}><ArrowDown className="h-4 w-4"/></Button><Button size="icon" variant="ghost" onClick={()=>{setWidgets(x=>x.filter(v=>v.id!==w.id));setFocused(null)}}><Trash2 className="h-4 w-4"/></Button></div><div onClick={()=>setFocused(w.id)}><Widget widget={w} assets={data.data??[]} preview/></div></div>)}</div>
  </div>
  <Card className="space-y-4 p-4"><h2 className="font-semibold">Element settings</h2>{!active?<p className="text-sm text-muted-foreground">Select an element to edit its content, chart, or appearance.</p>:<><div><Label>Title</Label><Input className="mt-1" value={active.title} onChange={e=>patch(active.id,{title:e.target.value})}/></div><div><Label>Width</Label><Select value={active.width??"half"} onValueChange={v=>patch(active.id,{width:v as "half"|"full"})}><SelectTrigger className="mt-1"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="half">Half width</SelectItem><SelectItem value="full">Full width</SelectItem></SelectContent></Select></div>{["kpi","bar","line","pie"].includes(active.type)&&<div><Label>Measure</Label><Select value={active.metric??"count"} onValueChange={v=>patch(active.id,{metric:v})}><SelectTrigger className="mt-1"><SelectValue/></SelectTrigger><SelectContent>{METRICS.map(m=><SelectItem value={m.id} key={m.id}>{m.label}</SelectItem>)}</SelectContent></Select></div>}{["bar","line","pie"].includes(active.type)&&<div><Label>Group by</Label><Select value={active.groupBy??"status"} onValueChange={v=>patch(active.id,{groupBy:v})}><SelectTrigger className="mt-1"><SelectValue/></SelectTrigger><SelectContent>{GROUPS.map(g=><SelectItem value={g.id} key={g.id}>{g.label}</SelectItem>)}</SelectContent></Select></div>}{active.type==="text"&&<div><Label>Text</Label><textarea rows={5} className="mt-1 w-full rounded-md border bg-background p-2 text-sm" value={active.content??""} onChange={e=>patch(active.id,{content:e.target.value})}/></div>}{active.type==="image"&&<div><Label>HTTPS image URL</Label><Input className="mt-1" value={active.imageUrl??""} onChange={e=>patch(active.id,{imageUrl:e.target.value})}/></div>}{active.type==="table"&&<div className="space-y-2"><Label>Table columns</Label>{COLUMNS.map(c=><label key={c.id} className="flex gap-2 text-sm"><input type="checkbox" checked={(active.columns??[]).includes(c.id)} onChange={e=>patch(active.id,{columns:e.target.checked?[...(active.columns??[]),c.id]:(active.columns??[]).filter(x=>x!==c.id)})}/>{c.label}</label>)}</div>}</>}</Card>
 </div>
 <p className="text-xs text-muted-foreground">Charts and tables use tenant-scoped asset records and respect branch access. Existing operational dashboards and reports remain available.</p>
 </div>;
}
export function PublishedCanvases({kind}:{kind:CanvasKind}){
 const {tenantId}=useAuth();const getPublished=useServerFn(getPublishedCanvasLayouts);const {data:layouts=[],isLoading}=useQuery({queryKey:["published-canvas",tenantId,kind],enabled:!!tenantId,queryFn:async()=>await getPublished({headers:await getServerAuthHeaders(),data:{kind}}) as Saved[]});
 const assets=useCanvasAssets(layouts.length>0);
 const [selected,setSelected]=useState("");
 useEffect(()=>{if(layouts.length&&!layouts.some(x=>x.id===selected))setSelected(layouts[0].id)},[layouts,selected]);
 const current=layouts.find(x=>x.id===selected);
 const exportTable=()=>{if(!current)return;const wb=XLSX.utils.book_new();const ws=XLSX.utils.json_to_sheet((assets.data??[]).map(a=>({Tag:a.asset_tag,Name:a.name,Status:a.status,Value:a.purchase_value,Branch:a.branches?.name,Location:a.locations?.name})));XLSX.utils.book_append_sheet(wb,ws,"Assets");XLSX.writeFile(wb,current.name.replace(/[^a-z0-9]/gi,"_")+".xlsx");};
 if(!layouts.length)return null;
 return <Card className="space-y-4 p-5"><div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-lg font-bold">Custom {kind==="dashboard_builder"?"dashboards":"reports"}</h2><p className="text-sm text-muted-foreground">Layouts created in Builder Studio</p></div><div className="flex gap-2"><Select value={selected} onValueChange={setSelected}><SelectTrigger className="min-w-44"><SelectValue/></SelectTrigger><SelectContent>{layouts.map(l=><SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectContent></Select>{kind==="report_builder"&&<Button variant="outline" onClick={exportTable}><Download className="mr-2 h-4 w-4"/>Excel</Button>}</div></div>{current&&<CanvasDisplay widgets={current.configuration?.widgets??[]} assets={assets.data??[]}/>}</Card>;
}
