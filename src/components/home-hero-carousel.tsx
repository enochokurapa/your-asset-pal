import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight } from "lucide-react";
import { getHeroImage } from "@/lib/platform-hero.functions";
import { HeroTypingLine } from "@/components/hero-typing-line";
import { HomeLiveStats } from "@/components/home-public-effects";

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

/**
 * Backgrounds crossfade every 7s. Content, controls and seven stage labels
 * never change. Diagram labels belong inside the images, not beneath the hero.
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

  return <section aria-label="AssetFlow 360 fixed asset management" className="relative isolate mx-auto w-full max-w-7xl overflow-hidden border-y border-[#dce6e8] bg-[#e7eef1] text-[#243c48] sm:border-x rounded-tr-none rounded-tl-none rounded-bl-none lg:rounded-br-[64px]">
    <div className="relative min-h-[425px] sm:min-h-[490px] lg:min-h-[530px]">
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
      <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 w-full bg-[linear-gradient(90deg,#e7f0f6_0%,rgba(232,242,241,.98)_32%,rgba(236,242,236,.86)_60%,rgba(238,242,240,0)_100%)] md:w-[76%]"/>
      <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 w-full bg-[radial-gradient(ellipse_at_8%_90%,rgba(199,116,53,.13),transparent_65%)] md:w-[72%]"/>
      <div className="relative z-10 mx-auto flex min-h-[425px] w-full max-w-7xl flex-col justify-start px-5 pb-7 pt-7 sm:min-h-[490px] sm:px-8 sm:pb-12 sm:pt-10 lg:min-h-[530px] lg:pt-12">
        <div className="max-w-[580px]">
          <p className="mb-4 inline-flex items-center gap-2 rounded-md border border-[#d3deda] bg-white/75 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[.12em] text-[#a65a32]">
            <span aria-hidden="true" className="h-2 w-2 rounded-sm bg-[#c77435]"/> Complete fixed asset management
          </p>
          <h1 className="text-[clamp(1.85rem,3.3vw,3.3rem)] font-semibold leading-[1.15] tracking-[-.035em] text-[#102b3c]">
            Every asset.<br/><span className="text-[#bf6a39]">Fully accounted for.</span>
          </h1>
          <div className="mt-5 max-w-[550px]">
            <p className="text-xs font-bold uppercase tracking-[.15em] text-[#b36534]">What we do</p>
            <HeroTypingLine
              phrases={PHRASES} initialFullPhrase
              className="mt-2 min-h-[2.25rem] max-w-[545px] text-[clamp(.95rem,1.6vw,1.15rem)] font-medium leading-6 text-[#395c65]"
            />
          </div>
          <p className="mt-2 max-w-[530px] text-sm leading-7 text-[#486376] sm:text-base">
            Register, verify, locate and manage your organisation's fixed assets through one reliable, accountable platform.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link to="/register" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[#b56435] bg-[#c77435] px-5 text-sm font-bold text-white shadow-[0_6px_14px_rgba(160,80,36,.16)] transition-colors hover:bg-[#a85d30] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#102b3c]">
              Start free trial <ArrowRight className="h-4 w-4" aria-hidden="true"/>
            </Link>
            <Link to="/features" className="inline-flex min-h-11 items-center justify-center rounded-lg border border-[#9bb3c1] bg-white/75 px-5 text-sm font-bold text-[#17394d] transition-colors hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#102b3c]">
              Explore features
            </Link>
          </div>
        </div>
        <HomeLiveStats/>
      </div>
    </div>
  </section>;
}
