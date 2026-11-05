import {createFileRoute,Link} from "@tanstack/react-router";
import {PublicShell} from "@/components/public-site-shell";
import {ArrowRight,ScanLine,MapPinned,ClipboardCheck,FileSpreadsheet,Route as RouteIcon,Package} from "lucide-react";
import {Button} from "@/components/ui/button";
export const Route=createFileRoute("/")({component:Home,head:()=>({meta:[{title:"AssetFlow 360 | Fixed Asset Management"},{name:"description",content:"Register, verify, locate and manage fixed assets with AssetFlow 360."}]})});
const features=[{icon:FileSpreadsheet,title:"Registers you control",desc:"Build fields and layouts that fit your organisation, not the other way around."},{icon:MapPinned,title:"Know where assets are",desc:"Link assets to locations, branches and custodians."},{icon:ScanLine,title:"Verify with confidence",desc:"Scan tags, manage checks and review exceptions."},{icon:RouteIcon,title:"Manage every movement",desc:"Track transfers and gate passes through controlled workflows."}];
function Home(){return <PublicShell><main>
{/* Approved original artwork. Do not regenerate, replace, or recolor this image.
    Source file: public/assetflow360-approved-home-hero.png (1774 × 887).
    The illustration contains a sample navigation row; the top 5.45% is visually
    clipped so the real, keyboard-accessible PublicHeader remains the only menu. */}
<section aria-label="AssetFlow 360 asset lifecycle" className="relative overflow-hidden bg-[#f7f9fa]">
  <div className="relative overflow-hidden">
    <img
      src="/assetflow360-approved-home-hero.png"
      alt="AssetFlow 360. Manage your assets through the full lifecycle: Plan, Acquire, Deploy, Maintain, Track, Optimise and Dispose. A seven-step blue staircase rises beside a laptop and mobile asset-management dashboard."
      width={1774}
      height={887}
      fetchPriority="high"
      decoding="async"
      className="-mt-[5.45%] block h-auto w-full"
    />
    {/* The original art includes two rasterized buttons. These transparent,
        focusable click targets preserve their visual appearance while enabling
        real website navigation. Coordinates scale with the approved asset. */}
    <Link to="/register" aria-label="Start your free trial" className="absolute left-[3.6%] top-[52.6%] hidden h-[9.3%] w-[14.1%] rounded-md focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[#C77435] md:block" />
    <Link to="/about" aria-label="Learn about AssetFlow 360 and requesting a demo" className="absolute left-[19.3%] top-[52.6%] hidden h-[9.3%] w-[13.4%] rounded-md focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[#C77435] md:block" />
  </div>
  <div className="flex flex-col gap-3 px-5 pb-7 pt-3 sm:flex-row sm:justify-center md:hidden">
    <Button asChild size="lg" className="bg-[#C77435] font-semibold text-white hover:bg-[#AE602D]">
      <Link to="/register">Start free trial <ArrowRight className="ml-2 h-4 w-4" /></Link>
    </Button>
    <Button asChild size="lg" variant="outline" className="border-[#102B3C] text-[#102B3C]">
      <Link to="/about">Learn about a demo</Link>
    </Button>
  </div>
</section>
<section className="bg-[#f3f6f8] py-16 sm:py-22"><div className="mx-auto max-w-7xl px-5 sm:px-8"><div className="max-w-2xl"><p className="text-xs font-bold uppercase tracking-[.19em] text-[#bd6538]">Why AssetFlow 360</p><h2 className="mt-3 text-3xl font-extrabold sm:text-5xl">Every asset has a story. <span className="text-[#b8673e]">Keep track of it.</span></h2><p className="mt-5 text-base leading-7 text-[#536b79]">From registration to retirement, keep the important information connected and accessible to the teams who need it.</p></div><div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-4">{features.map(({icon:Icon,title,desc})=><div key={title} className="rounded-2xl border border-[#dce5eb] bg-white p-6 shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-xl"><div className="inline-flex rounded-xl bg-[#fff0e7] p-3 text-[#c46d41]"><Icon className="h-7 w-7"/></div><h3 className="mt-5 text-lg font-bold">{title}</h3><p className="mt-3 text-sm leading-7 text-[#5c7280]">{desc}</p></div>)}</div><Link to="/features" className="mt-8 inline-flex items-center gap-2 font-bold text-[#b85f31]">Explore all features <ArrowRight className="h-4 w-4"/></Link></div></section>
<section className="bg-[#e9eef1] py-20"><div className="mx-auto grid max-w-7xl items-center gap-10 px-5 sm:px-8 lg:grid-cols-2"><div className="flex flex-wrap items-center justify-center gap-4 rounded-[28px] border border-[#d4e0e5] bg-white p-10"><div className="rounded-2xl bg-[#f2f5f6] p-6"><Package className="h-20 w-20 text-[#c76e3d]"/></div><div className="space-y-4"><div className="flex items-center gap-3 rounded-xl border p-4"><ScanLine className="h-7 w-7 text-[#c76e3d]"/><span className="font-semibold">Identify & register</span></div><div className="flex items-center gap-3 rounded-xl border p-4"><MapPinned className="h-7 w-7 text-[#c76e3d]"/><span className="font-semibold">Assign a location</span></div><div className="flex items-center gap-3 rounded-xl border p-4"><ClipboardCheck className="h-7 w-7 text-[#c76e3d]"/><span className="font-semibold">Verify and report</span></div></div></div><div><p className="text-xs font-bold uppercase tracking-[.18em] text-[#b15b31]">Built for real work</p><h2 className="mt-4 text-3xl font-extrabold sm:text-5xl">Less chasing records. More control over assets.</h2><p className="mt-6 text-lg leading-8 text-[#526977]">Designed for organisations managing equipment, furniture, vehicles and other fixed assets across offices, branches and locations.</p><Button asChild className="mt-7 bg-[#bd673a] text-white hover:bg-[#a8522c]"><Link to="/solutions">See how teams use AssetFlow <ArrowRight className="ml-2 h-4 w-4"/></Link></Button></div></div></section>
<section className="bg-[#102b3c] py-20 text-white"><div className="mx-auto grid max-w-7xl gap-10 px-5 sm:px-8 lg:grid-cols-[1.15fr_.85fr] lg:items-center"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-[#eda879]">One connected asset lifecycle</p><h2 className="mt-4 text-3xl font-extrabold sm:text-5xl">From first registration to the final report.</h2><p className="mt-6 max-w-lg text-lg leading-8 text-slate-300">Keep a consistent process across locations, approvals and operational reporting without losing accountability.</p></div><div className="grid gap-3">{["Register and classify","Assign locations and custodians","Verify, transfer and maintain","Review depreciation and reports"].map((x,i)=><div key={x} className="flex items-center gap-4 rounded-xl border border-white/20 bg-white/10 px-5 py-4"><span className="font-black text-[#f0a16b]">0{i+1}</span><span className="font-semibold">{x}</span></div>)}</div></div></section>
<section className="bg-[#f5e8dd] py-20"><div className="mx-auto flex max-w-7xl flex-col gap-8 px-5 sm:px-8 lg:flex-row lg:items-center lg:justify-between"><div><p className="text-xs font-bold uppercase tracking-[.17em] text-[#af592e]">Flexible pricing</p><h2 className="mt-3 text-3xl font-extrabold sm:text-4xl">Start with your team. Grow when you need to.</h2><p className="mt-4 max-w-2xl text-[#566c78]">Subscription plans with included users, extra team seats and optional paid integrations.</p></div><Button asChild className="h-12 shrink-0 bg-[#c76c3b] px-7 text-white hover:bg-[#aa572e]"><Link to="/pricing">View pricing <ArrowRight className="ml-2 h-4 w-4"/></Link></Button></div></section>
<section className="bg-[#c66a3b] px-5 py-18 text-center text-white sm:py-24"><h2 className="mx-auto max-w-3xl text-4xl font-extrabold sm:text-5xl">Take control of your asset records.</h2><p className="mx-auto mt-5 max-w-xl text-lg text-orange-50">Start with the assets you have. Build a system that grows with your organisation.</p><Button asChild className="mt-8 h-12 bg-white px-8 font-bold text-[#ab5529] hover:bg-[#f7e9df]"><Link to="/register">Start free trial <ArrowRight className="ml-2 h-5 w-5"/></Link></Button></section>
</main></PublicShell>}
