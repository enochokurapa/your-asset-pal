import {createFileRoute, Navigate, Link} from "@tanstack/react-router";
import {useAuth} from "@/hooks/use-auth";
export const Route=createFileRoute("/_app/saas-admin/settings")({component:SettingsPage});
function SettingsPage(){
 const {isSaasAdmin,loading}=useAuth();
 if(loading)return null;
 if(!isSaasAdmin)return <Navigate to="/dashboard"/>;
 return <div className="space-y-4"><h1 className="text-2xl font-bold">SaaS Settings</h1>
 <p>Manage the platform from one location.</p>
 <div className="grid gap-3 md:grid-cols-2">
 {[
 {to:"/saas-admin/payment-gateways",title:"Payment Gateways",description:"Yo Uganda and ioTec credentials"},
 {to:"/saas-admin/email",title:"Email & SMTP",description:"Sender credentials and email tests"},
 {to:"/saas-admin/email-reports",title:"Automated Reports",description:"Monthly or daily emailed asset summaries"},
 {to:"/saas-admin/modules",title:"Modules & Add-ons",description:"Explicit activation of integrations and GPS"},
 {to:"/saas-admin/organizations",title:"Organizations & Billing",description:"Manage subscriptions and tenant permissions"},
 {to:"/saas-admin/user-activity",title:"User Activity",description:"View recorded system activity"},
 {to:"/saas-admin/analytics",title:"Platform Analytics",description:"Operational metrics, audit trends and renewal issues across organisations"},
 {to:"/saas-admin/backups",title:"Backups & Restore",description:"Cloudflare R2 and automated backup schedules"},
 {to:"/saas-admin/policy",title:"Plans & Pricing",description:"Price and plan settings"},
 {to:"/saas-admin/branding",title:"Branding",description:"Application identity"},
 {to:"/saas-admin/hero-images",title:"Hero Images",description:"Update public page artwork in PNG, WebP or SVG"},
 {to:"/saas-admin/statistics",title:"Homepage Statistics",description:"Live asset and company counters or approved manual totals"},
 {to:"/saas-admin/links",title:"Important Links",description:"Manage external systems and websites shown in the public footer"}
 ].map(item=><Link key={item.to} to={item.to} className="rounded-xl border p-5 transition hover:border-primary">
 <span className="font-semibold">{item.title}</span><p className="text-sm text-muted-foreground">{item.description}</p></Link>)}
 </div>
 <p className="text-sm text-muted-foreground">A standard paid plan does not automatically enable optional integrations or live GPS tracking. Enable these independently for each business.</p></div>;
}
