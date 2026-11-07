import {useEffect,useState} from "react";
import {Link} from "@tanstack/react-router";
import {ArrowRight,ChevronLeft,ChevronRight,Pause,Play,ShieldCheck,Workflow,ChartNoAxesCombined} from "lucide-react";
import {HeroTypingLine} from "@/components/hero-typing-line";
import {HomeLiveStats} from "@/components/home-public-effects";
import type {PublicHomepageStat} from "@/lib/platform-public-stats.functions";

const slides=[
 {title:"Every asset.",accent:"Fully accounted for.",eyebrow:"CONTROL THE COMPLETE LIFECYCLE",description:"From acquisition to final disposal, maintain one clear record of what you own, where it is, and who is responsible.",image:"/hero/assetflow-home-01-lifecycle.webp",label:"Asset lifecycle",icon:Workflow},
 {title:"Know where.",accent:"Know who. Know when.",eyebrow:"VISIBILITY ACROSS EVERY LOCATION",description:"Bring branches, custodians and movement history together so your teams work from the same reliable asset record.",image:"/hero/assetflow-home-02-visibility.webp",label:"Asset visibility",icon:ShieldCheck},
 {title:"From records.",accent:"To real decisions.",eyebrow:"REPORTING YOU CAN TRUST",description:"Turn verified asset information into useful reports, depreciation insights and accountable decisions, without scattered spreadsheets.",image:"/hero/assetflow-home-03-reporting.webp",label:"Reports and insight",icon:ChartNoAxesCombined},
] as const;
const phrases=["Register and tag fixed assets","Verify assets across your branches","Track locations and custodians","Control transfers and maintenance","Turn asset records into clear reports"] as const;

export function HomeHeroCarousel({initialStats}:{initialStats:PublicHomepageStat[]}){
 const [active,setActive]=useState(0);
 const [paused,setPaused]=useState(false);
 const [reduced,setReduced]=useState(true);
 const [visible,setVisible]=useState(true);
 useEffect(()=>{
   const media=window.matchMedia("(prefers-reduced-motion: reduce)");
   const change=()=>setReduced(media.matches);
   const visibility=()=>setVisible(!document.hidden);
   change();visibility();media.addEventListener("change",change);document.addEventListener("visibilitychange",visibility);
   return()=>{media.removeEventListener("change",change);document.removeEventListener("visibilitychange",visibility)};
 },[]);
 useEffect(()=>{
  if(paused||reduced||!visible)return;
  const timer=window.setInterval(()=>setActive(i=>(i+1)%slides.length),8500);
  return()=>window.clearInterval(timer);
 },[paused,reduced,visible]);
 const next=()=>setActive(i=>(i+1)%slides.length);
 const previous=()=>setActive(i=>(i+slides.length-1)%slides.length);
 return <section aria-label="AssetFlow360 asset management solutions" className="af-new-hero relative isolate w-full overflow-hidden bg-[#0c2c42] text-white" onMouseEnter={()=>setPaused(true)} onMouseLeave={()=>setPaused(false)} onFocusCapture={()=>setPaused(true)} onBlurCapture={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node))setPaused(false)}}>
  <div className="pointer-events-none absolute right-0 top-0 h-full w-[75%] overflow-hidden" aria-hidden="true">
   {slides.map((item,i)=><img key={item.image} src={item.image} alt="" width={1672} height={941} loading={i===0?"eager":"lazy"} fetchPriority={i===0?"high":"low"} decoding="async" className={`af-slide-image absolute inset-0 h-full w-full object-cover object-center ${active===i?"af-slide-visible":"af-slide-hidden"}`} />)}
   <div className="absolute inset-0 bg-[#0c2c42]/15"/>
  </div>
  <div className="pointer-events-none absolute inset-y-0 left-0 w-full bg-[#0c2c42] lg:w-[42%]" aria-hidden="true"/>
  <div className="pointer-events-none absolute inset-y-0 left-[34%] hidden w-[35%] bg-[#0c2c42] lg:block" style={{maskImage:"linear-gradient(to right, black, transparent)",WebkitMaskImage:"linear-gradient(to right, black, transparent)"}} aria-hidden="true"/>
  <div className="pointer-events-none absolute inset-0 bg-[#0c2c42]/35 lg:hidden" aria-hidden="true"/>
  <div className="relative z-10 mx-auto flex min-h-[610px] w-full max-w-7xl flex-col justify-between px-6 pb-9 pt-12 sm:min-h-[650px] sm:px-9 sm:pt-16 lg:min-h-[640px] lg:px-12 lg:pt-20">
   <div className="max-w-[600px] lg:max-w-[570px]">
    <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#f1a773]/40 bg-[#143d56] px-4 py-2 text-[11px] font-semibold uppercase tracking-[.17em] text-[#ffd9bb]"><span className="h-1.5 w-1.5 rounded-full bg-[#ff883f]"/>Asset intelligence for modern teams</div>
    <div className="relative min-h-[290px] sm:min-h-[285px]" aria-live="off">
     {slides.map((item,i)=><div key={item.label} aria-hidden={active!==i} className={`af-slide-copy absolute left-0 top-0 w-full ${active===i?"af-slide-copy-active":"af-slide-copy-hidden"}`}>
      <p className="mb-4 text-xs font-bold uppercase tracking-[.18em] text-[#ff9a5f]">{item.eyebrow}</p>
      <h1 className="text-[clamp(2.4rem,4.7vw,4.5rem)] font-bold leading-[1.08] tracking-[-.055em] text-white">{item.title}<span className="mt-1 block text-[#ff8a45]">{item.accent}</span></h1>
      <p className="mt-5 max-w-[490px] text-[15px] leading-7 text-[#e0edf4] sm:text-base">{item.description}</p>
     </div>)}
    </div>
    <div className="mt-6"><p className="text-[11px] font-bold uppercase tracking-[.19em] text-[#ffb68b]">What we do</p><HeroTypingLine phrases={phrases} initialFullPhrase className="mt-2 min-h-[34px] text-base font-semibold text-white sm:text-lg"/></div>
    <div className="mt-7 flex flex-wrap gap-3"><Link to="/register" className="af-hero-cta inline-flex min-h-12 items-center justify-center gap-3 rounded-xl bg-[#e97736] px-6 text-sm font-bold text-white shadow-[0_14px_25px_rgba(0,0,0,.18)] transition-transform duration-300 hover:-translate-y-1 hover:bg-[#ff8743] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">Start free trial <ArrowRight className="h-4 w-4"/></Link><Link to="/features" className="af-hero-cta inline-flex min-h-12 items-center justify-center rounded-xl border border-white/50 bg-[#204962] px-6 text-sm font-bold text-white transition-transform duration-300 hover:-translate-y-1 hover:bg-[#2b5873] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">Explore features</Link></div>
   </div>
   <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-[#c4d8e4]/25 pt-5">
    <div className="flex items-center gap-3"><span className="text-[11px] font-semibold uppercase tracking-[.16em] text-[#b6d0df]">Explore the platform</span><div className="flex gap-2">{slides.map((item,i)=><button key={item.label} aria-label={`Show ${item.label} slide`} aria-current={i===active?"true":undefined} type="button" onClick={()=>setActive(i)} className={`h-2.5 rounded-full transition-[width,background-color] duration-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white ${active===i?"w-9 bg-[#ff9151]":"w-2.5 bg-[#99b7c8] hover:bg-white"}`}/>)}</div></div>
    <div className="flex items-center gap-2"><button type="button" onClick={previous} aria-label="Previous hero slide" className="flex h-10 w-10 items-center justify-center rounded-full border border-white/40 bg-[#123c54] transition-colors hover:bg-[#285875]"><ChevronLeft className="h-4 w-4"/></button><button type="button" onClick={next} aria-label="Next hero slide" className="flex h-10 w-10 items-center justify-center rounded-full border border-white/40 bg-[#123c54] transition-colors hover:bg-[#285875]"><ChevronRight className="h-4 w-4"/></button><button type="button" onClick={()=>setPaused(v=>!v)} aria-label={paused?"Resume hero slideshow":"Pause hero slideshow"} aria-pressed={paused} className="flex h-10 w-10 items-center justify-center rounded-full border border-white/40 bg-[#123c54] transition-colors hover:bg-[#285875]">{paused?<Play className="h-4 w-4"/>:<Pause className="h-4 w-4"/>}</button></div>
   </div>
  </div>
  <style>{`
   .af-new-hero .af-slide-image{transition:opacity 1.2s ease,transform 8.5s ease;transform:scale(1.06)}
   .af-new-hero .af-slide-visible{opacity:1;transform:scale(1)}
   .af-new-hero .af-slide-hidden{opacity:0}
   .af-new-hero .af-slide-copy{transition:opacity .65s ease,transform .8s cubic-bezier(.2,.7,.2,1)}
   .af-new-hero .af-slide-copy-active{opacity:1;transform:translateY(0);pointer-events:auto}
   .af-new-hero .af-slide-copy-hidden{opacity:0;transform:translateY(20px);pointer-events:none}
   @media(prefers-reduced-motion:reduce){.af-new-hero *, .af-new-hero *::before, .af-new-hero *::after{animation:none!important;transition:none!important;transform:none!important}}
  `}</style>
 </section>
}
