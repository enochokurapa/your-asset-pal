import {createFileRoute,Link} from "@tanstack/react-router";
import {PublicShell} from "@/components/public-site-shell";
import {publicHead} from "@/lib/public-seo";
import {ArrowRight,CheckCircle2} from "lucide-react";

export const Route=createFileRoute("/fixed-asset-management-africa")({
 component:Page,
 head:()=>publicHead("/fixed-asset-management-africa","Fixed Asset Management in Uganda, Kenya & Nigeria | AssetFlow360",
  "A practical guide to fixed asset registers, verification, tagging, depreciation and branch reporting for organisations in Uganda, Kenya, Nigeria and across Africa."),
});
const steps=[
 {title:"Build a dependable fixed asset register",text:"Record asset names, purchase details, tags, custodians, locations and useful supporting records. Import data from existing spreadsheets where appropriate."},
 {title:"Verify assets in the field",text:"Use scheduled physical verification to reconcile records with what is on site, document exceptions, and keep verification dates visible to your team."},
 {title:"Track movement between branches",text:"Give each asset a consistent identity as it moves between departments, offices or locations. Record responsible custodians and movement history."},
 {title:"Report values and lifecycle status",text:"Review asset values, depreciation, maintenance, retirement and exceptions with your own organisation's accounting and reporting policies."},
];
const regions=[
 {name:"Uganda",text:"Keep a consistent register for Kampala-based offices, regional branches and institutions operating across multiple districts."},
 {name:"Kenya",text:"Bring asset and custody information together for teams working across Nairobi and other county locations."},
 {name:"Nigeria",text:"Organise large, distributed asset registers across offices, departments and multiple operating locations."},
 {name:"International teams",text:"Use the same structured approach to registration, physical checks and reporting wherever your teams operate."},
];
function Page(){return <PublicShell><main className="bg-white text-[#16384b]">
 <section className="bg-[#123b55] px-5 py-16 text-white sm:px-8 sm:py-20"><div className="mx-auto max-w-6xl"><p className="text-xs font-semibold uppercase tracking-[.19em] text-[#ffb386]">Asset management across locations</p>
 <h1 className="mt-4 max-w-4xl text-3xl font-bold tracking-tight sm:text-5xl">Fixed asset management in Uganda, Kenya, Nigeria and beyond</h1>
 <p className="mt-5 max-w-3xl text-base leading-8 text-[#d5e6ee]">A practical approach to managing equipment, furniture, vehicles and other fixed assets across offices, branches and teams. AssetFlow360 brings asset registration, location control, verification and reporting together.</p>
 <Link to="/features" className="mt-7 inline-flex items-center gap-2 rounded-lg bg-[#e8793d] px-5 py-3 text-sm font-bold text-white">See platform features <ArrowRight className="h-4 w-4"/></Link></div></section>
 <section className="px-5 py-14 sm:px-8"><div className="mx-auto max-w-6xl"><h2 className="text-2xl font-bold sm:text-3xl">Four essentials of an effective asset management system</h2><div className="mt-8 grid gap-4 sm:grid-cols-2">{steps.map((step,i)=><article key={step.title} className="rounded-xl border border-[#dce7ec] bg-[#f7fafb] p-6"><span className="text-xs font-bold text-[#bd6337]">0{i+1}</span><h3 className="mt-3 text-lg font-bold">{step.title}</h3><p className="mt-3 text-sm leading-7 text-[#557181]">{step.text}</p></article>)}</div></div></section>
 <section className="bg-[#eef4f7] px-5 py-14 sm:px-8"><div className="mx-auto max-w-6xl"><h2 className="text-2xl font-bold sm:text-3xl">For teams across regions</h2><p className="mt-3 max-w-3xl text-sm leading-7 text-[#557181]">These are common asset management use cases, not claims of local offices or country-specific legal certification.</p><div className="mt-7 grid gap-4 sm:grid-cols-2">{regions.map(r=><div key={r.name} className="rounded-xl bg-white p-5"><div className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-[#b75f32]"/><h3 className="font-bold">{r.name}</h3></div><p className="mt-3 text-sm leading-7 text-[#5d7180]">{r.text}</p></div>)}</div></div></section>
 <section className="px-5 py-12 sm:px-8"><div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-5"><div><h2 className="text-2xl font-bold">Bring your asset records together</h2><p className="mt-2 text-sm text-[#557181]">Explore tools for asset verification, depreciation and multi-location reporting.</p></div><Link to="/pricing" className="inline-flex items-center gap-2 rounded-lg bg-[#c76b38] px-5 py-3 text-sm font-bold text-white">Explore plans <ArrowRight className="h-4 w-4"/></Link></div></section>
 </main></PublicShell>}
