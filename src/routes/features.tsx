import {createFileRoute,Link} from "@tanstack/react-router";
import {useQuery} from "@tanstack/react-query";
import {useServerFn} from "@tanstack/react-start";
import {PublicShell} from "@/components/public-site-shell";
import {PublicPageHero} from "@/components/public-page-hero";
import {getPublicFeatureCatalog} from "@/lib/public-feature-catalog.functions";
import {Button} from "@/components/ui/button";
import {ArrowRight,CheckCircle2,ShieldCheck} from "lucide-react";
export const Route=createFileRoute("/features")({
 component:Page,
 head:()=>({meta:[{title:"Features | AssetFlow 360"},
 {name:"description",content:"Explore currently available AssetFlow modules, workflow capabilities and optional integrations."}]})
});
function Page(){
 const getter=useServerFn(getPublicFeatureCatalog);
 const {data=[],isLoading,error}=useQuery({queryKey:["public-feature-catalog"],queryFn:()=>getter(),staleTime:60_000});
 return <PublicShell><main className="min-w-0 overflow-x-clip">
  <PublicPageHero page="features"/>
  <section className="mx-auto w-full max-w-7xl overflow-hidden bg-[#f2f6f7] px-5 py-12 sm:px-8 sm:py-16">
   <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
    <div className="max-w-2xl">
     <p className="text-xs font-semibold uppercase tracking-[.16em] text-[#bd673a]">AssetFlow capabilities</p>
     <h2 className="mt-3 text-2xl font-semibold tracking-tight text-[#193b4b] sm:text-3xl">Built for the complete asset lifecycle.</h2>
     <p className="mt-3 text-sm leading-7 text-[#5b7280]">This catalogue reflects modules currently enabled on the platform. Access to a particular module depends on your organisation's subscription, permissions and optional integrations.</p>
    </div>
    <ShieldCheck className="mt-2 h-6 w-6 text-[#bd673a]" aria-hidden="true"/>
   </div>
   {isLoading&&<p className="mt-8 text-sm text-[#58717c]">Loading current features…</p>}
   {error&&<p className="mt-8 text-sm text-[#58717c]">Feature list could not be loaded. Please retry.</p>}
   <div className="mt-8 grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3">
    {data.map(item=><article key={item.key} className="min-w-0 rounded-xl border border-[#dce5e9] bg-white p-5 shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-md">
     <div className="flex flex-wrap items-center justify-between gap-2">
      <CheckCircle2 className="h-5 w-5 text-[#bd673a]"/>
      {item.access==="add_on"&&<span className="rounded-full bg-[#fbefe7] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-[#a85e36]">Optional add-on</span>}
     </div>
     <h3 className="mt-4 text-base font-semibold text-[#234658]">{item.label}</h3>
     <p className="mt-2 break-words text-sm leading-6 text-[#617481]">{item.description}</p>
    </article>)}
   </div>
  </section>
  <section className="mx-auto flex w-full max-w-7xl flex-col gap-4 overflow-hidden bg-[#e9eef2] px-5 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-8">
   <div><h2 className="text-xl font-semibold text-[#203e4d] sm:text-2xl">Choose the features your team needs.</h2>
    <p className="mt-2 text-sm text-[#607582]">Compare plans, request a demonstration or get in touch about integrations.</p></div>
   <div className="flex flex-wrap gap-2">
    <Button asChild className="bg-[#c86d3d] text-white hover:bg-[#ad582b]"><Link to="/pricing">View plans <ArrowRight className="ml-2 h-4 w-4"/></Link></Button>
    <Button asChild variant="outline"><Link to="/contact">Contact us</Link></Button>
   </div>
  </section>
 </main></PublicShell>;
}
