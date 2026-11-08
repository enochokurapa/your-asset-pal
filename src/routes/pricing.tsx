import {publicHead} from "@/lib/public-seo";
import {PublicShell} from "@/components/public-site-shell";
import {PublicPageHero} from "@/components/public-page-hero";
import {useState} from "react";
import {createFileRoute,Link} from "@tanstack/react-router";
import {useServerFn} from "@tanstack/react-start";
import {useQuery} from "@tanstack/react-query";
import {getPricingPlans} from "@/lib/saas.functions";
import {Button} from "@/components/ui/button";
import {Check,ArrowRight,Users,Package} from "lucide-react";
export const Route=createFileRoute("/pricing")({component:PricingPage,head:()=>publicHead("/pricing","Fixed Asset Management Software Pricing | AssetFlow360","Compare AssetFlow360 Starter, Business and Enterprise plans, user seats, asset limits and optional tracking and integration add-ons.")});
const money=(n:number,c:string)=>{try{return new Intl.NumberFormat("en-US",{style:"currency",currency:c,maximumFractionDigits:0}).format(n)}catch{return c+" "+n.toLocaleString()}};
type PublicPlan = {
  id: string; name: string; description: string;
  monthly_price: number; annual_price: number; included_users: number; included_assets: number;
  enabled_modules?: string[]; module_labels?: string[]; features?: string[];
};
function planHighlights(plan: PublicPlan, previous?: PublicPlan) {
  const modules = Array.isArray(plan.enabled_modules) ? plan.enabled_modules : [];
  const labels = Array.isArray(plan.module_labels) ? plan.module_labels : [];
  const earlier = Array.isArray(previous?.enabled_modules) ? previous.enabled_modules : [];
  // Never imply inheritance if an administrator removed a lower-plan module.
  const includesEarlier = Boolean(previous) && earlier.every(key => modules.includes(key));
  const shown = modules.length
    ? modules.map((key, index) => ({ key, label: labels[index] || key.replace(/_/g, " ") }))
    : (Array.isArray(plan.features) ? plan.features : [])
        .map(label => ({ key: label.toLowerCase().trim(), label }));
  const previousFeatures = new Set((previous?.features || []).map(s => s.toLowerCase().trim()));
  const extras = includesEarlier
    ? shown.filter(item => modules.length ? !earlier.includes(item.key) : !previousFeatures.has(item.key))
    : shown;
  return { includesEarlier, extras };
}
function PricingPage(){
 const get=useServerFn(getPricingPlans);
 const {data,error,isLoading}=useQuery({queryKey:["pricing-plans"],queryFn:()=>get(),staleTime:60_000});
 const [period,setPeriod]=useState<"monthly"|"annual">("monthly");
 const [currency,setCurrency]=useState<"USD"|"UGX">("USD");
 const display=(usd:number)=>currency==="USD"?money(usd,"USD"):data?.fxRate?money(Math.round(usd*data.fxRate),"UGX"):"Rate unavailable";
 const published:PublicPlan[] = Array.isArray(data?.plans) ? [...data.plans] : [];
 const ordered = published.sort((a,b) => {
   const rank=(id:string)=>({starter:0,business:1,enterprise:2} as Record<string,number>)[id] ?? 10;
   return rank(a.id)-rank(b.id);
 });
 return <PublicShell><main><PublicPageHero page="pricing" />
 <section className="bg-[#f4f6f6] px-4 py-10 sm:px-8 sm:py-14"><div className="mx-auto max-w-7xl">
   <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
     <div className="min-w-0"><h2 className="text-xl font-semibold tracking-tight text-[#263a44] sm:text-2xl">Choose your plan</h2><p className="mt-1 text-sm text-[#62737d]">Clear pricing, with capabilities that grow with your team.</p></div>
     <div className="flex w-fit max-w-full flex-wrap items-center gap-2">
       <select value={currency} onChange={e=>setCurrency(e.target.value as "USD"|"UGX")} aria-label="Currency"
         className="h-10 rounded-lg border border-[#dbe2e3] bg-white px-3 text-sm"><option value="USD">USD</option><option value="UGX" disabled={!data?.fxRate}>UGX</option></select>
       <div className="flex rounded-lg border border-[#dbe2e3] bg-white p-1">
         <button type="button" onClick={()=>setPeriod("monthly")} className={`rounded-md px-3 py-2 text-xs font-semibold sm:text-sm ${period==="monthly"?"bg-[#c77435] text-white":"text-[#485e68]"}`}>Monthly</button>
         <button type="button" onClick={()=>setPeriod("annual")} className={`rounded-md px-3 py-2 text-xs font-semibold sm:text-sm ${period==="annual"?"bg-[#c77435] text-white":"text-[#485e68]"}`}>Annual</button>
       </div>
     </div>
   </div>
   {error?<div className="rounded-xl border bg-white p-6 text-sm text-red-700">Pricing is temporarily unavailable.</div>
   :isLoading||!data?<div className="rounded-xl border bg-white p-6 text-sm">Loading current plans…</div>
   :<div className="grid items-stretch gap-5 lg:grid-cols-3">
    {ordered.map((plan,index)=>{
      const previous=index>0?ordered[index-1]:undefined;
      const {includesEarlier,extras}=planHighlights(plan,previous);
      const featured=plan.id==="business";
      return <article key={plan.id} className={`relative flex min-w-0 flex-col overflow-hidden rounded-2xl border bg-white p-5 shadow-[0_8px_30px_rgba(39,61,70,.04)] sm:p-6 ${featured?"border-[#ca895e] ring-1 ring-[#e8b38b] shadow-[0_12px_40px_rgba(181,101,52,.10)]":"border-[#dae3e5]"}`}>
        {featured&&<span className="absolute right-0 top-0 rounded-bl-xl bg-[#f7e7da] px-3 py-1.5 text-[11px] font-semibold text-[#a85c32]">Most popular</span>}
        <div className="min-w-0 pr-12"><h3 className="text-lg font-semibold text-[#263945]">{plan.name}</h3><p className="mt-2 min-h-12 text-sm leading-6 text-[#62737d]">{plan.description}</p></div>
        <p className="mt-5 break-words text-[clamp(1.6rem,2.5vw,2.15rem)] font-semibold tracking-tight text-[#263945]">{display(period==="monthly"?plan.monthly_price:plan.annual_price)}<span className="ml-1 text-xs font-normal text-[#6c7e87]">/{period==="monthly"?"month":"year"}</span></p>
        <div className="mt-5 grid grid-cols-2 gap-3 rounded-xl bg-[#f4f7f6] p-3.5 text-sm">
          <div className="min-w-0"><Users className="mb-1.5 h-4 w-4 text-[#b96d3d]"/><p className="font-semibold tabular-nums">{plan.included_users.toLocaleString()}</p><p className="text-xs text-[#647780]">Users</p></div>
          <div className="min-w-0"><Package className="mb-1.5 h-4 w-4 text-[#b96d3d]"/><p className="font-semibold tabular-nums">{plan.included_assets.toLocaleString()}</p><p className="text-xs text-[#647780]">Assets</p></div>
        </div>
        <div className="mt-6 flex-1"><p className="text-sm font-semibold text-[#324653]">Included capabilities</p>
          {includesEarlier&&previous&&<p className="mt-3 flex items-center gap-2 text-sm font-medium text-[#384e59]"><Check className="h-4 w-4 shrink-0 text-[#b96d3d]"/>Everything in {previous.name}</p>}
          <ul className="mt-3 space-y-2.5">{extras.map(item=><li key={item.key} className="flex items-start gap-2 text-[13px] leading-5 text-[#526671]"><Check className="mt-0.5 h-4 w-4 shrink-0 text-[#b96d3d]"/><span className="min-w-0 break-words">{item.label}</span></li>)}</ul>
          {!extras.length&&!includesEarlier&&<p className="mt-3 text-sm text-[#657580]">Contact us for details of this plan.</p>}
        </div>
        <Button asChild className={`mt-7 h-10 w-full text-sm font-semibold ${featured?"bg-[#c77435] text-white hover:bg-[#ae6131]":"bg-[#314b59] text-white hover:bg-[#243a45]"}`}><Link to="/register">Get started <ArrowRight className="ml-2 h-4 w-4"/></Link></Button>
      </article>;
    })}
   </div>}
   {data&&!isLoading&&!error&&<div className="mt-7 rounded-xl border border-[#dde5e5] bg-white/80 p-5">
     <h2 className="text-base font-semibold">Need additional capacity?</h2>
     <p className="mt-2 text-sm leading-6 text-[#60737d]">Each plan includes users and assets. Additional seats and optional modules are available as your organisation grows.</p>
     <p className="mt-2 text-xs leading-5 text-[#667982]">Additional user: {display(data.extraUserPrice)}. Extra asset block: {data.extraAssetBlockSize.toLocaleString()} assets for {display(data.extraAssetBlockPrice)}.</p>
   </div>}
 </div></section>
 </main></PublicShell>;
}
