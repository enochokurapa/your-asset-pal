import type {ReactNode} from "react";
import {Link} from "@tanstack/react-router";
import {ArrowLeft,ShieldCheck} from "lucide-react";
import {PlatformLogo} from "@/components/platform-logo";
import {AuthVisualPanel} from "@/components/auth-visual-panel";

export function AuthPageFrame({children,backTo="/",backLabel="Home",wide=false}:{
 children:ReactNode;backTo:"/"|"/login";backLabel?:string;wide?:boolean
}){
 return <div className="af-auth-stage af-auth-split platform-brand min-h-[100dvh] px-0 py-0 lg:px-5 lg:py-8">
   <AuthVisualPanel/>
   <main className={`af-auth-form-side af-auth-container mx-auto flex min-h-[100dvh] w-full flex-col justify-center ${wide?"max-w-[550px]":"max-w-[465px]"}`}>
    <section className="af-auth-card bg-white px-5 py-6 sm:px-8 sm:py-8">
     <header className="mb-6 flex items-center justify-between gap-2 border-b border-slate-100 pb-5">
      <PlatformLogo variant="mark" className="h-11 w-12 shrink-0" imageClassName="object-contain"/>
      <div className="min-w-0 flex-1"><p className="text-[15px] font-bold tracking-tight text-[#172554]">AssetFlow360</p>
       <p className="text-[11px] text-slate-500">Secure workspace access</p></div>
      <Link to={backTo} className="inline-flex min-h-10 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-slate-600 hover:bg-slate-100">
       <ArrowLeft className="h-3.5 w-3.5"/>{backLabel}
      </Link>
     </header>
     {children}
    </section>
    <footer className="mt-5 flex items-center justify-center gap-1.5 text-center text-[11px] text-slate-500">
     <ShieldCheck className="h-3.5 w-3.5"/><span>Protected access · AssetFlow360</span>
    </footer>
   </main>
 </div>
}
