import {useEffect,useState} from "react";
import {Link} from "@tanstack/react-router";
import {ArrowRight,ShieldCheck,Wrench,ClipboardList,FileCheck2,CalendarDays,Layers3,FileBarChart2,CheckCircle2,ChartNoAxesColumnIncreasing} from "lucide-react";
import {HeroTypingLine} from "@/components/hero-typing-line";
import {HomeLiveStats} from "@/components/home-public-effects";
import type {PublicHomepageStat} from "@/lib/platform-public-stats.functions";

const PHRASES=["Register and tag fixed assets","Verify assets across your branches","Track locations and custodians","Control transfers and maintenance","Turn asset records into clear reports"] as const;
const left=[{icon:ShieldCheck,one:"Verification",two:"History"},{icon:Wrench,one:"Maintenance",two:"History"},{icon:ClipboardList,one:"Audit",two:"Trail"}];
const right=[{icon:FileCheck2,one:"Compliance",two:"& Documents"},{icon:CalendarDays,one:"Depreciation",two:"Insight"},{icon:Layers3,one:"Reporting",two:"& Planning"}];

function FlowNode({item,index,side}:{item:typeof left[number];index:number;side:"left"|"right"}){
 const Icon=item.icon;
 return <div className={`af-hero-node af-node-${side} relative flex min-h-[76px] items-center gap-3 rounded-xl border border-[#a7c9e0] bg-[#e5f2fb] p-3 text-[#102b45] shadow-[0_8px_20px_rgba(0,0,0,.16)]`} style={{animationDelay:`${.45+index*.14}s`}}>
  <span className="af-node-icon flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#c3d8e7] bg-white text-[#d76c33]"><Icon className="h-6 w-6" aria-hidden="true"/></span>
  <span className="text-[clamp(.73rem,1.1vw,.93rem)] font-bold leading-tight">{item.one}<span className="block">{item.two}</span></span>
  <span aria-hidden="true" className={`af-hero-port absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border-2 border-white bg-[#f47730] ${side==="left"?"-right-[7px]":"-left-[7px]"}`}/>
 </div>;
}

function LifecycleArt(){
 return <div aria-label="AssetFlow asset lifecycle: verification, maintenance, audit, compliance, depreciation and reporting" className="af-hero-art relative mx-auto w-full max-w-[670px] py-3">
   <div className="relative grid grid-cols-[minmax(0,1fr)_minmax(130px,1.12fr)_minmax(0,1fr)] items-center gap-3 sm:gap-4">
     <div className="relative z-10 flex flex-col gap-3 sm:gap-4">{left.map((item,i)=><FlowNode key={item.one} item={item} index={i} side="left"/>)}</div>
     <div className="af-main-report relative z-10 flex min-h-[270px] flex-col justify-center rounded-2xl border-[3px] border-[#ef7833] bg-[#fffaf3] px-3 py-5 text-[#1a354b] shadow-[0_14px_30px_rgba(0,0,0,.25)] sm:min-h-[320px] sm:px-5">
       <div className="mb-4 flex items-center gap-2 border-b border-[#d7e1e8] pb-3"><FileBarChart2 className="h-9 w-9 shrink-0 text-[#d56b37]" aria-hidden="true"/><p className="text-sm font-extrabold sm:text-base">Asset Report</p></div>
       <div className="mb-5 flex h-20 items-end justify-around gap-2 rounded-lg bg-[#eaf1f6] px-3 py-2" aria-hidden="true">{[38,67,51,93,76].map((h,i)=><span key={i} className="af-report-bar w-1/5 rounded-t bg-[#4387b1]" style={{height:`${h}%`,animationDelay:`${.7+i*.11}s`}}/>)}</div>
       <div className="space-y-3">{["Registered & tracked","Verification recorded","Reports ready"].map((label,i)=><div key={label} className="af-report-check flex items-center gap-2 text-[11px] font-semibold sm:text-xs" style={{animationDelay:`${.9+i*.16}s`}}><CheckCircle2 className="h-4 w-4 shrink-0 text-[#e86e2f]"/>{label}</div>)}</div>
     </div>
     <div className="relative z-10 flex flex-col gap-3 sm:gap-4">{right.map((item,i)=><FlowNode key={item.one} item={item} index={i} side="right"/>)}</div>
   </div>
   <div className="af-art-podium mx-auto mt-[-8px] h-8 w-[47%] rounded-b-2xl border border-[#5297c3] bg-[#286b99]" aria-hidden="true"/>
   <span aria-hidden="true" className="af-accent-dot absolute -bottom-1 right-2 h-5 w-5 rounded-full bg-[#ff8234]"/>
 </div>;
}

export function HomeHeroCarousel({initialStats}:{initialStats:PublicHomepageStat[]}){
 const [reduced,setReduced]=useState(false);
 useEffect(()=>{const m=window.matchMedia("(prefers-reduced-motion: reduce)");const update=()=>setReduced(m.matches);update();m.addEventListener("change",update);return()=>m.removeEventListener("change",update)},[]);
 return <section aria-label="AssetFlow 360 fixed asset management" className={`af-premium-hero relative isolate mx-auto w-full max-w-7xl overflow-hidden rounded-b-[24px] bg-[#0c2b45] text-white sm:rounded-b-[38px] ${reduced?"af-motion-off":""}`}>
   <div aria-hidden="true" className="pointer-events-none absolute bottom-0 right-0 h-20 w-32 rounded-tl-[100px] bg-[#ee7933] sm:h-24 sm:w-48"/>
   <div className="relative z-10 mx-auto w-full max-w-7xl px-5 pb-9 pt-9 sm:px-8 sm:pb-12 sm:pt-12 lg:px-10">
     <div className="grid items-center gap-8 lg:grid-cols-[.9fr_1.2fr] lg:gap-6">
       <div className="min-w-0">
        <p className="af-hero-enter af-delay-1 mb-5 inline-flex items-center gap-2 rounded-lg border border-[#ffdac4] bg-[#fff8ee] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[.12em] text-[#b95622]"><span className="h-2 w-2 rounded-full bg-[#ea7433]"/>Complete fixed asset management</p>
        <h1 className="af-hero-enter af-delay-2 text-[clamp(2.15rem,4vw,3.7rem)] font-bold leading-[1.12] tracking-[-.04em]">Every asset.<span className="mt-1 block text-[#ff873d]">Fully accounted for.</span></h1>
        <div className="af-hero-enter af-delay-3 mt-7 max-w-[540px]"><p className="text-xs font-bold uppercase tracking-[.17em] text-[#ff985c]">What we do</p><HeroTypingLine phrases={PHRASES} initialFullPhrase className="mt-2 min-h-10 max-w-lg text-base font-bold text-[#fff5ed] sm:text-lg"/></div>
        <p className="af-hero-enter af-delay-4 mt-2 max-w-[510px] text-sm leading-7 text-[#e2edf5] sm:text-base">Register, verify, locate and manage your organisation's fixed assets through one reliable, accountable platform.</p>
        <div className="af-hero-enter af-delay-5 mt-7 flex flex-wrap gap-3"><Link to="/register" className="af-hero-button inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#e97132] px-5 text-sm font-bold text-white transition-[transform,background-color] hover:-translate-y-1 hover:bg-[#ff813a] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">Start free trial <ArrowRight className="h-4 w-4"/></Link><Link to="/features" className="af-hero-button inline-flex min-h-11 items-center justify-center rounded-lg border border-[#f3f7fa] bg-white px-5 text-sm font-bold text-[#17394d] transition-transform hover:-translate-y-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">Explore features</Link></div>
       </div>
       <LifecycleArt/>
     </div>
     <div className="af-home-stats mt-6 sm:mt-8"><HomeLiveStats initialStats={initialStats}/></div>
   </div>
   <style>{`
    @keyframes afEnter {from{opacity:0;transform:translate3d(0,26px,0)}to{opacity:1;transform:translate3d(0,0,0)}}
    @keyframes afNodeEnter {from{opacity:0;transform:translate3d(0,25px,0) scale(.94)}to{opacity:1;transform:translate3d(0,0,0) scale(1)}}
    @keyframes afReportEnter {from{opacity:0;transform:translate3d(0,24px,0) scale(.9)}to{opacity:1;transform:translate3d(0,0,0) scale(1)}}
    @keyframes afBarGrow {from{transform:scaleY(.05)}to{transform:scaleY(1)}}
    @keyframes afGlowPulse {0%,100%{box-shadow:0 0 0 0 rgba(255,136,62,.34)}55%{box-shadow:0 0 0 8px rgba(255,136,62,0)}}
    @keyframes afGentleFloat {0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
    .af-premium-hero .af-hero-enter{animation:afEnter .82s cubic-bezier(.19,.75,.24,1) both}
    .af-premium-hero .af-delay-1{animation-delay:.08s}.af-premium-hero .af-delay-2{animation-delay:.22s}.af-premium-hero .af-delay-3{animation-delay:.36s}.af-premium-hero .af-delay-4{animation-delay:.5s}.af-premium-hero .af-delay-5{animation-delay:.64s}
    .af-premium-hero .af-hero-node{animation:afNodeEnter .85s cubic-bezier(.19,.75,.24,1) both;transition:transform .3s,box-shadow .3s}
    .af-premium-hero .af-hero-node:hover{transform:translateY(-6px);box-shadow:0 16px 25px rgba(0,0,0,.25)}
    .af-premium-hero .af-main-report{animation:afReport 1.1s cubic-bezier(.2,.75,.2,1) .35s both}
    .af-premium-hero .af-report-bar{transform-origin:center bottom;animation:afBarGrow 1.05s cubic-bezier(.2,.65,.3,1) both}
    .af-premium-hero .af-report-check{animation:afEnter .65s ease-out both}
    .af-premium-hero .af-hero-port{animation:afGlowPulse 2.4s ease-in-out 1.3s infinite}
    .af-premium-hero .af-art-podium{animation:afGentleFloat 6s ease-in-out infinite}
    .af-premium-hero .af-accent-dot{animation:afGlowPulse 2.7s ease-in-out infinite}
    @media (prefers-reduced-motion:reduce){.af-premium-hero *, .af-premium-hero *::before,.af-premium-hero *::after{animation:none!important;transition:none!important;transform:none!important}}
    .af-premium-hero.af-motion-off *{animation:none!important;transition:none!important}
    @media(max-width:480px){.af-premium-hero .af-hero-node{min-height:66px;gap:5px;padding:7px}.af-premium-hero .af-node-icon{height:30px;width:30px}.af-premium-hero .af-node-icon svg{height:18px;width:18px}.af-premium-hero .af-main-report{min-height:250px;padding:12px 8px}.af-premium-hero .af-hero-art{font-size:11px}}
   `}</style>
 </section>;
}
