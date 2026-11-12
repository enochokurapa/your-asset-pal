import {useExportAccess} from "@/lib/export-permissions";
import { createFileRoute, Outlet, Link, Navigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth, ModuleKey } from "@/hooks/use-auth";
import {
  LayoutDashboard, Package, Tags, MapPin, Users, Boxes, LogOut, Menu, X, FileBarChart,
  Building2, History, UserCircle, TrendingDown, DoorOpen, Settings, ChevronDown, ClipboardCheck,
  Activity, Wrench, CreditCard, Globe2, ShieldCheck, Mail, LockKeyhole, DatabaseBackup, ImageIcon, PlugZap, Radar, SlidersHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { NotificationBell } from "@/components/notification-bell";
import { toast } from "sonner";
import { DEFAULT_TEMPLATE, type DocumentTemplate } from "@/lib/pdf-template";
import { applyBrowserBranding, BRANDING_CHANGED_EVENT, loadTenantBranding } from "@/lib/branding";
import { PlatformLogo, PlatformName } from "@/components/platform-logo";
import {AddOnInlineCheckout} from "@/components/addon-inline-checkout";

export const Route = createFileRoute("/_app")({ component: AppLayout, head:()=>({meta:[{name:"robots",content:"noindex,nofollow,noarchive"}]}) });

type NavItem = {
  to: string;
  label: string;
  icon: any;
  module?: ModuleKey;
  adminOnly?: boolean;
  tenantAdminOnly?: boolean;
  exact?: boolean;
};

const tenantNav: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, module: "dashboard" },
  { to: "/analytics", label: "Analytics", icon: Activity, tenantAdminOnly: true },
  { to: "/diagnostics", label: "Diagnostics", icon: Wrench, tenantAdminOnly: true },
  { to: "/assets", label: "Assets", icon: Package, module: "assets" },
  { to: "/categories", label: "Categories", icon: Tags, module: "categories" },
  { to: "/locations", label: "Locations", icon: MapPin, module: "locations" },
  { to: "/live-tracking", label: "Live Tracking", icon: Radar, module: "live_tracking" },
  { to: "/integrations", label: "Integrations", icon: PlugZap, module: "api_access", tenantAdminOnly: true },
  { to: "/branches", label: "Branches", icon: Building2, module: "branches", tenantAdminOnly: true },
  { to: "/depreciation", label: "Depreciation", icon: TrendingDown, module: "depreciation" },
  { to: "/gate-pass", label: "Gate Pass", icon: DoorOpen, module: "gate_pass" },
  { to: "/verification", label: "Verification", icon: ClipboardCheck, module: "verification" },
  { to: "/reports", label: "Reports", icon: FileBarChart, module: "reports" },
  { to: "/audit", label: "Audit Trail", icon: History, module: "audit" },
  { to: "/builders", label: "Builders", icon: SlidersHorizontal, tenantAdminOnly: true },
  { to: "/settings", label: "Settings", icon: Settings, module: "settings", tenantAdminOnly: true },
  { to: "/support-requests", label: "Platform Support Requests", icon: ShieldCheck, tenantAdminOnly: true },
  { to: "/billing", label: "Plan & Billing", icon: CreditCard, tenantAdminOnly: true },
  { to: "/profile", label: "My profile", icon: UserCircle },
];

const REPORT_MENU=[
 ["register","Asset register"],["locations","Locations"],["movements","Asset movements"],
 ["assigned","Assignments"],["disposals","Retirement and disposal"],["maintenance","Maintenance"],
 ["approvals","Approval requests"],["verification","Verification history"],["verification-status","Verification status by asset"],["depreciation","Depreciation"],
 ["gate-pass","Gate passes"],["branch","Branch summary"],["department","Department summary"],
 ["condition","Asset condition"],
] as const;

const saasAdminNav: NavItem[] = [
  { to: "/dashboard", label: "Control Center", icon: LayoutDashboard, exact: true },
  { to: "/saas-admin/analytics", label: "Platform Analytics", icon: Activity },
  { to: "/saas-admin/traffic", label: "Visitor Traffic", icon: Activity },
  { to: "/saas-admin/contact", label: "Contact Inbox", icon: Mail },
  { to: "/saas-admin/social-links", label: "Social Media & WhatsApp", icon: Globe2 },
  { to: "/saas-admin/organizations", label: "Businesses", icon: Building2 },
  { to: "/saas-admin/user-activity", label: "User Accounts", icon: Users },
  { to: "/saas-admin/partners", label: "Partners", icon: Building2 },
  { to: "/saas-admin/settings", label: "Settings", icon: Settings },
  { to: "/profile", label: "My profile", icon: UserCircle },
];

function AppLayout() {
  const {
    user, loading, signOut, isAdmin, isTenantAdmin, isSaasAdmin, supportMode, platformStaffRole, roles, canView, isPaidFeature, isAddOnFeature,
    mustChangePassword, canExportReports, subscriptionStatus, trialEndsAt, tenantId, tenantName,
  } = useAuth();
  // Render the original business navigation whenever a verified support session is active.
  const platformControl = isSaasAdmin && !supportMode;
  const exitBusinessSupport=async()=>{
    try {
      const {supabase}=await import("@/integrations/supabase/client");
      const {error}=await supabase.rpc("end_current_platform_support_session" as any);
      if(error)throw error;
    }catch(error){console.error("[Support] Exit logging failed",error);}
    finally{
      window.sessionStorage.removeItem("af-platform-tenant-session");
      window.location.assign("/saas-admin/organizations");
    }
  };
  useEffect(()=>{
    if(!supportMode)return;
    let active=true;
    const check=async()=>{
      const {supabase}=await import("@/integrations/supabase/client");
      const {data,error}=await supabase.rpc("current_platform_support_context" as any);
      if(active&&(error||!data)){
        window.sessionStorage.removeItem("af-platform-tenant-session");
        window.location.replace("/saas-admin/organizations");
      }
    };
    const timer=window.setInterval(()=>{void check();},15000);
    return()=>{active=false;window.clearInterval(timer);};
  },[supportMode]);
  const [open, setOpen] = useState(false);
  const [settingsOpen,setSettingsOpen]=useState(false);
  const [reportsOpen,setReportsOpen]=useState(false);
  const [billingOpen,setBillingOpen]=useState(false);
  const [verificationOpen,setVerificationOpen]=useState(false);
  const [assetSetupOpen,setAssetSetupOpen]=useState(false);
  const [managementOpen,setManagementOpen]=useState(false);
  const [addonsOpen,setAddonsOpen]=useState(false);
  const [branding, setBranding] = useState<DocumentTemplate | null>(null);
  const [mfaChecked,setMfaChecked]=useState(false);
  const [mfaRequired,setMfaRequired]=useState(false);
  useEffect(()=>{
    if(!user||loading){setMfaChecked(false);setMfaRequired(false);return;}
    let active=true;
    setMfaChecked(false);
    import("@/integrations/supabase/client").then(async({supabase})=>{
      const {data:{session}}=await supabase.auth.getSession();
      if(!session?.access_token)throw new Error("Sign-in session unavailable");
      const response=await fetch("/api/security/email-mfa/status",{method:"POST",headers:{Authorization:"Bearer "+session.access_token},cache:"no-store"});
      if(!response.ok)throw new Error("Security status unavailable");
      const status=await response.json() as {verified?:boolean};
      if(active){setMfaRequired(!status.verified);setMfaChecked(true);}
    }).catch(()=>{if(active){setMfaRequired(true);setMfaChecked(true);}});
    return ()=>{active=false;};
  },[user?.id,loading,platformControl,isTenantAdmin]);

  const pathname = useRouterState({ select: (s) => s.location.pathname });
  useEffect(()=>{
    if(["/settings","/users","/domains","/billing"].some(path=>pathname.startsWith(path)))setSettingsOpen(true);
    if(pathname.startsWith("/reports"))setReportsOpen(true);
    if(pathname.startsWith("/billing"))setBillingOpen(true);
    if(pathname.startsWith("/verification"))setVerificationOpen(true);
    if(["/categories","/locations","/branches"].some(path=>pathname.startsWith(path)))setAssetSetupOpen(true);
    if(["/analytics","/diagnostics","/audit","/builders"].some(path=>pathname.startsWith(path)))setManagementOpen(true);
    if(["/integrations","/live-tracking"].some(path=>pathname.startsWith(path)))setAddonsOpen(true);
  },[pathname]);
  const exportAccess=useExportAccess();

  useEffect(() => {
    if (platformControl || !tenantId) return;
    let active = true;
    loadTenantBranding(tenantId).then((value) => {
      if (!active) return;
      setBranding(value);
      applyBrowserBranding(value);
    }).catch((error) => console.error("Unable to apply company branding", error));
    const onChanged = (event: Event) => {
      const value = (event as CustomEvent<DocumentTemplate>).detail;
      setBranding(value);
      applyBrowserBranding(value);
    };
    window.addEventListener(BRANDING_CHANGED_EVENT, onChanged);
    return () => { active = false; window.removeEventListener(BRANDING_CHANGED_EVENT, onChanged); };
  }, [tenantId, platformControl]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" />;
  if (!mfaChecked) return <div className="flex min-h-screen items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent"/></div>;
  if (mfaRequired) return <Navigate to="/mfa" />;
  if (mustChangePassword) return <Navigate to="/welcome" />;
  if (platformStaffRole && !isSaasAdmin) return <Navigate to="/platform-workspace" />;

  const isSaasControlRoute =
    pathname === "/dashboard" ||
    pathname.startsWith("/saas-admin") ||
    pathname.startsWith("/profile");

  if (platformControl && !isSaasControlRoute) {
    return <Navigate to="/dashboard" />;
  }

  const activeNav = platformControl ? saasAdminNav : tenantNav;
  const currentNavItem = activeNav.find((n) =>
    n.exact ? pathname === n.to : pathname.startsWith(n.to),
  );

  if (!platformControl && currentNavItem?.tenantAdminOnly && !isTenantAdmin) return <Navigate to="/dashboard" />;
  if (!platformControl && currentNavItem?.adminOnly && !isAdmin) return <Navigate to="/dashboard" />;

  const builderKeys: ModuleKey[] = ["register_builder", "report_builder", "form_builder", "dashboard_builder", "document_builder"];
  const visibleTenantNav = tenantNav.filter((n) => {
    if (n.to === "/builders" && !builderKeys.some(k => canView(k) || isPaidFeature(k) || isAddOnFeature(k))) return false;
    if (n.tenantAdminOnly && !isTenantAdmin) return false;
    if (n.adminOnly && !isAdmin) return false;
    if (n.module && !canView(n.module) && !isPaidFeature(n.module) && !isAddOnFeature(n.module)) return false;
    return true;
  });

  const groupedNavPaths=new Set(["/categories","/locations","/branches","/analytics","/diagnostics","/audit","/builders","/integrations","/live-tracking"]);
  const groupItems=(paths:string[])=>visibleTenantNav.filter(n=>paths.includes(n.to));
  const visibleNav = platformControl ? saasAdminNav : visibleTenantNav.filter(n=>!groupedNavPaths.has(n.to)&&n.to!=="/billing");

  const currentModuleItem = !platformControl && currentNavItem?.module ? currentNavItem : undefined;
  const lockedPaidFeature = currentModuleItem?.module && (isPaidFeature(currentModuleItem.module) || isAddOnFeature(currentModuleItem.module))
    ? {item:currentModuleItem,type:isAddOnFeature(currentModuleItem.module)?"add_on":"paid"}
    : null;
  const workspaceLocked = !platformControl && !supportMode && (subscriptionStatus==="expired"||subscriptionStatus==="suspended") && !pathname.startsWith("/billing") && !pathname.startsWith("/profile") && pathname!=="/dashboard" && pathname!=="/integrations" && pathname!=="/live-tracking";

  const trialDaysLeft = trialEndsAt
    ? Math.max(0, Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / 86400000))
    : null;

  const blockRestrictedExport = (e: React.MouseEvent<HTMLElement>) => {
    if (platformControl || (["register","template","reports","documents","other"] as const).some(cap=>exportAccess.allowed(cap))) return;
    const target = e.target as HTMLElement;
    const button = target.closest("button");
    if (!button) return;
    const text = (button.textContent || "").trim().toLowerCase();
    if (/\b(pdf|excel|xlsx|csv|export|template|download)\b/.test(text)) {
      e.preventDefault();
      e.stopPropagation();
      toast.error("Downloads are locked for this business. Contact your SaaS administrator.");
    }
  };

  const renderNavItem = (item: NavItem) => {
    const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
    const Icon = item.icon;
    const paid = !platformControl && item.module ? isPaidFeature(item.module) : false;
    const addOn = !platformControl && item.module ? isAddOnFeature(item.module) : false;
    const expiredLock = workspaceLocked && item.to!=="/billing" && item.to!=="/profile" && item.to!=="/dashboard" && !addOn;
    return (
      <Link
        key={item.to}
        to={item.to}
        onClick={() => setOpen(false)}
        className={cn(
          "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
          active ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm" : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        )}
      >
        <Icon className="h-4 w-4" />
        <span className="min-w-0 flex-1">{item.label}</span>
        {expiredLock && <LockKeyhole className="h-3.5 w-3.5 opacity-70"/>}
        {!expiredLock&&paid && (
          <span className="flex items-center gap-1 rounded-full border border-current/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide opacity-80">
            <LockKeyhole className="h-3 w-3" /> Included after upgrade
          </span>
        )}
        {addOn && (
          <span className="flex items-center gap-1 rounded-full border border-current/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide opacity-80">
            <LockKeyhole className="h-3 w-3" /> Add-on
          </span>
        )}
      </Link>
    );
  };

  return (
    <div className={cn("af-app-outer flex min-h-screen w-full bg-[#f8f5f2]", platformControl && "platform-brand")} onClickCapture={blockRestrictedExport}>
      {open && <div className="fixed inset-0 z-40 bg-black/40 md:hidden" onClick={() => setOpen(false)} />}

      <aside
        className={cn(
          "af-premium-sidebar fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-sidebar text-sidebar-foreground transition-transform md:static md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex min-h-20 items-center justify-between border-b border-sidebar-border px-4 py-2 sm:px-5">
          {platformControl ? (
            <div className="flex min-w-0 flex-1 flex-col items-start justify-center py-1">
              <PlatformLogo variant="lockup" className="h-[52px] w-[186px] max-w-full" imageClassName="object-contain object-left p-0.5" />
              <p className="ml-1 mt-0.5 text-[10px] uppercase tracking-wider text-sidebar-foreground/70">Platform Control</p>
            </div>
          ) : (
            <div className="flex min-w-0 items-center gap-2">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-white text-sidebar-primary sm:h-14 sm:w-14">
                {branding?.logo_data_url ? (
                  <img src={branding.logo_data_url} alt="Company logo" className="h-full w-full rounded-lg bg-white object-contain p-0.5" />
                ) : (
                  <PlatformLogo className="h-full w-full" imageClassName="bg-white p-0.5" />
                )}
              </div>
              <div className="min-w-0"><p className="max-w-36 truncate text-sm font-semibold leading-tight sm:max-w-44 sm:text-base">
                {branding?.organization_name && branding.organization_name !== "Your Organization" ? branding.organization_name : tenantName || "AssetFlow 360"}
              </p><p className="mt-0.5 text-[10px] uppercase tracking-wider text-sidebar-foreground/60">Asset Manager</p></div>
            </div>
          )}
          <button className="md:hidden" onClick={() => setOpen(false)} aria-label="Close menu"><X className="h-5 w-5" /></button>
        </div>

        {platformControl && (
          <div className="mx-3 mt-3 rounded-lg border border-sidebar-border bg-sidebar-accent/40 px-3 py-2 text-xs text-sidebar-foreground/75">
            Business & platform administration
          </div>
        )}

        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {visibleNav.map(item => item.to === "/assets" && !platformControl ? (
            <div key="assets-group" className="space-y-1">
              {renderNavItem(item)}
              {([
                {key:"asset-setup",label:"Asset setup",icon:Tags,items:groupItems(["/categories","/locations","/branches"]),expanded:assetSetupOpen,toggle:()=>setAssetSetupOpen(v=>!v)},
                {key:"management",label:"Management",icon:SlidersHorizontal,items:groupItems(["/analytics","/diagnostics","/audit","/builders"]),expanded:managementOpen,toggle:()=>setManagementOpen(v=>!v)},
              ]).filter(g=>g.items.length>0).map(g=><div key={g.key}>
                <button type="button" onClick={g.toggle} aria-expanded={g.expanded} aria-controls={`${g.key}-sidebar-items`}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
                  <g.icon className="h-4 w-4"/><span className="flex-1 text-left">{g.label}</span>
                  <ChevronDown className={cn("h-4 w-4 transition-transform",g.expanded&&"rotate-180")}/>
                </button>
                {g.expanded&&<div id={`${g.key}-sidebar-items`} className="ml-4 space-y-0.5 border-l border-sidebar-border pl-2">{g.items.map(renderNavItem)}</div>}
              </div>)}
            </div>
          ) : item.to === "/reports" && !platformControl ? (
            <div key="reports-group">
              <button type="button" onClick={()=>setReportsOpen(v=>!v)} aria-expanded={reportsOpen}
                aria-controls="report-sidebar-options"
                className={cn("flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  pathname.startsWith("/reports")?"bg-sidebar-primary text-sidebar-primary-foreground":"text-sidebar-foreground/80 hover:bg-sidebar-accent")}>
                <FileBarChart className="h-4 w-4"/><span className="flex-1 text-left">Reports</span>
                <ChevronDown className={cn("h-4 w-4 transition-transform",reportsOpen&&"rotate-180")}/>
              </button>
              {reportsOpen&&<div id="report-sidebar-options" className="ml-4 max-h-[45vh] space-y-0.5 overflow-y-auto border-l border-sidebar-border pl-2">
                {REPORT_MENU.map(([report,label])=><Link key={report} to="/reports" search={{report}}
                    onClick={()=>setOpen(false)}
                    className="block rounded-md px-3 py-2 text-xs font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    activeOptions={{exact:true}}
                  >{label}</Link>)}
              </div>}
            </div>
          ) : item.to === "/verification" && !platformControl ? (
            <div key="verification-group">
              <button type="button" onClick={()=>setVerificationOpen(v=>!v)} aria-expanded={verificationOpen} aria-controls="verification-sidebar-options"
                className={cn("flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  pathname.startsWith("/verification")?"bg-sidebar-primary text-sidebar-primary-foreground":"text-sidebar-foreground/80 hover:bg-sidebar-accent")}>
                <ClipboardCheck className="h-4 w-4"/><span className="flex-1 text-left">Verification</span>
                <ChevronDown className={cn("h-4 w-4 transition-transform",verificationOpen&&"rotate-180")}/>
              </button>
              {verificationOpen&&<div id="verification-sidebar-options" className="ml-4 space-y-0.5 border-l border-sidebar-border pl-2">
                {([ ["scan","Scan & verify"],["due","Due assets"],["history","Verification history"],["settings","Validity & dates"] ] as const).map(([section,label])=><Link key={section} to="/verification" search={{section}} onClick={()=>setOpen(false)}
                  className="block rounded-md px-3 py-2 text-xs font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">{label}</Link>)}
              </div>}
            </div>
          ) : item.to === "/settings" && !platformControl ? (
            <div key="settings-group">
              <button type="button" onClick={()=>setSettingsOpen(v=>!v)}
                aria-expanded={settingsOpen} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground/80 hover:bg-sidebar-accent">
                <Settings className="h-4 w-4"/><span className="flex-1 text-left">Settings</span>
                <ChevronDown className={cn("h-4 w-4 transition-transform",settingsOpen&&"rotate-180")}/>
              </button>
              {settingsOpen&&<div className="ml-4 border-l border-sidebar-border pl-2">
                {[
                  {to:"/settings",label:"General",icon:Settings,module:"settings",tenantAdminOnly:true},
                  {to:"/users",label:"Users",icon:Users,module:"users",tenantAdminOnly:true},
                  {to:"/domains",label:"Domain",icon:Globe2,tenantAdminOnly:true},
                ].filter(item=>!item.module||canView(item.module as ModuleKey)||isPaidFeature(item.module as ModuleKey)||isAddOnFeature(item.module as ModuleKey)).map(renderNavItem)}
                {isTenantAdmin&&<div className="mt-1 border-t border-sidebar-border/50 pt-1">
                  <Link to="/billing" search={{section:"overview"}} onClick={()=>setOpen(false)} className="block rounded-md px-3 py-2 text-xs font-medium text-sidebar-foreground/80 hover:bg-sidebar-accent">Subscription overview</Link>
                  <Link to="/billing" search={{section:"history"}} onClick={()=>setOpen(false)} className="block rounded-md px-3 py-2 text-xs font-medium text-sidebar-foreground/80 hover:bg-sidebar-accent">Billing · Payments & receipts</Link>
                  <Link to="/billing" search={{section:"plans"}} onClick={()=>setOpen(false)} className="block rounded-md px-3 py-2 text-xs font-medium text-sidebar-foreground/80 hover:bg-sidebar-accent">Change package</Link>
                  <Link to="/billing" search={{section:"seats"}} onClick={()=>setOpen(false)} className="block rounded-md px-3 py-2 text-xs font-medium text-sidebar-foreground/80 hover:bg-sidebar-accent">Additional users</Link>
                  <Link to="/billing" search={{section:"capacity"}} onClick={()=>setOpen(false)} className="block rounded-md px-3 py-2 text-xs font-medium text-sidebar-foreground/80 hover:bg-sidebar-accent">Asset capacity</Link>
                </div>}
              </div>}
            </div>
          ) : renderNavItem(item))}
          {!platformControl&&groupItems(["/integrations","/live-tracking"]).length>0&&<div className="mt-3 border-t border-sidebar-border/60 pt-3">
            <button type="button" onClick={()=>setAddonsOpen(v=>!v)} aria-expanded={addonsOpen} aria-controls="addons-bottom-sidebar" className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground/80 hover:bg-sidebar-accent">
              <PlugZap className="h-4 w-4"/><span className="flex-1 text-left">Add-ons</span><ChevronDown className={cn("h-4 w-4 transition-transform",addonsOpen&&"rotate-180")}/>
            </button>
            {addonsOpen&&<div id="addons-bottom-sidebar" className="ml-4 space-y-0.5 border-l border-sidebar-border pl-2">
              {groupItems(["/integrations","/live-tracking"]).map(renderNavItem)}
              {isTenantAdmin&&<Link to="/billing" search={{section:"addons"}} onClick={()=>setOpen(false)} className="block rounded-md px-3 py-2 text-xs text-sidebar-foreground/80 hover:bg-sidebar-accent">See add-on prices & buy</Link>}
            </div>}
          </div>}
        </nav>

        <div className="border-t border-sidebar-border p-3">
          <div className="mb-2 rounded-lg bg-sidebar-accent/50 px-3 py-2">
            <p className="truncate text-xs font-medium text-sidebar-accent-foreground">{user.email}</p>
            <p className="mt-0.5 text-[10px] uppercase tracking-wider text-sidebar-foreground/60">
              {platformControl ? "SaaS Admin" : isTenantAdmin ? "Admin" : roles.length ? roles.join(" · ") : "member"}
            </p>
          </div>
          <button onClick={signOut} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"><LogOut className="h-4 w-4" /> Sign out</button>
        </div>
      </aside>

      <div className="af-app-workspace flex min-w-0 flex-1 flex-col bg-[#f8f5f2]">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur md:px-8">
          <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setOpen(true)} aria-label="Open menu"><Menu className="h-5 w-5" /></Button>
          {platformControl && <div className="hidden text-sm font-medium text-foreground sm:block">AssetFlow 360 · SaaS Control Center</div>}
          <div className="flex-1" />
          {!platformControl && !supportMode && subscriptionStatus === "trial" && isTenantAdmin && (
            <Button asChild variant="outline" size="sm" className="hidden gap-1.5 border-primary/20 bg-primary/5 text-xs font-semibold text-primary hover:bg-primary/10 sm:inline-flex">
              <Link to="/billing">Trial · {trialDaysLeft ?? "-"} days left</Link>
            </Button>
          )}
          <div className="hidden text-sm text-muted-foreground lg:block">{new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</div>
          {!platformControl && <NotificationBell />}
          <Button variant="ghost" size="icon" title="Sign out" onClick={signOut} aria-label="Sign out"><LogOut className="h-4 w-4 text-muted-foreground hover:text-foreground" /></Button>
        </header>

        <main className="mx-auto w-full min-w-0 max-w-[1480px] flex-1 overflow-x-clip border-x border-[#d5e0e8] bg-white px-3 py-4 shadow-[0_10px_30px_rgba(25,55,75,.05)] sm:px-5 sm:py-6 md:px-8 md:py-8">
          {supportMode&&<div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-orange-300 bg-orange-50 px-4 py-3 text-sm text-orange-950" role="status">
            <div><strong>SaaS Admin · Business Support Mode</strong><p className="mt-1 text-xs">You are viewing the existing {tenantName||"business"} portal. All actions remain attributable to your SaaS Admin account. This access is temporary.</p></div>
            <Button variant="outline" size="sm" onClick={()=>{void exitBusinessSupport();}}>Exit Business</Button>
          </div>}
          {!platformControl && pathname.startsWith("/reports") && !exportAccess.allowed("reports") && subscriptionStatus === "trial" && !lockedPaidFeature && (
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              <div className="flex items-center gap-2"><LockKeyhole className="h-4 w-4" /><span><strong>Free trial:</strong> reports are view-only. PDF and Excel downloads are locked until upgrade.</span></div>
              {isTenantAdmin && <Button asChild size="sm"><Link to="/billing">Upgrade</Link></Button>}
            </div>
          )}
          {!platformControl && !supportMode && (subscriptionStatus === "expired" || subscriptionStatus === "suspended") && !pathname.startsWith("/billing") && (
            <div className="mb-5 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
              <strong>{subscriptionStatus === "expired" ? "Trial/subscription expired." : "Workspace suspended."}</strong> Features remain visible but are locked until the workspace is reactivated.{isTenantAdmin && <> <Link to="/billing" className="font-semibold text-primary underline">Open billing</Link>.</>}
            </div>
          )}

          {workspaceLocked ? (
            <div className="relative min-h-[65vh]"><div className="pointer-events-none select-none opacity-45" aria-hidden="true"><Outlet /></div><div className="absolute inset-0 z-20 flex items-start justify-center bg-background/35 pt-12"><div className="sticky top-24 mx-3 max-w-md rounded-2xl border bg-card p-7 text-center shadow-xl"><LockKeyhole className="mx-auto mb-3 h-8 w-8 text-primary"/><h2 className="text-xl font-bold">Workspace locked</h2><p className="mt-2 text-sm text-muted-foreground">Your features and existing records are preserved. Renew your subscription to use them again.</p>{isTenantAdmin?<Button asChild className="mt-5"><Link to="/billing">Renew or upgrade</Link></Button>:<p className="mt-4 text-sm">Contact your business administrator to renew access.</p>}</div></div></div>
          ) : lockedPaidFeature ? (
            <div className="mx-auto max-w-2xl py-8">
              <div className="rounded-2xl border bg-card p-8 text-center shadow-sm">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <LockKeyhole className="h-7 w-7" />
                </div>
                <h1 className="mt-5 text-2xl font-bold">{lockedPaidFeature.item.label}</h1>
                {lockedPaidFeature.type === "add_on" ? (
                  <>
                    <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
                      This is an optional paid add-on. It is activated and billed separately from your AssetFlow plan.
                    </p>
                    <AddOnInlineCheckout moduleKey={lockedPaidFeature.item.module!}/>
                  </>
                ) : (
                  <>
                    <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
                      This feature is included with the paid AssetFlow plan. It remains visible during your free trial so you can see what is available after upgrading.
                    </p>
                    {isTenantAdmin ? (
                      <Button asChild className="mt-6"><Link to="/billing">Upgrade plan</Link></Button>
                    ) : (
                      <p className="mt-6 text-sm font-medium text-muted-foreground">Ask your admin to upgrade the workspace.</p>
                    )}
                  </>
                )}
              </div>
            </div>
          ) : (
            <Outlet />
          )}
        </main>
      </div>
    </div>
  );
}
