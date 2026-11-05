import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight } from "lucide-react";
import { getHeroImage } from "@/lib/platform-hero.functions";
import { HeroTypingLine } from "@/components/hero-typing-line";

const BACKGROUNDS = [
  { key:"home" as const, src:"/hero/assetflow-home-01-lifecycle.webp" },
  { key:"home_2" as const, src:"/hero/assetflow-home-02-visibility.webp" },
  { key:"home_3" as const, src:"/hero/assetflow-home-03-reporting.webp" },
];
const PHRASES = [
  "Register and tag fixed assets",
  "Verify assets across your branches",
  "Track locations and custodians",
  "Control transfers and maintenance",
  "Turn asset records into clear reports",
] as const;
const STAGES = ["Register","Tag","Assign","Verify","Locate","Maintain","Report"] as const;

/**
 * Backgrounds crossfade every 7s. Content, controls and seven stage labels
 * never change. SaaS administrators may replace backgrounds independently.
 */
export function HomeHeroCarousel() {
  const [active,setActive] = useState(0);
  const [reducedMotion,setReducedMotion] = useState(true);
  const [visible,setVisible] = useState(true);
  const get=useServerFn(getHeroImage);
  const first=useQuery({
    queryKey:["public-hero-image","home"],
    queryFn:()=>get({data:{page:"home"}}),
    staleTime:300000,retry:1,
  });
  const second=useQuery({
    queryKey:["public-hero-image","home_2"],
    queryFn:()=>get({data:{page:"home_2"}}),
    staleTime:300000,retry:1,
  });
  const third=useQuery({
    queryKey:["public-hero-image","home_3"],
    queryFn:()=>get({data:{page:"home_3"}}),
    staleTime:300000,retry:1,
  });
  const images=[first.data?.url,second.data?.url,third.data?.url];

  useEffect(()=>{
    const q=window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange=()=>setReducedMotion(q.matches);
    const onVisibility=()=>setVisible(!document.hidden);
    onChange();onVisibility();
    q.addEventListener("change",onChange);
    document.addEventListener("visibilitychange",onVisibility);
    return ()=>{
      q.removeEventListener("change",onChange);
      document.removeEventListener("visibilitychange",onVisibility);
    };
  },[]);
  useEffect(()=>{
    if(reducedMotion||!visible)return;
    const timer=window.setInterval(()=>setActive(i=>(i+1)%BACKGROUNDS.length),7000);
    return ()=>window.clearInterval(timer);
  },[reducedMotion,visible]);

  return <section aria-label="AssetFlow 360 fixed asset management" className="relative isolate overflow-hidden bg-[#f0f5fb] text-[#102b3c]">
    <div className="relative min-h-[625px] sm:min-h-[680px] lg:min-h-[710px]">
      {BACKGROUNDS.map((bg,i)=><div key={bg.key} aria-hidden="true"
        className={`pointer-events-none absolute inset-0 transition-opacity duration-1000 ease-in-out ${i===active?"opacity-100":"opacity-0"}`}>
        <img
          src={images[i]||bg.src}
          alt=""
          width={1672} height={941}
          loading={i===0?"eager":"lazy"}
          fetchPriority={i===0?"high":"low"}
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover object-[60%_center] lg:object-center"
        />
      </div>)}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#f4f8ff]/[.98] via-[#f4f8ff]/[.91] to-[#f4f8ff]/[.12] lg:via-[#f4f8ff]/[.78]"/>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#f4f8ff]/60 via-transparent to-transparent"/>
      <div className="relative z-10 mx-auto flex min-h-[625px] max-w-7xl flex-col justify-center px-6 py-14 sm:min-h-[680px] sm:px-8 lg:min-h-[710px] lg:px-10">
        <div className="max-w-[655px]">
          <p className="mb-5 inline-flex items-center gap-2 rounded-md border border-[#d3e0ea] bg-white/90 px-3.5 py-2 text-xs font-bold uppercase tracking-[.13em] text-[#a65a32]">
            <span aria-hidden="true" className="h-2 w-2 rounded-sm bg-[#c77435]"/> Complete fixed asset management
          </p>
          <h1 className="text-[clamp(2.6rem,4.6vw,4.55rem)] font-extrabold leading-[1.08] tracking-[-.042em] text-[#102b3c]">
            Every asset.<br/><span className="text-[#bf6a39]">Fully accounted for.</span>
          </h1>
          <div className="mt-7 max-w-[600px]">
            <p className="text-xs font-bold uppercase tracking-[.15em] text-[#b36534]">What we do</p>
            <HeroTypingLine
              phrases={PHRASES}
              className="mt-2 min-h-[3.5rem] max-w-[590px] text-[clamp(1.1rem,2vw,1.5rem)] font-bold leading-7 text-[#244e68] sm:min-h-[2.25rem]"
            />
          </div>
          <p className="mt-3 max-w-[530px] text-base leading-8 text-[#486376] sm:text-lg">
            Register, verify, locate and manage your organisation's fixed assets through one reliable, accountable platform.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/register" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-[#b56435] bg-[#c77435] px-6 text-sm font-bold text-white shadow-[0_6px_14px_rgba(160,80,36,.16)] transition-colors hover:bg-[#a85d30] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#102b3c]">
              Start free trial <ArrowRight className="h-4 w-4" aria-hidden="true"/>
            </Link>
            <Link to="/features" className="inline-flex min-h-12 items-center justify-center rounded-lg border border-[#9bb3c1] bg-white/90 px-6 text-sm font-bold text-[#17394d] transition-colors hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#102b3c]">
              Explore features
            </Link>
          </div>
        </div>
      </div>
    </div>
    <div className="relative z-10 border-t border-[#d8e3ea] bg-white/95 px-5 py-4">
      <div className="mx-auto flex max-w-7xl items-center gap-3 overflow-x-auto sm:justify-between">
        <span className="shrink-0 pr-2 text-xs font-bold uppercase tracking-[.12em] text-[#435c6f]">The 7 steps</span>
        {STAGES.map((stage,i)=><div key={stage} className="flex shrink-0 items-center gap-2 text-sm font-semibold text-[#18374a]">
          <span className="flex h-7 w-7 items-center justify-center rounded-md border border-[#e6c0a4] bg-[#fff1e8] text-xs font-bold text-[#b36534]">{i+1}</span>{stage}
        </div>)}
      </div>
    </div>
  </section>;
}
