import {publicHead} from "@/lib/public-seo";
import {createFileRoute,Link} from "@tanstack/react-router";
import {PublicShell} from "@/components/public-site-shell";
export const Route=createFileRoute("/privacy")({component:PrivacyPage,
 head:()=>publicHead("/privacy","Privacy Policy | AssetFlow 360","Read how AssetFlow 360 processes organisation data, account details, enquiries and aggregated website traffic information.")});
function PrivacyPage(){return <PublicShell><main className="mx-auto w-full max-w-7xl bg-[#f3f7f8] px-5 py-10 sm:px-8 sm:py-14">
 <article className="mx-auto max-w-3xl space-y-6 text-sm leading-7 text-[#445d6a]">
  <header><p className="text-xs font-semibold uppercase tracking-[.15em] text-[#bb6b3f]">Privacy and data protection</p>
   <h1 className="mt-3 text-3xl font-semibold text-[#203b49]">Privacy Policy</h1>
   <p className="mt-2 text-xs text-[#617885]">Updated November 6, 2026</p></header>
  <p>AssetFlow 360 provides fixed-asset management and related organisational services. This notice describes the types of information processed through the public website and application and the general reasons for processing it.</p>
  <section><h2 className="text-lg font-semibold text-[#203b49]">Information collected</h2>
   <p>Depending on how you use AssetFlow, information may include account details, organisation and team information, fixed-asset records, contact enquiries, support correspondence, payment transaction references, security events and recorded application activity.</p>
  </section>
  <section><h2 className="text-lg font-semibold text-[#203b49]">Website analytics</h2>
   <p>The public website measures aggregated page views, visited page paths and broad referral categories such as direct, search, social and campaign traffic. The aggregate tracker is designed not to store an identifiable visitor ID, IP address or full query string in its traffic reporting table. Browser Do Not Track and Global Privacy Control signals are respected by the page-view collector. Other operational security logs may be processed separately.</p>
  </section>
  <section><h2 className="text-lg font-semibold text-[#203b49]">How information is used</h2>
   <p>Information is processed to provide the service, manage accounts and permissions, maintain records, process and reconcile payments, answer enquiries, monitor reliability and security, meet relevant legal obligations and improve the platform.</p>
  </section>
  <section><h2 className="text-lg font-semibold text-[#203b49]">Access and service providers</h2>
   <p>Organisational data is protected by role-based access controls. Authorised service administrators may need limited access for support, security or operational purposes. Selected service providers, including email and payment services, may process necessary information to complete their functions.</p>
  </section>
  <section><h2 className="text-lg font-semibold text-[#203b49]">Retention and protection</h2>
   <p>Records are retained as needed for service delivery, business requirements, security, accounting and applicable law. Retention periods depend on record type and contractual obligations. Technical and organisational controls are used to limit unauthorised access, although no internet service can guarantee zero risk.</p>
  </section>
  <section><h2 className="text-lg font-semibold text-[#203b49]">Privacy enquiries</h2>
   <p>For a privacy question, access request or correction, please <Link to="/contact" className="font-semibold text-[#b8683d] underline">contact the AssetFlow team</Link> and select an appropriate subject. We may need to verify your authority before responding to account or organisation-data requests.</p>
  </section>
  <p className="border-t border-[#d6e1e5] pt-4 text-xs text-[#667e88]">This public notice should be reviewed by the service operator against applicable contracts, retention schedules and data protection requirements before being treated as a final legal policy.</p>
 </article>
 </main></PublicShell>}