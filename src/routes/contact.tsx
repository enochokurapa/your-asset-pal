import {publicHead} from "@/lib/public-seo";
import {createFileRoute,Link} from "@tanstack/react-router";
import {useState,type FormEvent} from "react";
import {useServerFn} from "@tanstack/react-start";
import {PublicShell} from "@/components/public-site-shell";
import {submitContactRequest} from "@/lib/platform-contact.functions";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {Textarea} from "@/components/ui/textarea";
import {Building2,Headphones,Mail,ShieldCheck,Sparkles,ArrowRight,Boxes} from "lucide-react";

const reasons=[
 ["sales","Sales & pricing"],["support","Technical support"],["small_business","Small business package"],
 ["enterprise","Enterprise solution"],["custom_workspace","Custom workspace"],["integrations","API & integrations"],
 ["billing","Billing & payments"],["other","Other enquiry"]
] as const;
type Reason=typeof reasons[number][0];
type Size="not_sure"|"1_100"|"101_1000"|"1001_10000"|"10001_plus";
const empty=()=>({name:"",email:"",subject:"",message:"",website:"",reason:"sales" as Reason,
 organisation:"",phone:"",size:"not_sure" as Size,assets:null as number|null,requirements:""});
export const Route=createFileRoute("/contact")({component:ContactPage,
 head:()=>publicHead("/contact","Contact AssetFlow360 | Support, Small Business & Enterprise Solutions",
 "Contact AssetFlow360 for technical support, sales, small-business asset management, enterprise deployment, custom asset systems, pricing, demos and API integrations. Tell us your organisation size and requirements.")});
function ContactPage(){
 const submit=useServerFn(submitContactRequest);
 const [form,setForm]=useState(empty);
 const [busy,setBusy]=useState(false);
 const [success,setSuccess]=useState(false);
 const [error,setError]=useState("");
 const quote=["sales","small_business","enterprise","custom_workspace"].includes(form.reason);
 const custom=form.reason==="custom_workspace";
 const onSubmit=async(e:FormEvent)=>{
   e.preventDefault();if(busy)return;
   setBusy(true);setError("");
   try{await submit({data:form});setSuccess(true);setForm(empty());}
   catch{setError("Could not send your enquiry. Please check the information and try again.");}
   finally{setBusy(false);}
 };
 const field="h-11 rounded-lg border-slate-300 bg-white text-base sm:text-sm";
 return <PublicShell><main className="af-content-fluid min-w-0 bg-[#f7f9fc] px-4 py-9 sm:px-8 sm:py-14">
  <div className="mx-auto grid max-w-[1250px] gap-9 lg:grid-cols-[.88fr_1.12fr] lg:gap-14">
    <section className="min-w-0 pt-2 lg:pt-8">
     <p className="text-xs font-semibold uppercase tracking-[.14em] text-[#c16f35]">Contact AssetFlow360</p>
     <h1 className="mt-3 max-w-lg text-3xl font-bold tracking-tight text-[#142652] sm:text-4xl">The right solution for your business.</h1>
     <p className="mt-4 max-w-lg text-sm leading-7 text-slate-600 sm:text-base">From a few assets to thousands across locations. Tell us what you need, and our team will help you find the right fit.</p>
     <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
      <div className="flex gap-3 rounded-xl border border-slate-200 bg-white p-4"><Boxes className="mt-0.5 h-5 w-5 shrink-0 text-indigo-700"/><div><h2 className="text-sm font-semibold text-slate-900">Small businesses</h2><p className="mt-1 text-xs leading-5 text-slate-600">Simple, focused asset management for smaller teams.</p></div></div>
      <div className="flex gap-3 rounded-xl border border-slate-200 bg-white p-4"><Building2 className="mt-0.5 h-5 w-5 shrink-0 text-indigo-700"/><div><h2 className="text-sm font-semibold text-slate-900">Enterprise & custom</h2><p className="mt-1 text-xs leading-5 text-slate-600">Multi-location operations, tailored modules and integrations.</p></div></div>
      <div className="flex gap-3 rounded-xl border border-slate-200 bg-white p-4"><Headphones className="mt-0.5 h-5 w-5 shrink-0 text-indigo-700"/><div><h2 className="text-sm font-semibold text-slate-900">Support & onboarding</h2><p className="mt-1 text-xs leading-5 text-slate-600">Assistance with your workspace, billing or using the platform.</p></div></div>
     </div>
     <p className="mt-6 flex items-center gap-2 text-xs text-slate-500"><ShieldCheck className="h-4 w-4"/>Your enquiry is handled by authorised team members.</p>
    </section>
    <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-[0_16px_42px_rgba(25,48,93,.055)] sm:rounded-2xl sm:p-8">
     {success?<div role="status" className="space-y-4 py-12">
      <ShieldCheck className="h-10 w-10 text-emerald-600"/><h2 className="text-2xl font-bold text-[#172554]">Enquiry received</h2>
      <p className="text-sm text-slate-600">Your message is in our team inbox. We can reply using the email you provided.</p>
      <Button onClick={()=>setSuccess(false)}>Send another enquiry</Button>
     </div>:<>
      <div className="mb-6"><h2 className="text-xl font-bold text-[#172554]">How can we help?</h2>
       <p className="mt-1 text-sm text-slate-500">Choose a topic and share the details.</p></div>
      <form onSubmit={onSubmit} className="space-y-4">
       <div className="space-y-1.5"><Label htmlFor="reason">Reason for contacting us</Label>
        <select id="reason" required className={"w-full border px-3 "+field} value={form.reason}
          onChange={e=>setForm(v=>({...v,reason:e.target.value as Reason}))}>
          {reasons.map(([key,name])=><option key={key} value={key}>{name}</option>)}
        </select></div>
       <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5"><Label htmlFor="contact-name">Full name</Label>
         <Input id="contact-name" className={field} autoComplete="name" required minLength={2} maxLength={120}
          value={form.name} onChange={e=>setForm(v=>({...v,name:e.target.value}))}/></div>
        <div className="space-y-1.5"><Label htmlFor="contact-email">Email address</Label>
         <Input id="contact-email" className={field} type="email" autoComplete="email" required maxLength={254}
          value={form.email} onChange={e=>setForm(v=>({...v,email:e.target.value}))}/></div>
       </div>
       {quote&&<>
        <div className="grid gap-4 sm:grid-cols-2">
         <div className="space-y-1.5"><Label htmlFor="org">Organisation name</Label>
          <Input id="org" className={field} required={custom} maxLength={160} value={form.organisation}
           onChange={e=>setForm(v=>({...v,organisation:e.target.value}))} placeholder="Business or institution"/></div>
         <div className="space-y-1.5"><Label htmlFor="phone">Contact phone</Label>
          <Input id="phone" className={field} type="tel" autoComplete="tel" required={custom} maxLength={40}
           value={form.phone} onChange={e=>setForm(v=>({...v,phone:e.target.value}))} placeholder="+256 …"/></div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
         <div className="space-y-1.5"><Label htmlFor="size">Estimated asset capacity</Label>
          <select id="size" className={"w-full border px-3 "+field} value={form.size}
           onChange={e=>setForm(v=>({...v,size:e.target.value as Size}))}>
           <option value="not_sure">Not sure yet</option><option value="1_100">1–100 assets</option>
           <option value="101_1000">101–1,000 assets</option><option value="1001_10000">1,001–10,000 assets</option>
           <option value="10001_plus">More than 10,000 assets</option>
          </select></div>
         <div className="space-y-1.5"><Label htmlFor="assets">Exact number of assets (optional)</Label>
          <Input id="assets" className={field} type="number" min={0} max={100000000}
           placeholder="e.g. 250" value={form.assets??""}
           onChange={e=>setForm(v=>({...v,assets:e.target.value===""?null:Number(e.target.value)}))}/></div>
        </div>
       </>}
       <div className="space-y-1.5"><Label htmlFor="contact-subject">Subject</Label>
        <Input id="contact-subject" className={field} required minLength={5} maxLength={180}
         value={form.subject} onChange={e=>setForm(v=>({...v,subject:e.target.value}))}
         placeholder={custom?"Request for a custom asset workspace":"Briefly describe your enquiry"}/></div>
       {quote&&<div className="space-y-1.5"><Label htmlFor="features">Modules or features you need (optional)</Label>
        <Textarea id="features" className="min-h-[78px] resize-y" rows={2} maxLength={1200} value={form.requirements}
         onChange={e=>setForm(v=>({...v,requirements:e.target.value}))}
         placeholder="e.g. asset register, verification, reporting, multi-branch access, API"/></div>}
       <div className="space-y-1.5"><Label htmlFor="contact-message">Your message</Label>
        <Textarea id="contact-message" rows={4} required minLength={10} maxLength={6000}
         value={form.message} onChange={e=>setForm(v=>({...v,message:e.target.value}))}
         placeholder={quote?"Tell us what you want to achieve, locations and any special requirements.":"How can we help?"}/></div>
       <div aria-hidden="true" className="absolute -left-[10000px] h-0 overflow-hidden">
        <label htmlFor="contact-website">Website</label><input id="contact-website" tabIndex={-1} autoComplete="off"
         value={form.website} onChange={e=>setForm(v=>({...v,website:e.target.value}))}/></div>
       {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
       <Button type="submit" className="h-12 w-full rounded-lg bg-[#3544b1] font-semibold text-white hover:bg-[#29388f]" disabled={busy}>
        {busy?"Sending…":"Send enquiry"} <ArrowRight className="ml-2 h-4 w-4"/>
       </Button>
       <p className="text-center text-xs text-slate-500">Do not include passwords or payment credentials.</p>
      </form>
     </>}
    </section>
  </div>
  <div className="mx-auto mt-8 max-w-[1250px] text-xs text-slate-500">Explore <Link to="/features" className="font-semibold text-indigo-700 underline">Features</Link> and <Link to="/pricing" className="font-semibold text-indigo-700 underline">Pricing</Link>.</div>
 </main></PublicShell>
}
