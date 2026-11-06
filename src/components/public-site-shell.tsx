import { Link, useLocation } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getPublicImportantLinks } from "@/lib/platform-links.functions";
import { useEffect, useRef, useState } from "react";
import { PlatformLogo } from "@/components/platform-logo";
import { Button } from "@/components/ui/button";
import { ArrowRight, Menu, X } from "lucide-react";

const nav = [
  { to: "/features", label: "Features" },
  { to: "/solutions", label: "Solutions" },
  { to: "/pricing", label: "Pricing" },
  { to: "/about", label: "About" },
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
          <PlatformLogo variant="lockup" className="h-12 w-44" />
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
            <PlatformLogo variant="lockup" className="h-11 w-36" />
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

export function PublicFooter(){
  const getLinks=useServerFn(getPublicImportantLinks);
  const {data:links=[]}=useQuery({
    queryKey:["public-important-links"],
    queryFn:()=>getLinks(),
    staleTime:60_000,
    retry:1,
  });
  return <footer className="bg-[#203946] text-white">
    <div className="mx-auto grid max-w-7xl gap-9 px-5 py-12 sm:px-8 md:grid-cols-[1.1fr_.9fr]">
      <div className="min-w-0">
        <PlatformLogo variant="lockup" className="h-10 w-40"/>
        <p className="mt-5 max-w-sm text-sm leading-7 text-slate-300">Asset registration, verification, location control and lifecycle management in one adaptable platform.</p>
      </div>
      <div className="grid min-w-0 grid-cols-2 gap-7">
        <nav aria-label="Footer navigation" className="flex min-w-0 flex-col items-start gap-3 text-sm text-slate-200">
          <p className="font-semibold text-white">Explore</p>
          {nav.map(n=><Link key={n.to} to={n.to} className="hover:text-white">{n.label}</Link>)}
          <Link to="/login" className="hover:text-white">Sign in</Link>
        </nav>
        {links.length>0&&<nav aria-label="Important links" className="flex min-w-0 flex-col items-start gap-3 text-sm text-slate-200">
          <p className="font-semibold text-white">Important links</p>
          {links.map(link=><a key={link.id} href={link.url} target="_blank" rel="noopener noreferrer"
            title={link.description||undefined} className="max-w-full break-words leading-5 hover:text-white">{link.title}</a>)}
        </nav>}
      </div>
    </div>
    <div className="border-t border-white/10 px-5 py-5 text-center text-xs text-slate-400">© {new Date().getFullYear()} AssetFlow 360</div>
  </footer>;
}
export function PublicShell({children}:{children:React.ReactNode}){return <div className="min-h-screen bg-[#f7f9fa] text-[#112c3c]"><style>{`@keyframes af-appear{from{opacity:0;transform:translateY(22px)}to{opacity:1;transform:translateY(0)}}@keyframes af-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-12px)}}@keyframes af-pulse{0%,100%{opacity:.5}50%{opacity:1}}.af-enter{animation:af-appear .7s both}.af-enter-late{animation:af-appear .85s .2s both}.af-float{animation:af-float 7s ease-in-out infinite}.af-softpulse{animation:af-pulse 5s ease-in-out infinite}@media(prefers-reduced-motion:reduce){.af-enter,.af-enter-late,.af-float,.af-softpulse{animation:none!important}}`}</style><PublicHeader/>{children}<PublicFooter/></div>}
