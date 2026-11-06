import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowUpRight, BarChart3, Building2, MapPinned, Package, ShieldCheck } from "lucide-react";
import { getPublicStats } from "@/lib/platform-public-stats.functions";

const icons = {assets:Package,companies:Building2,locations:MapPinned,verifications:ShieldCheck} as const;

function AnimatedNumber({value,visible,reduced}:{value:number;visible:boolean;reduced:boolean}){
  const [current,setCurrent]=useState(value);
  useEffect(()=>{
    if (!visible || reduced) {setCurrent(value);return;}
    let frame=0;
    const start=performance.now();
    const duration=1500;
    const update=(now:number)=>{
      const progress=Math.min(1,(now-start)/duration);
      const eased=1-Math.pow(1-progress,4);
      setCurrent(Math.round(value*eased));
      if(progress<1)frame=requestAnimationFrame(update);
    };
    setCurrent(0);
    frame=requestAnimationFrame(update);
    return ()=>cancelAnimationFrame(frame);
  },[visible,value,reduced]);
  return <span className="tabular-nums">{new Intl.NumberFormat("en-US").format(current)}</span>;
}

export function HomeLiveStats(){
  const get=useServerFn(getPublicStats);
  const {data=[],isLoading}=useQuery({queryKey:["public-stats"],queryFn:()=>get(),staleTime:60_000});
  const ref=useRef<HTMLElement>(null);
  const [visible,setVisible]=useState(false);
  const [reduced,setReduced]=useState(true);
  useEffect(()=>{
    const media=window.matchMedia("(prefers-reduced-motion: reduce)");
    const change=()=>setReduced(media.matches);
    change();media.addEventListener("change",change);
    const observer=new IntersectionObserver(entries=>{
      if(entries.some(entry=>entry.isIntersecting)){setVisible(true);observer.disconnect();}
    },{threshold:.25});
    if(ref.current)observer.observe(ref.current);
    return ()=>{media.removeEventListener("change",change);observer.disconnect();};
  },[]);
  return <section ref={ref} aria-label="AssetFlow platform statistics"
    className="mx-auto w-full max-w-7xl overflow-hidden border-b border-[#dce5e8] bg-[#eef4f3] px-5 py-9 sm:px-8 sm:py-12">
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div><p className="text-[11px] font-semibold uppercase tracking-[.17em] text-[#ab6339]">AssetFlow in numbers</p>
        <h2 className="mt-2 text-xl font-semibold tracking-tight text-[#263d49] sm:text-2xl">A clearer picture of every asset.</h2></div>
      <ArrowUpRight aria-hidden="true" className="h-5 w-5 text-[#b96b3f]"/>
    </div>
    <div className="grid min-w-0 grid-cols-2 gap-3 lg:grid-cols-4">
      {isLoading ? <p className="col-span-full text-sm text-[#657983]">Loading platform figures…</p> :
      data.map(item=>{
        const Icon=icons[item.metric_key as keyof typeof icons] || BarChart3;
        return <div key={item.metric_key} className="min-w-0 rounded-xl border border-[#d8e4e6] bg-white/80 p-4 sm:p-5">
          <Icon aria-hidden="true" className="mb-4 h-5 w-5 text-[#b96b3f]"/>
          <p className="break-words text-[clamp(1.45rem,3vw,2.3rem)] font-semibold tracking-tight text-[#29404c]">
            <AnimatedNumber value={item.value} visible={visible} reduced={reduced}/>
          </p>
          <p className="mt-1 break-words text-xs font-medium text-[#5e747e] sm:text-sm">{item.label}</p>
        </div>;
      })}
    </div>
  </section>;
}

export function HomeScrollMotion(){
  useEffect(()=>{
    const media=window.matchMedia("(prefers-reduced-motion: reduce)");
    if(media.matches || !("IntersectionObserver" in window))return;
    const elements=Array.from(document.querySelectorAll<HTMLElement>(".assetflow-homepage [data-home-reveal]"));
    const observer=new IntersectionObserver((entries)=>{
      for(const entry of entries)if(entry.isIntersecting){
        const element=entry.target as HTMLElement;
        element.style.opacity="1";
        element.style.transform="none";
        element.style.filter="none";
        element.style.willChange="auto";
        observer.unobserve(element);
      }
    },{rootMargin:"0px 0px -8% 0px",threshold:.12});
    elements.forEach((element,index)=>{
      element.style.opacity="0";
      element.style.transform="translate3d(0,36px,0)";
      element.style.filter="blur(3px)";
      element.style.willChange="opacity, transform, filter";
      element.style.transition="opacity 700ms ease, transform 850ms cubic-bezier(.18,.74,.27,1), filter 700ms ease";
      element.style.transitionDelay=`${Math.min(index%4*75,225)}ms`;
      observer.observe(element);
    });
    return ()=>{observer.disconnect();elements.forEach(element=>{
      element.style.opacity="";element.style.transform="";element.style.filter="";
      element.style.transition="";element.style.transitionDelay="";element.style.willChange="";
    });};
  },[]);
  return null;
}
