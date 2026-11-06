import {createFileRoute,Link} from "@tanstack/react-router";
import {useState,type FormEvent} from "react";
import {useServerFn} from "@tanstack/react-start";
import {PublicShell} from "@/components/public-site-shell";
import {submitContactRequest} from "@/lib/platform-contact.functions";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {Textarea} from "@/components/ui/textarea";
import {Mail,MessageSquareText,ShieldCheck} from "lucide-react";

export const Route=createFileRoute("/contact")({component:ContactPage,
  head:()=>({meta:[{title:"Contact AssetFlow 360 | Support and Enquiries"},
    {name:"description",content:"Contact the AssetFlow 360 team about pricing, product information or support."}]})});
function ContactPage(){
 const submit=useServerFn(submitContactRequest);
 const [form,setForm]=useState({name:"",email:"",subject:"",message:"",website:""});
 const [busy,setBusy]=useState(false);
 const [success,setSuccess]=useState(false);
 const [error,setError]=useState("");
 const onSubmit=async(e:FormEvent)=>{
  e.preventDefault();if(busy)return;
  setBusy(true);setError("");
  try{await submit({data:form});setSuccess(true);setForm({name:"",email:"",subject:"",message:"",website:""});}
  catch(err:any){setError(err?.message||"Could not submit your message. Please try again.");}
  finally{setBusy(false);}
 };
 return <PublicShell><main className="mx-auto w-full max-w-7xl min-w-0 overflow-hidden bg-[#edf3f4] px-5 py-9 sm:px-8 sm:py-14">
  <div className="grid min-w-0 gap-8 lg:grid-cols-[.85fr_1.15fr] lg:gap-14">
   <div className="min-w-0">
    <p className="text-xs font-semibold uppercase tracking-[.18em] text-[#bb693a]">Get in touch</p>
    <h1 className="mt-4 text-3xl font-semibold tracking-tight text-[#173849] sm:text-4xl">Contact the AssetFlow team.</h1>
    <p className="mt-4 max-w-md text-sm leading-7 text-[#526c78]">Ask about subscriptions, asset workflows, getting started, or an existing organisation. Your message enters our support inbox, where a team member can respond directly to your email.</p>
    <div className="mt-8 space-y-4">
      <p className="flex items-center gap-3 text-sm text-[#355665]"><MessageSquareText className="h-5 w-5 text-[#bb693a]"/>Tracked enquiries and support responses</p>
      <p className="flex items-center gap-3 text-sm text-[#355665]"><Mail className="h-5 w-5 text-[#bb693a]"/>Replies delivered to your provided email</p>
      <p className="flex items-center gap-3 text-sm text-[#355665]"><ShieldCheck className="h-5 w-5 text-[#bb693a]"/>Your enquiry is visible only to authorised platform administrators</p>
    </div>
   </div>
   <section className="min-w-0 rounded-2xl border border-[#d6e2e6] bg-white p-5 shadow-[0_10px_35px_rgba(31,72,88,.08)] sm:p-8">
    {success?<div role="status" className="space-y-4 py-10">
     <ShieldCheck className="h-10 w-10 text-emerald-600"/><h2 className="text-xl font-semibold">Message received</h2>
     <p className="text-sm text-muted-foreground">Your enquiry has been added to our support inbox. We can reply directly to the email address you entered.</p>
     <Button onClick={()=>setSuccess(false)}>Send another message</Button>
    </div>:<>
     <h2 className="text-lg font-semibold text-[#173849]">Send an enquiry</h2>
     <p className="mt-1 text-xs text-muted-foreground">Complete the form below. Please do not include passwords or payment credentials.</p>
     <form onSubmit={onSubmit} className="mt-6 space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
       <div className="space-y-1.5"><Label htmlFor="contact-name">Your name</Label><Input id="contact-name" autoComplete="name" required minLength={2} maxLength={120} value={form.name} onChange={e=>setForm(v=>({...v,name:e.target.value}))}/></div>
       <div className="space-y-1.5"><Label htmlFor="contact-email">Email address</Label><Input id="contact-email" type="email" autoComplete="email" required maxLength={254} value={form.email} onChange={e=>setForm(v=>({...v,email:e.target.value}))}/></div>
      </div>
      <div className="space-y-1.5"><Label htmlFor="contact-subject">Subject</Label>
       <Input id="contact-subject" required minLength={5} maxLength={180} value={form.subject} onChange={e=>setForm(v=>({...v,subject:e.target.value}))} placeholder="How can we help?"/>
      </div>
      <div className="space-y-1.5"><Label htmlFor="contact-message">Message</Label>
       <Textarea id="contact-message" rows={6} required minLength={10} maxLength={6000} value={form.message} onChange={e=>setForm(v=>({...v,message:e.target.value}))} placeholder="Tell us what you need help with…"/>
      </div>
      <div aria-hidden="true" className="absolute -left-[10000px] h-0 overflow-hidden" tabIndex={-1}>
        <label htmlFor="contact-website">Website</label><input id="contact-website" tabIndex={-1} autoComplete="off" value={form.website} onChange={e=>setForm(v=>({...v,website:e.target.value}))}/>
      </div>
      {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={busy} className="w-full bg-[#bf7043] text-white hover:bg-[#a85e35]">{busy?"Submitting…":"Send message"}</Button>
     </form>
    </>}
   </section>
  </div>
  <p className="mt-9 text-xs text-[#647c84]">For more information about the platform, you can also explore <Link to="/features" className="font-semibold underline">Features</Link> and <Link to="/pricing" className="font-semibold underline">Pricing</Link>.</p>
 </main></PublicShell>;
}
