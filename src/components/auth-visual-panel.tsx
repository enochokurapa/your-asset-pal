import {Building2,ShieldCheck} from "lucide-react";
import {PlatformLogo} from "@/components/platform-logo";
export function AuthVisualPanel(){
 return <aside aria-label="AssetFlow360 workspace" className="af-auth-visual">
  <div className="relative z-10 flex items-center gap-3">
   <span className="rounded-xl bg-white/95 p-2 shadow-sm"><PlatformLogo variant="mark" className="h-10 w-10"/></span>
   <span className="text-xl font-bold tracking-tight text-white">AssetFlow<span className="text-[#ff9b36]">360</span></span>
  </div>
  <div className="relative z-10 mt-auto mb-10 max-w-sm">
    <h2 className="text-[38px] font-bold leading-[1.13] tracking-tight text-white">Every asset.<br/><span className="text-[#ffab50]">Accounted for.</span></h2>
    <p className="mt-4 text-sm leading-6 text-white/80">One secure workspace for your organisation.</p>
  </div>
  <div aria-hidden="true" className="af-auth-building">
   <div className="af-auth-building-top"/>
   <div className="af-auth-building-body">{Array.from({length:24},(_,i)=><span key={i}/>)}</div>
  </div>
  <div className="relative z-10 flex items-center gap-2 border-t border-white/20 pt-5 text-xs font-medium text-white/80">
    <ShieldCheck className="h-4 w-4 text-orange-300"/> Secure asset management
  </div>
 </aside>;
}
