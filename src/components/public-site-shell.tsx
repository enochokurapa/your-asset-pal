import { Link, useLocation } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getPublicImportantLinks } from "@/lib/platform-links.functions";
import {getPublicSocialLinks,type SocialPlatform} from "@/lib/platform-social.functions";
import { useEffect, useRef, useState } from "react";
import { PlatformLogo } from "@/components/platform-logo";
import { Button } from "@/components/ui/button";
import { ArrowRight, Menu, X, Facebook, Instagram, Linkedin, Youtube, Twitter, Send, MessageCircle, Music2 } from "lucide-react";

const nav = [
  { to: "/features", label: "Features" },
  { to: "/solutions", label: "Solutions" },
  { to: "/pricing", label: "Pricing" },
] as const;

export function PublicHeader() {
  const [open, setOpen] = useState(false);
  const pathname = useLocation().pathname;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => { setOpen(false); }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const priorOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setOpen(false); return; }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled])'
      ));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = priorOverflow;
      document.removeEventListener("keydown", onKeyDown);
      triggerRef.current?.focus();
    };
  }, [open]);

  return (
    <header className="sticky top-0 z-50 border-b border-[#e8e2db] bg-white">
      <div className="mx-auto flex h-[64px] max-w-7xl items-center gap-5 px-5 sm:h-[72px] sm:px-8">
        <Link to="/" className="shrink-0" aria-label="AssetFlow 360 home">
          <span className="inline-flex h-12 max-w-[190px] items-center gap-2.5 overflow-visible">
            <PlatformLogo variant="mark" className="h-11 w-11 shrink-0" imageClassName="object-contain" />
            <span className="whitespace-nowrap text-[15px] font-bold tracking-tight text-[#233c50]">AssetFlow <span className="text-[#ba6c37]">360</span></span>
          </span>
        </Link>
        <nav aria-label="Main navigation" className="ml-auto hidden items-center gap-8 text-sm font-semibold text-[#283842] lg:flex">
          {nav.map(n => <Link key={n.to} to={n.to}
            activeProps={{ className: "text-[#b96334]" }}
            className="transition-colors hover:text-[#b96334]">{n.label}</Link>)}
        </nav>
        <div className="ml-auto hidden items-center gap-3 lg:ml-5 lg:flex">
          <Button variant="ghost" asChild><Link to="/login">Sign in</Link></Button>
          <Button asChild className="bg-[#c77435] text-white hover:bg-[#a85b2d]">
            <Link to="/register">Start free trial <ArrowRight className="ml-2 h-4 w-4" /></Link>
          </Button>
        </div>
        <button ref={triggerRef} type="button" aria-label="Open navigation menu"
          aria-controls="assetflow-mobile-drawer" aria-expanded={open}
          onClick={() => setOpen(true)}
          className="ml-auto inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-[#e2d7cc] text-[#27323a] lg:hidden">
          <Menu className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
      {/* Fixed overlay: opening the menu never changes the header or hero height. */}
      <div className={`fixed inset-0 z-[100] lg:hidden ${open ? "pointer-events-auto" : "pointer-events-none"}`}
        aria-hidden={!open}>
        <button type="button" aria-label="Close navigation menu"
          tabIndex={open ? 0 : -1}
          onClick={() => setOpen(false)}
          className={`absolute inset-0 h-full w-full bg-[#17242d]/55 transition-opacity duration-300 motion-reduce:transition-none ${open ? "opacity-100" : "opacity-0"}`} />
        <aside id="assetflow-mobile-drawer" ref={panelRef} role="dialog"
          aria-modal={open} aria-label="Mobile navigation"
          inert={!open}
          className={`absolute inset-y-0 right-0 flex h-full w-[78vw] max-w-[360px] flex-col overflow-y-auto bg-[#fffaf5] shadow-2xl transition-transform duration-300 ease-out motion-reduce:transition-none ${open ? "translate-x-0" : "translate-x-full"}`}>
          <div className="flex items-center justify-between gap-3 border-b border-[#eaded2] px-5 py-5">
            <span className="inline-flex h-11 items-center gap-2 overflow-visible">
              <PlatformLogo variant="mark" className="h-10 w-10 shrink-0" />
              <span className="whitespace-nowrap text-sm font-bold text-[#233c50]">AssetFlow <span className="text-[#ba6c37]">360</span></span>
            </span>
            <button ref={closeRef} type="button" aria-label="Close menu"
              onClick={() => setOpen(false)}
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-[#29343a] hover:bg-[#f3e8df]">
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
          <nav aria-label="Mobile navigation" className="flex flex-1 flex-col gap-1 p-5">
            {nav.map(n => <Link key={n.to} to={n.to} onClick={() => setOpen(false)}
              activeProps={{ className: "bg-[#fae8da] text-[#a3532c]" }}
              className="rounded-lg px-4 py-3.5 text-base font-semibold text-[#2b3940] transition-colors hover:bg-[#f5e8dc]">
              {n.label}
            </Link>)}
            <div className="my-4 border-t border-[#eaded2]" />
            <Link to="/login" onClick={() => setOpen(false)}
              className="rounded-lg px-4 py-3.5 text-base font-semibold text-[#2b3940] hover:bg-[#f5e8dc]">Sign in</Link>
            <Link to="/register" onClick={() => setOpen(false)}
              className="mt-3 inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-[#c77435] px-4 text-sm font-bold text-white hover:bg-[#a85b2d]">
              Start free trial <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </nav>
        </aside>
      </div>
    </header>
  );
}

const socialIcons={
 whatsapp:MessageCircle,facebook:Facebook,instagram:Instagram,linkedin:Linkedin,
 x:Twitter,youtube:Youtube,tiktok:Music2,telegram:Send,
} satisfies Record<SocialPlatform,typeof MessageCircle>;
const secondary=[
 {to:"/about",label:"About"},
 {to:"/contact",label:"Contact Us"},
 {to:"/privacy",label:"Privacy Policy"},
 {to:"/terms",label:"Terms of Use"},
] as const;
function FloatingSocialProfiles(){
 const getter=useServerFn(getPublicSocialLinks);
 const {data:links=[]}=useQuery({queryKey:["public-social-links"],queryFn:()=>getter(),staleTime:60_000,retry:1});
 const profiles=links.filter(l=>l.platform!=="whatsapp").slice(0,6);
 if(!profiles.length)return null;
 return <nav aria-label="Official social media" className="fixed bottom-[88px] right-5 z-40 flex flex-col items-center gap-2 sm:bottom-[102px] sm:right-8">
  {profiles.map(link=>{
   const Icon=socialIcons[link.platform];
   return <a key={link.platform} href={link.url} target="_blank" rel="noopener noreferrer"
    title={"AssetFlow on "+link.platform} aria-label={"Open AssetFlow "+link.platform+" profile"}
    className="flex h-10 w-10 items-center justify-center rounded-full border border-[#d9e4e8] bg-white text-[#23475a] shadow-md transition-transform duration-200 hover:scale-105 motion-reduce:transition-none">
    <Icon className="h-4 w-4" aria-hidden="true"/>
   </a>;
  })}
 </nav>;
}
function FloatingWhatsApp(){
 const getter=useServerFn(getPublicSocialLinks);
 const {data:links=[]}=useQuery({queryKey:["public-social-links"],queryFn:()=>getter(),staleTime:60_000,retry:1});
 const chat=links.find(link=>link.platform==="whatsapp");
 if(!chat)return <Link to="/contact" aria-label="Contact AssetFlow support" title="Contact AssetFlow support"
   className="fixed bottom-5 right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full border-2 border-white bg-[#bf7043] text-white shadow-lg transition-transform duration-200 hover:scale-105 motion-reduce:transition-none sm:bottom-7 sm:right-7">
   <MessageCircle className="h-6 w-6" aria-hidden="true"/>
 </Link>;
 return <a href={chat.url} target="_blank" rel="noopener noreferrer"
   aria-label="Chat with AssetFlow support on WhatsApp" title="Chat with us on WhatsApp"
   className="fixed bottom-5 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full border-2 border-white bg-[#25D366] text-white shadow-[0_8px_28px_rgba(10,70,45,.28)] transition-transform duration-200 hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#25D366] motion-reduce:transition-none sm:bottom-7 sm:right-7">
   <svg aria-hidden="true" viewBox="0 0 32 32" fill="currentColor" className="h-8 w-8">
     <path d="M16 3a13 13 0 0 0-11.2 19.6L3 29l6.6-1.7A13 13 0 1 0 16 3Zm0 23.5a10.5 10.5 0 0 1-5.3-1.4l-.4-.2-3.9 1 1-3.8-.3-.4A10.5 10.5 0 1 1 16 26.5Zm5.7-7.8c-.3-.2-1.8-.9-2.1-1s-.5-.2-.7.2c-.2.3-.8 1-1 1.1-.2.2-.4.2-.8 0-.3-.2-1.3-.5-2.5-1.6-.9-.8-1.6-1.8-1.7-2.1-.2-.3 0-.5.1-.7l.5-.6c.2-.2.2-.4.3-.6.1-.2 0-.5 0-.7s-.7-1.7-1-2.4c-.3-.6-.5-.6-.7-.6h-.6c-.2 0-.6.1-.9.5-.3.3-1.2 1.2-1.2 2.9s1.2 3.3 1.4 3.5c.2.2 2.4 3.7 5.8 5.2.8.4 1.4.6 1.9.8.8.2 1.5.2 2 .1.6-.1 1.8-.7 2.1-1.5.3-.7.3-1.4.2-1.5-.1-.2-.3-.3-.6-.5Z"/>
   </svg>
 </a>;
}
export function PublicFooter(){
 const getLinks=useServerFn(getPublicImportantLinks);
 const getSocial=useServerFn(getPublicSocialLinks);
 const {data:links=[]}=useQuery({
  queryKey:["public-important-links"],queryFn:()=>getLinks(),staleTime:60_000,retry:1,
 });
 const {data:social=[]}=useQuery({
  queryKey:["public-social-links"],queryFn:()=>getSocial(),staleTime:60_000,retry:1,
 });
 return <footer className="mx-auto w-full max-w-7xl overflow-hidden bg-[#203946] text-white">
   <div className="mx-auto flex min-w-0 flex-wrap items-start justify-between gap-8 px-5 pb-8 pt-10 sm:px-8 sm:pb-10 sm:pt-12">
     <div className="max-w-md min-w-0">
       <span className="inline-flex items-center gap-2.5">
         <PlatformLogo variant="mark" className="h-11 w-11 shrink-0"/>
         <span className="text-lg font-semibold tracking-tight text-white">AssetFlow 360</span>
       </span>
       <p className="mt-4 text-sm leading-7 text-slate-300">
        Asset registration, verification, location control and lifecycle management in one adaptable platform.
       </p>
     </div>
     <div className="flex min-w-0 flex-col gap-4">
       <nav aria-label="Footer social media" className="flex flex-wrap items-center gap-2">
         {social.map(link=>{
           const Icon=socialIcons[link.platform];
           return <a href={link.url} key={link.platform} target="_blank"
             rel="noopener noreferrer" title={link.platform==="x"?"X":link.platform}
             aria-label={"Visit AssetFlow on "+link.platform}
             className="flex h-10 w-10 items-center justify-center rounded-full border border-white/20 text-slate-200 transition-colors hover:border-[#d58b55] hover:bg-white/10 hover:text-white">
             <Icon className="h-4 w-4" aria-hidden="true"/>
           </a>;
         })}
       </nav>
       {links.length>0&&<nav aria-label="Other websites" className="flex max-w-md flex-wrap gap-x-4 gap-y-2 text-xs text-slate-300">
         {links.map(link=><a key={link.id} href={link.url} target="_blank" rel="noopener noreferrer"
           title={link.description||undefined} className="max-w-full break-words hover:text-white">{link.title}</a>)}
       </nav>}
     </div>
   </div>
   <div className="border-t border-white/15">
     <div className="mx-auto flex min-w-0 max-w-7xl flex-col gap-3 px-5 py-5 text-xs text-slate-300 sm:flex-row sm:items-center sm:justify-between sm:px-8">
       <span className="shrink-0">© {new Date().getFullYear()} AssetFlow 360. All rights reserved.</span>
       <nav aria-label="Legal and company information" className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-2">
         {secondary.map(n=><Link key={n.to} to={n.to} className="transition-colors hover:text-white">{n.label}</Link>)}
       </nav>
     </div>
   </div>
 </footer>;
}
export function PublicShell({children}:{children:React.ReactNode}){return <div className="min-h-screen bg-[#f7f9fa] text-[#112c3c]"><style>{`@keyframes af-appear{from{opacity:0;transform:translateY(22px)}to{opacity:1;transform:translateY(0)}}@keyframes af-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-12px)}}@keyframes af-pulse{0%,100%{opacity:.5}50%{opacity:1}}.af-enter{animation:af-appear .7s both}.af-enter-late{animation:af-appear .85s .2s both}.af-float{animation:af-float 7s ease-in-out infinite}.af-softpulse{animation:af-pulse 5s ease-in-out infinite}@media(prefers-reduced-motion:reduce){.af-enter,.af-enter-late,.af-float,.af-softpulse{animation:none!important}}`}</style><PublicHeader/>{children}<PublicFooter/><FloatingSocialProfiles/><FloatingWhatsApp/></div>}
