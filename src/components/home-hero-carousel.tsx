import {useEffect,useState} from "react";
import {Link} from "@tanstack/react-router";
import {ArrowRight} from "lucide-react";
import {useQuery} from "@tanstack/react-query";
import {useServerFn} from "@tanstack/react-start";
import {getHeroImage} from "@/lib/platform-hero.functions";

import type {PublicHomepageStat} from "@/lib/platform-public-stats.functions";

const BACKGROUNDS=[
 {key:"home" as const,fallback:"/hero/assetflow-home-01-lifecycle.webp"},
 {key:"home_2" as const,fallback:"/hero/assetflow-home-02-visibility.webp"},
 {key:"home_3" as const,fallback:"/hero/assetflow-home-03-reporting.webp"},
];


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
 return <section aria-label="AssetFlow360 asset management solutions" className="af-new-hero relative isolate mx-auto w-full overflow-hidden bg-[#4E51DB] text-white rounded-br-[20px] sm:rounded-br-[32px]">
  <div className="pointer-events-none absolute inset-0" aria-hidden="true">
   {BACKGROUNDS.map((item,i)=><img key={item.key} src={uploaded[i]||item.fallback} alt="" width={1672} height={941} loading={i===0?"eager":"lazy"} fetchPriority={i===0?"high":"low"} decoding="async" className={`af-slide-image absolute inset-0 h-full w-full object-cover object-[60%_center] ${active===i?"af-slide-visible":"af-slide-hidden"}`}/>)}
  </div>
  {/* The blue is a single solid color. Only its transparency fades across
      the illustration: no extra hue gradient and no central dividing seam. */}
  <div aria-hidden="true" className="af-mobile-hero-overlay pointer-events-none absolute inset-0 bg-[#4E51DB]" style={{maskImage:"linear-gradient(to right, black 0%, black 28%, rgba(0,0,0,.95) 35%, rgba(0,0,0,.66) 51%, rgba(0,0,0,.2) 73%, transparent 94%)",WebkitMaskImage:"linear-gradient(to right, black 0%, black 28%, rgba(0,0,0,.95) 35%, rgba(0,0,0,.66) 51%, rgba(0,0,0,.2) 73%, transparent 94%)"}}/>
  <div className="relative z-10 mx-auto flex min-h-[365px] w-full flex-col justify-center px-5 py-7 sm:min-h-[445px] sm:px-8 lg:min-h-[480px] lg:px-12">
   <div className="max-w-[565px] lg:max-w-[53%]">
    <div className="mb-4 hidden items-center gap-2 rounded-full border border-[#f1a773]/40 bg-[#3f40a8]/85 px-4 py-2 text-[11px] font-semibold uppercase tracking-[.17em] sm:inline-flex text-[#fff2e8]"><span className="h-1.5 w-1.5 rounded-full bg-[#C87831]"/>Asset intelligence for modern teams</div>
    <p className="mb-3 text-[10px] font-bold uppercase tracking-[.12em] sm:mb-4 sm:text-xs sm:tracking-[.18em] text-[#f3b477]">Control the complete asset lifecycle</p>
    <h1 className="text-[clamp(1.85rem,5.5vw,3.7rem)] font-bold leading-[1.09] tracking-[-.05em] text-white">Every asset.<span className="mt-1 block text-[#f2b477]">Fully accounted for.</span></h1>
    <p className="mt-4 max-w-[450px] text-[13px] leading-6 text-[#f3f4ff] sm:mt-5 sm:text-[15px] sm:leading-7"><span className="sm:hidden">Register, track and verify assets in one platform.</span><span className="hidden sm:inline">Register, verify, locate and manage your organisation's fixed assets through one reliable, accountable platform.</span></p>
    <div className="mt-7 grid grid-cols-2 gap-2 sm:mt-8 sm:flex sm:flex-wrap sm:gap-3"><Link to="/register" className="af-hero-button-primary inline-flex min-h-11 items-center justify-center gap-1 rounded-lg px-2 text-[12px] sm:min-h-12 sm:gap-3 sm:px-6 sm:text-sm font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">Start free trial <ArrowRight className="h-3.5 w-3.5 sm:h-4 sm:w-4"/></Link><Link to="/features" className="af-hero-button-secondary inline-flex min-h-11 items-center justify-center rounded-lg px-2 text-[12px] sm:min-h-12 sm:px-6 sm:text-sm font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">Explore features</Link></div>
   </div>
  </div>
  <style>{`
   .af-new-hero .af-slide-image{transition:opacity 1.25s ease-in-out,transform 7s ease;transform:scale(1.035)}
   .af-new-hero .af-slide-visible{opacity:1;transform:scale(1)}
   .af-new-hero .af-slide-hidden{opacity:0}
   @media(max-width:639px){
     .af-new-hero .af-mobile-hero-overlay{background:#4E51DB!important;mask-image:none!important;-webkit-mask-image:none!important;opacity:.84}
     .af-new-hero .af-slide-image{object-position:65% 48%;opacity:.25}
     .af-new-hero .af-slide-visible{opacity:.32}
     .af-new-hero .af-slide-hidden{opacity:0}
   }
   @media(prefers-reduced-motion:reduce){.af-new-hero .af-slide-image{transition:none!important;transform:none!important}}
  `}</style>
 </section>
}
