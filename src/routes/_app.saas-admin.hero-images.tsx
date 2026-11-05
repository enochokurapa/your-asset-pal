import {createFileRoute,Navigate,Link} from "@tanstack/react-router";
import {useEffect,useRef,useState} from "react";
import {useServerFn} from "@tanstack/react-start";
import {useQuery,useQueryClient} from "@tanstack/react-query";
import {useAuth} from "@/hooks/use-auth";
import {getServerAuthHeaders} from "@/lib/auth-headers";
import {
 getHeroImage,listPlatformHeroImages,setPlatformHeroImage,clearPlatformHeroImage
} from "@/lib/platform-hero.functions";
import {Button} from "@/components/ui/button";
import {Card} from "@/components/ui/card";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {toast} from "sonner";
import {ImageIcon,Upload,RotateCcw,ExternalLink} from "lucide-react";

export const Route=createFileRoute("/_app/saas-admin/hero-images")({
  component:HeroSettings,
});
type Page="home"|"home_2"|"home_3"|"features"|"solutions"|"pricing"|"about";
const pages:{key:Page;label:string;url:string}[]=[
 {key:"home",label:"Homepage · Slide 1 (Lifecycle)",url:"/"},
 {key:"home_2",label:"Homepage · Slide 2 (Locations)",url:"/"},
 {key:"home_3",label:"Homepage · Slide 3 (Reporting)",url:"/"},
 {key:"features",label:"Features",url:"/features"},
 {key:"solutions",label:"Solutions",url:"/solutions"},
 {key:"pricing",label:"Plans & Pricing",url:"/pricing"},
 {key:"about",label:"About AssetFlow",url:"/about"},
];
const MAX_BYTES=300_000;
const defaultAlt="AssetFlow 360 visual overview of the complete fixed asset management lifecycle";
function HeroSettings(){
 const {isSaasAdmin,loading}=useAuth();
 const qc=useQueryClient();
 const inputRef=useRef<HTMLInputElement>(null);
 const [page,setPage]=useState<Page>("home");
 const [fileName,setFileName]=useState("");
 const [candidate,setCandidate]=useState("");
 const [altText,setAltText]=useState(defaultAlt);
 const [dimension,setDimension]=useState("");
 const [layout,setLayout]=useState<"standard"|"approved_home_lifecycle">("approved_home_lifecycle");
 const [busy,setBusy]=useState(false);
 const list=useServerFn(listPlatformHeroImages);
 const get=useServerFn(getHeroImage);
 const save=useServerFn(setPlatformHeroImage);
 const remove=useServerFn(clearPlatformHeroImage);
 const {data:metadata,isLoading:listLoading}=useQuery({
  queryKey:["platform-hero-metadata"],enabled:isSaasAdmin,
  queryFn:()=>getHeroHeaders().then(headers=>list({headers})),
 });
 const {data:existing,isLoading:imageLoading}=useQuery({
  queryKey:["public-hero-image",page],enabled:isSaasAdmin,
  queryFn:()=>get({data:{page}}),staleTime:0,
 });
 useEffect(()=>{
  setCandidate("");setFileName("");setDimension("");
  if(inputRef.current)inputRef.current.value="";
  setAltText(existing?.altText??defaultAlt);
  setLayout("standard");
 },[page,existing?.altText]);
 if(loading)return null;
 if(!isSaasAdmin)return <Navigate to="/dashboard"/>;
 async function readFile(file:File){
  if(!["image/png","image/webp","image/svg+xml"].includes(file.type))
   return toast.error("Use PNG, WebP or SVG (vector).");
  if(!file.size||file.size>MAX_BYTES)
   return toast.error("Hero images must be 300 KB or smaller.");
  try{
   const dataUrl=await new Promise<string>((resolve,reject)=>{
    const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=reject;
    r.readAsDataURL(file);
   });
   const image=new Image();
   await new Promise<void>((resolve,reject)=>{
    image.onload=()=>resolve();
    image.onerror=()=>reject(new Error("Image could not be decoded"));
    image.src=dataUrl;
   });
   const w=image.naturalWidth,h=image.naturalHeight;
   if(w<1280||h<600||w>3840||h>2400||w/h<1.5||w/h>3.2)
    return toast.error("Use 1280–3840 × 600–2400 pixels, landscape ratio 1.5:1 to 3.2:1.");
   setCandidate(dataUrl);setFileName(file.name);setDimension(w+" × "+h+" px");
  }catch{toast.error("Image could not be read or is invalid.");}
 }
 async function onSave(){
  if(!candidate)return toast.error("Choose an image first.");
  if(altText.trim().length<15)return toast.error("Add a meaningful image description.");
  setBusy(true);
  try{
   const headers=await getHeroHeaders();
   const result=await save({headers,data:{page,dataUrl:candidate,altText:altText.trim(),layout}});
   setCandidate("");setFileName("");setDimension("");
   if(inputRef.current)inputRef.current.value="";
   await Promise.all([
    qc.invalidateQueries({queryKey:["public-hero-image",page]}),
    qc.invalidateQueries({queryKey:["platform-hero-metadata"]}),
   ]);
   toast.success("Hero image updated for "+pages.find(p=>p.key===result.page)?.label+".");
  }catch(e:any){toast.error(e?.message||"Could not save hero artwork.");}
  finally{setBusy(false);}
 }
 async function onRestore(){
  if(!window.confirm("Remove the uploaded hero and show this page's default design?"))return;
  setBusy(true);
  try{
   await remove({headers:await getHeroHeaders(),data:{page}});
   setCandidate("");setFileName("");setDimension("");
   await Promise.all([
    qc.invalidateQueries({queryKey:["public-hero-image",page]}),
    qc.invalidateQueries({queryKey:["platform-hero-metadata"]}),
   ]);
   toast.success("The original page hero is restored.");
  }catch(e:any){toast.error(e?.message||"Unable to restore page hero.");}
  finally{setBusy(false);}
 }
 const selected=pages.find(p=>p.key===page)!;
 const saved=(metadata??[]).find((m:any)=>m.page===page);
 return <div className="mx-auto max-w-5xl space-y-6">
  <header className="space-y-1"><div className="flex items-center gap-2">
   <ImageIcon className="h-7 w-7 text-primary"/><h1 className="text-2xl font-bold">Hero Images</h1>
  </div><p className="text-sm text-muted-foreground">
   Upload or replace lightweight backgrounds for the homepage carousel or other public pages. Titles, services and buttons stay as live webpage text.
  </p></header>
  <Card className="space-y-5 p-5 sm:p-7">
   <div className="space-y-2"><Label htmlFor="hero-page">Page</Label>
    <select id="hero-page" className="w-full rounded-lg border bg-background px-3 py-3"
     value={page} disabled={busy} onChange={e=>setPage(e.target.value as Page)}>
     {pages.map(p=><option key={p.key} value={p.key}>{p.label}</option>)}
    </select>
   </div>
   <div className="grid gap-4 md:grid-cols-2">
    <div className="space-y-2">
     <p className="font-semibold text-sm">Currently published</p>
     <div className="flex aspect-[2/1] items-center justify-center overflow-hidden rounded-xl border bg-[#F4F7F8]">
      {existing?.url?<img src={existing.url} alt={existing.altText} className="h-full w-full object-contain"/>:
       <div className="px-5 text-center text-sm text-muted-foreground">Default page hero is active</div>}
     </div>
     <p className="text-xs text-muted-foreground">{saved?
      `${saved.width} × ${saved.height} · ${saved.mime_type} · Saved ${new Date(saved.updated_at).toLocaleString()}`:
      "No custom image uploaded"}
     </p>
    </div>
    <div className="space-y-2">
     <p className="font-semibold text-sm">New artwork preview</p>
     <div className="flex aspect-[2/1] items-center justify-center overflow-hidden rounded-xl border bg-[#F4F7F8]">
      {candidate?<img src={candidate} alt="Preview of selected hero artwork" className="h-full w-full object-contain"/>:
       <div className="px-5 text-center text-sm text-muted-foreground">Select an image to preview it here</div>}
     </div>
     <p className="text-xs text-muted-foreground">{fileName?fileName+" · "+dimension:"No replacement selected"}</p>
    </div>
   </div>
   <div className="space-y-2"><Label htmlFor="hero-upload">Upload image</Label>
    <Input id="hero-upload" ref={inputRef} type="file" accept=".png,.webp,.svg,image/png,image/webp,image/svg+xml"
      disabled={busy} onChange={e=>{const f=e.target.files?.[0];if(f)void readFile(f);}}/>
    <p className="text-xs leading-6 text-muted-foreground">PNG, WebP or safe SVG vector. Maximum 300 KB. Minimum 1280 × 600 px; maximum 3840 × 2400 px. Landscape aspect ratio 1.5:1 to 3.2:1. Recommended 1672 × 941 (16:9), optimized WebP.</p>
    <p className="text-xs text-muted-foreground">SVG files are checked for scripts, unsafe elements and external references. Complex SVG files may need to be exported as PNG or WebP.</p>
   </div>
   {page.startsWith("home")&&<p className="rounded-lg border border-[#dce5eb] bg-[#f5f9fb] p-3 text-sm text-[#345467]">
      <strong>Background image only.</strong> Headings, descriptions, buttons and the seven lifecycle labels are real webpage elements. They remain visible when you replace this slide's image. The three homepage slides rotate automatically every seven seconds.
    </p>}
    <div className="space-y-2"><Label htmlFor="hero-alt">Image description (accessibility)</Label>
    <Input id="hero-alt" maxLength={220} value={altText} disabled={busy}
     onChange={e=>setAltText(e.target.value)}
     placeholder="Describe what the image shows for screen-reader visitors"/>
   </div>
   <div className="flex flex-wrap items-center gap-3">
    <Button disabled={busy||!candidate} onClick={()=>void onSave()}>
     <Upload className="mr-2 h-4 w-4"/>{busy?"Saving…":"Publish selected hero"}
    </Button>
    <Button variant="outline" disabled={busy||!saved} onClick={()=>void onRestore()}>
     <RotateCcw className="mr-2 h-4 w-4"/>Restore default
    </Button>
    <Button asChild variant="ghost"><Link to={selected.url}>
     View page <ExternalLink className="ml-2 h-4 w-4"/>
    </Link></Button>
   </div>
   <p className="text-xs text-muted-foreground">Only active SaaS administrators can upload or remove platform hero artwork. Customer business administrators cannot change public website images. Visitors may see cached artwork for up to five minutes.</p>
  </Card>
  <Card className="p-5"><h2 className="font-semibold">All public hero pages</h2>
   <div className="mt-3 grid gap-2 sm:grid-cols-2">
    {pages.map(p=><button key={p.key} onClick={()=>setPage(p.key)}
     className="flex items-center justify-between rounded-lg border px-4 py-3 text-left text-sm hover:border-primary"
     aria-current={p.key===page?"page":undefined}>
      <span>{p.label}</span><span className="text-xs text-muted-foreground">
       {metadata?.some((x:any)=>x.page===p.key)?"Custom artwork":"Default"}
      </span>
    </button>)}
   </div>
  </Card>
 </div>;
}

async function getHeroHeaders(){
 return getServerAuthHeaders();
}
