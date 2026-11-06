import {publicHead} from "@/lib/public-seo";
import {createFileRoute,Link} from "@tanstack/react-router";
import {PublicShell} from "@/components/public-site-shell";
export const Route=createFileRoute("/terms")({component:TermsPage,
 head:()=>publicHead("/terms","Terms of Use | AssetFlow 360","Read general information about AssetFlow 360 platform use, accounts, subscriptions, responsibilities and acceptable use.")});
function TermsPage(){return <PublicShell><main className="mx-auto w-full max-w-7xl bg-[#f3f7f8] px-5 py-10 sm:px-8 sm:py-14">
 <article className="mx-auto max-w-3xl space-y-6 text-sm leading-7 text-[#445d6a]">
  <header><p className="text-xs font-semibold uppercase tracking-[.15em] text-[#bb6b3f]">Platform information</p>
   <h1 className="mt-3 text-3xl font-semibold text-[#203b49]">Terms of Use</h1>
   <p className="mt-2 text-xs text-[#617885]">Updated November 6, 2026</p></header>
  <p>These general terms describe responsible use of the AssetFlow 360 website and application. Organisation subscriptions may be governed by additional accepted service agreements and plan-specific terms.</p>
  <section><h2 className="text-lg font-semibold text-[#203b49]">Accounts and authorised access</h2>
   <p>Users should provide accurate account information, safeguard credentials, complete required authentication checks and access only the records and functions they are authorised to use. Organisations are responsible for managing their permitted users and roles.</p></section>
  <section><h2 className="text-lg font-semibold text-[#203b49]">Acceptable use</h2>
   <p>Do not attempt unauthorised access, circumvent access controls, upload malicious content, interfere with services or use the platform to violate applicable laws or the rights of others.</p></section>
  <section><h2 className="text-lg font-semibold text-[#203b49]">Organisational information</h2>
   <p>Organisations are responsible for the accuracy and lawful use of asset and business information they enter. Verification statuses should not be presented as evidence of a completed physical check where no inspection has been recorded.</p></section>
  <section><h2 className="text-lg font-semibold text-[#203b49]">Plans and payments</h2>
   <p>Features, user allowances, asset capacity, optional add-ons and charges depend on the selected plan and confirmed billing transactions. Currency conversion and payment-method availability may vary by provider and current configuration.</p></section>
  <section><h2 className="text-lg font-semibold text-[#203b49]">Service availability</h2>
   <p>Service availability may be affected by maintenance, third-party providers, networking or other interruptions. Report suspected security issues or service faults through our official support channels.</p></section>
  <section><h2 className="text-lg font-semibold text-[#203b49]">Questions</h2>
   <p>To request clarification about service arrangements, visit our <Link to="/contact" className="font-semibold text-[#b8683d] underline">Contact Us page</Link>.</p></section>
  <p className="border-t border-[#d6e1e5] pt-4 text-xs text-[#667e88]">These general informational terms require operator and legal review before replacing any binding customer agreement or contractual terms.</p>
 </article>
 </main></PublicShell>}