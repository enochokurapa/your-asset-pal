import {useEffect,useState} from "react";
import {Link} from "@tanstack/react-router";
import {ArrowRight} from "lucide-react";
import {useQuery} from "@tanstack/react-query";
import {useServerFn} from "@tanstack/react-start";
import {getHeroImage} from "@/lib/platform-hero.functions";
import {HeroTypingLine} from "@/components/hero-typing-line";
import {HomeLiveStats} from "@/components/home-public-effects";
import type {PublicHomepageStat} from "@/lib/platform-public-stats.functions";

const BACKGROUNDS=[
 {key:"home" as const,fallback:"/hero/assetflow-home-01-lifecycle.webp"},
 {key:"home_2" as const,fallback:"/hero/assetflow-home-02-visibility.webp"},
 {key:"home_3" as const,fallback:"/hero/assetflow-home-03-reporting.webp"},
];
const phrases=["Register and tag fixed assets","Verify assets across your branches","Track locations and custodians","Control transfers and maintenance","Turn asset records into clear reports"] as const;

export function HomeHeroCarousel({initialStats}:{initialStats:PublicHomepageStat[]}){
 const [active,setActive]=useState(0);
 const [reduced,setReduced]=useState(false);
 const [visible,setVisible]=useState(true);
 const get=useServerFn(getHeroImage);
 const first=useQuery({queryKey:["public-hero-image","home"],queryFn:()=>get({data:{page:"home"}}),staleTime:300000,retry:1});
 const second=useQuery({queryKey:["public-hero-image","home_2"],queryFn:()=>get({data:{page:"home_2"}}),staleTime:300000,retry:1});
 const third=useQuery({queryKey:["public-hero-image","home_3"],queryFn:()=>get({data:{page:"home_3"}}),staleTime:300000,retry:1});
 const uploaded=[first.data?.url,second.data?.url,third.data?.url];
 useEffect(()=>{
  const media=window.matchMedia("(prefers-reduced-motion: reduce)");
  const change=()=>setReduced(media.matches);
  const visibility=()=>setVisible(!document.hidden);
  change();visibility();media.addEventListener("change",change);document.addEventListener("visibilitychange",visibility);
  return()=>{media.removeEventListener("change",change);document.removeEventListener("visibilitychange",visibility)};
 },[]);
 useEffect(()=>{
  if(!visible||reduced)return;
  const timer=window.setInterval(()=>setActive(i=>(i+1)%BACKGROUNDS.length),7000);
  return()=>window.clearInterval(timer);
 },[reduced,visible]);
 return <section aria-label="AssetFlow360 asset management solutions" className="af-new-hero relative isolate mx-auto w-full max-w-7xl overflow-hidden bg-[#0c2c42] text-white sm:rounded-b-[32px]">
  <div className="pointer-events-none absolute inset-0" aria-hidden="true">
   {BACKGROUNDS.map((item,i)=><img key={item.key} src={uploaded[i]||item.fallback} alt="" width={1672} height={941} loading={i===0?"eager":"lazy"} fetchPriority={i===0?"high":"low"} decoding="async" className={`af-slide-image absolute inset-0 h-full w-full object-cover object-[60%_center] ${active===i?"af-slide-visible":"af-slide-hidden"}`}/>)}
  </div>
  {/* Single continuous opaque-to-transparent overlay; no separate left panel or hard vertical seam. */}
  <div aria-hidden="true" className="pointer-events-none absolute inset-0" style={{background:"linear-gradient(90deg, rgba(12,44,66,0.99) 0%, rgba(12,44,66,0.97) 28%, rgba(12,44,66,0.86) 42%, rgba(12,44,66,0.52) 57%, rgba(12,44,66,0.16) 72%, rgba(12,44,66,0.02) 90%)"}}/>
  <div className="relative z-10 mx-auto flex min-h-[550px] w-full max-w-7xl flex-col justify-center px-6 py-12 sm:min-h-[585px] sm:px-9 lg:min-h-[610px] lg:px-12">
   <div className="max-w-[575px]">
    <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#f1a773]/40 bg-[#143d56]/90 px-4 py-2 text-[11px] font-semibold uppercase tracking-[.17em] text-[#ffd9bb]"><span className="h-1.5 w-1.5 rounded-full bg-[#ff883f]"/>Asset intelligence for modern teams</div>
    <p className="mb-4 text-xs font-bold uppercase tracking-[.18em] text-[#ff9a5f]">Control the complete asset lifecycle</p>
    <h1 className="text-[clamp(2.25rem,4.3vw,4rem)] font-bold leading-[1.09] tracking-[-.05em] text-white">Every asset.<span className="mt-1 block text-[#ff8a45]">Fully accounted for.</span></h1>
    <p className="mt-6 max-w-[490px] text-[15px] leading-7 text-[#e0edf4] sm:text-base">Register, verify, locate and manage your organisation's fixed assets through one reliable, accountable platform.</p>
    <div className="mt-6"><p className="text-[11px] font-bold uppercase tracking-[.19em] text-[#ffb68b]">What we do</p><HeroTypingLine phrases={phrases} initialFullPhrase className="mt-2 min-h-[34px] text-base font-semibold text-white sm:text-lg"/></div>
    <div className="mt-8 flex flex-wrap gap-3"><Link to="/register" className="inline-flex min-h-12 items-center justify-center gap-3 rounded-xl bg-[#e97736] px-6 text-sm font-bold text-white shadow-[0_14px_25px_rgba(0,0,0,.18)] transition-transform duration-300 hover:-translate-y-1 hover:bg-[#ff8743] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">Start free trial <ArrowRight className="h-4 w-4"/></Link><Link to="/features" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-white/50 bg-[#204962] px-6 text-sm font-bold text-white transition-transform duration-300 hover:-translate-y-1 hover:bg-[#2b5873] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">Explore features</Link></div>
   </div>
  </div>
  <style>{`
   .af-new-hero .af-slide-image{transition:opacity 1.25s ease-in-out,transform 7s ease;transform:scale(1.035)}
   .af-new-hero .af-slide-visible{opacity:1;transform:scale(1)}
   .af-new-hero .af-slide-hidden{opacity:0}
   @media(prefers-reduced-motion:reduce){.af-new-hero .af-slide-image{transition:none!important;transform:none!important}}
  `}</style>
 </section>
}
