import {useState} from "react";
import {createFileRoute,Link} from "@tanstack/react-router";
import {useServerFn} from "@tanstack/react-start";
import {useQuery} from "@tanstack/react-query";
import {getPublicPricing} from "@/lib/saas.functions";
import {PlatformLogo} from "@/components/platform-logo";
import {Button} from "@/components/ui/button";
import {Card} from "@/components/ui/card";
import {Input} from "@/components/ui/input";
import {Check,ArrowRight,Users,Package,PlugZap,ShieldCheck} from "lucide-react";
export const Route=createFileRoute("/pricing")({component:PricingPage,head:()=>({meta:[{title:"Pricing | AssetFlow 360"},{name:"description",content:"AssetFlow 360 subscription pricing, included users and assets, additional user seats and optional paid integrations."}]})});
function money(n:number,c:string){try{return new Intl.NumberFormat("en-UG",{style:"currency",currency:c,maximumFractionDigits:0}).format(n)}catch{return c+" "+n.toLocaleString()}}
function PricingPage(){
 const pricing=useServerFn(getPublicPricing);
 const {data,error,isLoading}=useQuery({queryKey:["public-pricing"],queryFn:()=>pricing()});
 const [seats,setSeats]=useState(0);
 return <div className="platform-brand min-h-screen bg-background text-foreground">
 <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur"><div className="mx-auto flex h-17 max-w-7xl items-center justify-between gap-4 px-5 py-4"><Link to="/"><PlatformLogo variant="lockup" className="h-9 w-44"/></Link><div className="flex items-center gap-3"><Link to="/" className="text-sm font-medium hover:text-primary">Home</Link><Button asChild><Link to="/register">Start trial <ArrowRight className="ml-1 h-4 w-4"/></Link></Button></div></div></header>
 <section className="relative overflow-hidden border-b bg-[linear-gradient(135deg,color-mix(in_srgb,var(--primary)_13%,var(--background)),var(--background)_65%)]"><div className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-primary/15 blur-3xl"/><div className="relative mx-auto max-w-7xl px-5 py-16 sm:py-24"><p className="text-sm font-bold uppercase tracking-[.19em] text-primary">Simple hybrid pricing</p><h1 className="mt-4 max-w-3xl text-4xl font-extrabold tracking-tight sm:text-6xl">Pay for your workspace. <span className="text-primary">Grow your team as needed.</span></h1><p className="mt-5 max-w-2xl text-lg text-muted-foreground">A core subscription, included users and assets, with additional seats and optional integrations when your organisation needs them.</p></div></section>
 <main className="mx-auto max-w-7xl space-y-10 px-5 py-12">
 {error?<Card className="p-6 text-destructive">Pricing is temporarily unavailable. Please try again later.</Card>:isLoading||!data?<Card className="p-6">Loading current prices…</Card>:<>
 <div className="grid gap-5 md:grid-cols-3">
 <Card className="flex flex-col gap-4 border p-7"><p className="text-xl font-bold">Free trial</p><p className="text-3xl font-extrabold">{data.trialDays} days</p><p className="text-sm text-muted-foreground">Explore your workspace before choosing a paid subscription.</p><Button asChild variant="outline" className="mt-auto"><Link to="/register">Start free trial</Link></Button></Card>
 <Card className="flex flex-col gap-4 border-2 border-primary bg-primary/5 p-7 shadow-lg"><p className="text-xl font-bold">Business</p><div><p className="text-4xl font-extrabold">{money(data.price,data.currency)}</p><p className="text-sm text-muted-foreground">base subscription, per billing cycle</p></div><div className="space-y-3 text-sm"><p className="flex items-center gap-2"><Users className="h-5 w-5 text-primary"/>{data.users} included users</p><p className="flex items-center gap-2"><Package className="h-5 w-5 text-primary"/>{data.assets.toLocaleString()} included assets</p><p className="flex items-center gap-2"><Check className="h-5 w-5 text-primary"/>Core asset workflows and reporting</p></div><Button asChild className="mt-auto"><Link to="/register">Get started <ArrowRight className="ml-2 h-4 w-4"/></Link></Button></Card>
 <Card className="flex flex-col gap-4 border p-7"><p className="text-xl font-bold">Enterprise</p><p className="text-3xl font-extrabold">Tailored</p><p className="text-sm text-muted-foreground">For larger deployments and requirements that need an individual quotation.</p><div className="flex items-center gap-2 text-sm"><ShieldCheck className="h-5 w-5 text-primary"/>Custom implementation scope</div><Button asChild variant="outline" className="mt-auto"><Link to="/register">Contact through a workspace</Link></Button></Card>
 </div>
 <Card className="grid items-center gap-6 p-7 md:grid-cols-[1fr_auto]"><div><h2 className="text-2xl font-bold">Need more users?</h2><p className="mt-2 text-sm text-muted-foreground">You can add extra seats to your paid plan. Your administrator purchases them from Billing; new seats activate only after successful payment.</p><p className="mt-3 font-semibold">{money(data.extraUserPrice,data.currency)} per additional user per purchase cycle</p></div><div className="min-w-60 space-y-3"><label className="block text-sm font-medium">Additional seats<Input type="number" min={0} max={100} value={seats} onChange={e=>setSeats(Math.max(0,Math.min(100,Number(e.target.value)||0)))}/></label><p className="text-xl font-bold">{money(data.price+seats*data.extraUserPrice,data.currency)}</p><p className="text-xs text-muted-foreground">Estimated base plan + {seats} extra seats. Final amount is confirmed at checkout.</p></div></Card>
 {data.addOns.length>0&&<div className="space-y-4"><div><h2 className="text-2xl font-bold">Optional paid add-ons</h2><p className="text-muted-foreground">Activate advanced capabilities separately. Availability and prices are controlled by SaaS Admin.</p></div><div className="grid gap-4 sm:grid-cols-2">{data.addOns.map(a=><Card key={a.label} className="flex items-center gap-4 p-5"><PlugZap className="h-6 w-6 text-primary"/><div className="flex-1"><p className="font-semibold">{a.label}</p><p className="text-sm text-muted-foreground">{money(a.price,data.currency)}</p></div></Card>)}</div></div>}
 </>}
 </main><footer className="border-t bg-muted/30 px-5 py-8 text-center text-sm text-muted-foreground">AssetFlow 360 · <Link to="/" className="underline">Home</Link> · Prices and allowances are set by SaaS Admin.</footer>
 </div>
}
