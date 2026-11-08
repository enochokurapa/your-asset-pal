import {useQuery} from "@tanstack/react-query";
import {useServerFn} from "@tanstack/react-start";
import {getPublicPartners} from "@/lib/platform-partners.functions";

export function PublicPartners(){
 const get=useServerFn(getPublicPartners);
 const {data=[]}=useQuery({queryKey:["public-partner-logos"],queryFn:()=>get(),staleTime:300000});
 if(!data.length)return null;
 const moving=data.length>1;
 const group=(duplicate:boolean)=><div aria-hidden={duplicate} className="af-partners-group flex shrink-0 items-center justify-center gap-5 pr-5 sm:gap-9 sm:pr-9">
  {data.map(partner=><div key={`${partner.id}-${duplicate?"repeat":"original"}`} className="af-partner-logo flex h-[78px] w-[160px] shrink-0 items-center justify-center rounded-xl border border-[#e6edf1] bg-white px-5 py-3 shadow-[0_8px_25px_rgba(15,51,72,.045)] sm:h-[96px] sm:w-[200px]">
    <img src={partner.logo_data_url} alt={duplicate?"":partner.name+" logo"} loading="lazy" className="max-h-full max-w-full object-contain"/>
  </div>)}
 </div>;
 return <section aria-label="Our partners" className="overflow-hidden border-t border-[#e1e9ee] bg-[#fbfcfd] px-5 py-9 sm:px-8 sm:py-12">
  <div className="mx-auto max-w-7xl">
   <div className="mb-7 text-center"><p className="text-[10px] font-semibold uppercase tracking-[.2em] text-[#b66e45]">Trusted partnerships</p><h2 className="mt-2 text-xl font-bold tracking-tight text-[#18394c] sm:text-2xl">Our partners</h2></div>
   {moving?<div className="af-partners-window mx-auto max-w-5xl overflow-hidden" aria-label="Partner logo carousel">
     <div className="af-partners-marquee flex w-max items-center">{group(false)}{group(true)}</div>
    </div>
    :<div className="af-partners-single flex justify-center">{group(false)}</div>}
  </div>
  <style>{`
    @keyframes afPartnersSlide{to{transform:translateX(-50%)}}
    @keyframes afPartnersAppear{from{opacity:.4;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
    .af-partners-marquee{animation:afPartnersSlide 26s linear infinite}
    .af-partners-single{animation:afPartnersAppear 900ms ease-out both}
    .af-partners-window:hover .af-partners-marquee{animation-play-state:paused}
    .af-partner-logo{transition:box-shadow .3s ease,transform .3s ease}
    .af-partner-logo:hover{transform:translateY(-3px);box-shadow:0 13px 27px rgba(15,51,72,.1)}
    @media(prefers-reduced-motion:reduce){.af-partners-marquee,.af-partners-single{animation:none!important}.af-partners-window{overflow-x:auto}.af-partner-logo{transition:none!important}}
  `}</style>
 </section>;
}
