import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BarChart3, Building2, MapPinned, Package, ShieldCheck } from "lucide-react";
import { getPublicStats,type PublicHomepageStat } from "@/lib/platform-public-stats.functions";

const icons = {assets:Package,companies:Building2,locations:MapPinned,verifications:ShieldCheck} as const;

function AnimatedNumber({value,visible,reduced}:{value:number;visible:boolean;reduced:boolean}){
  const [current,setCurrent]=useState(value);
  useEffect(()=>{
    if (!visible || reduced) {setCurrent(value);return;}
    let frame=0;
    const start=performance.now();
    const duration=950;
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

export function HomeLiveStats({initialStats}:{initialStats:PublicHomepageStat[]}){
  const get=useServerFn(getPublicStats);
  const {data=initialStats}=useQuery({queryKey:["public-stats"],queryFn:()=>get(),initialData:initialStats,staleTime:90_000});
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
    className="relative w-full min-w-0">
    <div className="grid min-w-0 grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
      {data.map((item,index)=>{
        const Icon=icons[item.metric_key as keyof typeof icons] || BarChart3;
        return <div key={item.metric_key}
          style={{transitionDelay:reduced?"0ms":`${index*100}ms`}}
          className={`min-w-0 rounded-xl border border-[#e9e0d8] bg-[#fffaf5] p-2.5 shadow-[0_8px_24px_rgba(27,62,78,.10)] transition-[opacity,transform,box-shadow] duration-700 ease-out hover:-translate-y-1 hover:shadow-[0_14px_30px_rgba(27,62,78,.15)] motion-reduce:transform-none motion-reduce:transition-none sm:p-4
            ${visible||reduced?"translate-y-0 opacity-100":"translate-y-3 opacity-55"}`}>
          <div className="flex min-w-0 items-center gap-2">
            <Icon aria-hidden="true" className="h-4 w-4 shrink-0 text-[#CB7B30]"/>
            <span className="min-w-0 break-words text-[10px] font-medium leading-4 text-[#344372] sm:text-xs">{item.label}</span>
          </div>
          <p className="mt-2 break-words text-[clamp(1.25rem,2.2vw,1.85rem)] font-semibold leading-tight tracking-tight text-[#19285f]">
            <AnimatedNumber value={item.value} visible={visible} reduced={reduced}/>
          </p>
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
