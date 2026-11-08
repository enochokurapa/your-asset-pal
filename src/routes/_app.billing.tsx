import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/use-auth";
import {
  getSaasContext,
  startYoUpgrade,getPricingPlans,
  checkYoUpgrade,
  startYoAddonPurchase,
  checkYoAddonPurchase,
  startYoSeatPurchase,checkYoSeatPurchase,startYoAssetCapacityPurchase,checkYoAssetCapacityPurchase,
} from "@/lib/saas.functions";
import { getServerAuthHeaders } from "@/lib/auth-headers";
import { normalizeUgandanMobileMoneyPhone } from "@/lib/uganda-mobile-money";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { CreditCard, CheckCircle2, Clock, LockKeyhole, PlugZap, Radar } from "lucide-react";

const BILLING_SECTIONS=["overview","plans","seats","capacity","addons"] as const;
type BillingSection=typeof BILLING_SECTIONS[number];
export const Route = createFileRoute("/_app/billing")({
 validateSearch:(search:Record<string,unknown>)=>({section:BILLING_SECTIONS.includes(search.section as BillingSection)?search.section as BillingSection:"overview"}),
 component: BillingPage,
});

function money(amount: number, currency: string) {
  try { return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 }).format(amount); }
  catch { return `${currency} ${amount.toLocaleString()}`; }
}

function BillingPage() {
  const {section}=Route.useSearch();
  const { isTenantAdmin, subscriptionStatus, tenantName, trialEndsAt } = useAuth();
  const qc = useQueryClient();
  const getCtx = useServerFn(getSaasContext);
  const getPlans=useServerFn(getPricingPlans);
  const {data:publicPlans}=useQuery({queryKey:["pricing-plans"],queryFn:()=>getPlans()});
  const [selectedPlan,setSelectedPlan]=useState("business"),[period,setPeriod]=useState<"monthly"|"annual">("monthly");
  const startPay = useServerFn(startYoUpgrade);
  const checkPay = useServerFn(checkYoUpgrade);
  const startAddonPay = useServerFn(startYoAddonPurchase);
  const checkAddonPay = useServerFn(checkYoAddonPurchase);
  const startSeatPay=useServerFn(startYoSeatPurchase),checkSeatPay=useServerFn(checkYoSeatPurchase);
  const [seatQuantity,setSeatQuantity]=useState(1),[seatTx,setSeatTx]=useState<string|null>(null);
  const startAssetPay=useServerFn(startYoAssetCapacityPurchase),checkAssetPay=useServerFn(checkYoAssetCapacityPurchase);
  const [assetBlocks,setAssetBlocks]=useState(1),[assetTx,setAssetTx]=useState<string|null>(null);
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [transactionId, setTransactionId] = useState<string | null>(null);
  const [addonTransaction, setAddonTransaction] = useState<string | null>(null);
  const [addonKey, setAddonKey] = useState<string | null>(null);

  const { data: ctx, refetch } = useQuery({
    queryKey: ["saas-context"],
    queryFn: async () => getCtx({ headers: await getServerAuthHeaders() }),
  });
  const choice=publicPlans?.plans.find((p:any)=>p.id===selectedPlan);
  const price=Number(choice?(period==="monthly"?choice.monthly_price:choice.annual_price):0);
  const extraUserPrice=ctx?.settings?.extraUserPrice??0;
  const totalSeats=(ctx?.settings?.includedPaidUsers??0)+(ctx?.settings?.purchasedExtraUsers??0);
  const currency = "USD";
  const fxRate=Number(publicPlans?.fxRate??0);
  const [viewCurrency,setViewCurrency]=useState<"USD"|"UGX">("USD");
  const amountLabel=(usd:number)=>viewCurrency==="UGX"&&fxRate>0?
    money(Math.round(usd*fxRate),"UGX"):money(usd,"USD");
  const blockSize=ctx?.settings?.extraAssetBlockSize??2000,blockPrice=ctx?.settings?.extraAssetBlockPrice??20;
  const assetCapacity=(ctx?.settings?.includedAssets??0)+(ctx?.settings?.purchasedExtraAssets??0);
  const trialDays = ctx?.settings?.trialDays ?? null;
  const trialUserLimit = ctx?.settings?.trialUserLimit ?? null;
  const daysLeft = trialEndsAt ? Math.max(0, Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / 86400000)) : null;

  const checkoutPhone = normalizeUgandanMobileMoneyPhone(phone);
  const requireCheckoutPhone = () => {
    if (checkoutPhone) return checkoutPhone;
    toast.error("Enter your complete Uganda mobile-money number, such as 0772 123 456 or +256 772 123 456.");
    document.getElementById("billing-mobile-number")?.focus();
    return null;
  };
  const confirmUgxPayment = (amountUsd: number, purchase: string) => {
    if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
      toast.error("The price of this purchase is not available.");
      return false;
    }
    if (!Number.isFinite(fxRate) || fxRate <= 0) {
      toast.error("A current USD to UGX exchange rate is needed before mobile-money checkout.");
      return false;
    }
    return window.confirm(
      `Confirm ${purchase}: ${money(amountUsd, "USD")} ≈ ${money(Math.round(amountUsd * fxRate), "UGX")} via Ugandan mobile money. The exchange rate and final UGX amount are confirmed when the payment request is created. Check the amount on your phone before approving.`
    );
  };


  const start = async () => {
    if (!isTenantAdmin) return toast.error("Only an admin can upgrade the workspace");
    const normalizedPhone = requireCheckoutPhone();
    if (!normalizedPhone || !confirmUgxPayment(price, selectedPlan + " subscription")) return;
    setBusy(true);
    try {
      const headers = await getServerAuthHeaders();
      const r = await startPay({ data: { phone:normalizedPhone,plan_id:selectedPlan as "starter"|"business"|"enterprise",period }, headers });
      setTransactionId(r.transactionId);
      toast.success("UGX payment request sent. Check the amount on your phone before approving.");
    } catch (e: any) { toast.error(e?.message ?? "Could not start payment"); }
    finally { setBusy(false); }
  };

  const check = async () => {
    if (!transactionId) return;
    setChecking(true);
    try {
      const headers = await getServerAuthHeaders();
      const r = await checkPay({ data: { transaction_id: transactionId }, headers });
      if (r.successful) {
        toast.success("Payment confirmed. Your selected subscription plan is active.");
        await refetch();
        await qc.invalidateQueries({ queryKey: ["saas-context"] });
        window.location.reload();
      } else toast.message(`Payment status: ${r.status || "PENDING"}`);
    } catch (e: any) { toast.error(e?.message ?? "Could not check payment"); }
    finally { setChecking(false); }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div><h1 className="text-xl font-bold tracking-tight sm:text-2xl">Plan & billing</h1>
       <p className="mt-1 text-sm text-muted-foreground">{tenantName || "Workspace"} · Choose a billing task from the sidebar.</p></div>
      <div className="rounded-lg border bg-card px-4 py-3" aria-label="Selected billing task"><p className="text-sm font-semibold text-foreground">{{overview:"Subscription overview",plans:"Choose a package",seats:"Additional users",capacity:"Asset capacity",addons:"Add-ons"}[section]}</p>
       <p className="text-xs text-muted-foreground">{section==="overview"?"Your package and current subscription status.":"Only the relevant options for this billing task are displayed."}</p></div>

      {section!=="overview"&&<Card className="space-y-3 border-[#dbe5e7] bg-[#f6f9f8] p-3 sm:p-4">
        <div>
          <h2 className="text-base font-semibold text-[#29424d]">Pay with Uganda mobile money</h2>
          <p className="mt-1 text-xs text-muted-foreground">Enter the number that will receive your payment request.</p>
        </div>
        <div className="max-w-sm space-y-2">
          <Label htmlFor="billing-mobile-number">Mobile money number</Label>
          <Input id="billing-mobile-number" name="mobile_money_phone" type="tel" inputMode="tel"
            autoComplete="tel" value={phone} onChange={e => setPhone(e.target.value)}
            placeholder="0772 123 456 or +256 772 123 456" aria-invalid={phone.length>0&&!checkoutPhone}
            disabled={!isTenantAdmin || !ctx?.paymentConfigured} />
          <p className="text-xs text-muted-foreground">
            {checkoutPhone ? `Ready to pay using ${checkoutPhone}` :
            "Ugandan numbers starting with 07, 03, or +256 are supported. A complete number is required."}
          </p>
        </div>
        <p className="text-xs leading-5 text-muted-foreground">
          Plan prices are shown in USD, but mobile-money requests are charged in UGX using a verified exchange rate.
          {fxRate>0 ? ` Current reference: 1 USD ≈ ${money(fxRate,"UGX")}.` : " Checkout is unavailable until the current rate can be verified."}
          You will see an estimated UGX amount before sending the payment request.
        </p>
      </Card>}

      {section==="seats"&&<Card className="space-y-4 border-primary/20 p-4">
        <div><h2 className="text-lg font-semibold">Team seats</h2><p className="text-sm text-muted-foreground">Your paid plan includes {ctx?.settings?.includedPaidUsers??"—"} users. Purchased additional seats: {ctx?.settings?.purchasedExtraUsers??0}. Total capacity: {totalSeats}.</p></div>
        <div className="flex flex-wrap items-end gap-3"><div className="space-y-2"><Label>Additional users</Label><Input className="w-28" type="number" min={1} max={100} value={seatQuantity} onChange={e=>setSeatQuantity(Math.max(1,Math.min(100,Number(e.target.value)||1)))}/></div><div className="space-y-1"><p className="text-sm text-muted-foreground">Price per user: {money(extraUserPrice,currency)}</p><p className="text-lg font-semibold">{money(extraUserPrice*seatQuantity,currency)}</p>{fxRate>0&&<p className="text-xs text-muted-foreground">≈ {money(Math.round(extraUserPrice*seatQuantity*fxRate),"UGX")} payable</p>}</div><Button disabled={busy||!isTenantAdmin||subscriptionStatus!=="active"||extraUserPrice<=0||!ctx?.paymentConfigured||!fxRate} onClick={async()=>{const normalizedPhone=requireCheckoutPhone();if(!normalizedPhone||!confirmUgxPayment(extraUserPrice*seatQuantity,seatQuantity+" additional user seat(s)"))return;setBusy(true);try{const result=await startSeatPay({headers:await getServerAuthHeaders(),data:{phone:normalizedPhone,quantity:seatQuantity}});setSeatTx(result.transactionId);toast.success("Payment request sent. Approve on your phone.")}catch(e:any){toast.error(e.message||"Could not purchase seats")}finally{setBusy(false)}}}>Buy extra users</Button>{seatTx&&<Button variant="outline" disabled={checking} onClick={async()=>{setChecking(true);try{const result=await checkSeatPay({headers:await getServerAuthHeaders(),data:{transactionId:seatTx}});if(result.successful){toast.success("Extra user seats activated");setSeatTx(null);await refetch()}else toast.message("Payment: "+result.status)}catch(e:any){toast.error(e.message||"Could not check payment")}finally{setChecking(false)}}}>Check seat payment</Button>}</div>
        <p className="text-xs text-muted-foreground">Paid seats are enabled only after confirmed payment. Then open Users to add team members.</p>
      </Card>}
      {section==="capacity"&&<Card className="space-y-4 p-4"><div><h2 className="text-lg font-semibold">Additional asset capacity</h2><p className="text-sm text-muted-foreground">Current allowance: {assetCapacity.toLocaleString()} assets. Purchased expansion: {(ctx?.settings?.purchasedExtraAssets??0).toLocaleString()} assets. Each block adds {blockSize.toLocaleString()} assets.</p></div><div className="flex flex-wrap items-end gap-3"><div className="space-y-1"><Label>Asset blocks</Label><Input className="w-28" type="number" min={1} max={100} value={assetBlocks} onChange={e=>setAssetBlocks(Math.max(1,Math.min(100,Number(e.target.value)||1)))}/></div><div><p className="text-sm text-muted-foreground">Adds {(assetBlocks*blockSize).toLocaleString()} assets</p><p className="font-bold">{money(assetBlocks*blockPrice,currency)}</p>{fxRate>0&&<p className="text-xs text-muted-foreground">≈ {money(Math.round(assetBlocks*blockPrice*fxRate),"UGX")} payable</p>}</div><Button disabled={busy||!isTenantAdmin||subscriptionStatus!=="active"||blockPrice<=0||!ctx?.paymentConfigured||!fxRate} onClick={async()=>{const normalizedPhone=requireCheckoutPhone();if(!normalizedPhone||!confirmUgxPayment(blockPrice*assetBlocks,assetBlocks+" additional asset block(s)"))return;setBusy(true);try{const r=await startAssetPay({headers:await getServerAuthHeaders(),data:{phone:normalizedPhone,quantity:assetBlocks}});setAssetTx(r.transactionId);toast.success("Payment request sent. Approve on your phone.")}catch(e:any){toast.error(e.message||"Could not start capacity purchase")}finally{setBusy(false)}}}>Buy additional assets</Button>{assetTx&&<Button variant="outline" disabled={checking} onClick={async()=>{setChecking(true);try{const r=await checkAssetPay({headers:await getServerAuthHeaders(),data:{transactionId:assetTx}});if(r.successful){toast.success("Additional asset capacity activated");setAssetTx(null);await refetch()}else toast.message("Payment: "+r.status)}catch(e:any){toast.error(e.message||"Could not check payment")}finally{setChecking(false)}}}>Check asset payment</Button>}</div><p className="text-xs text-muted-foreground">Asset capacity increases only after confirmed payment. Yo Uganda converts USD prices into UGX using a validated exchange rate.</p></Card>}
      {section==="overview"&&<div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-5"><p className="text-xs uppercase tracking-wide text-muted-foreground">Current status</p><div className="mt-2 flex items-center gap-2"><Badge className="capitalize">{subscriptionStatus}</Badge>{subscriptionStatus === "active" && <CheckCircle2 className="h-4 w-4 text-success" />}</div></Card>
        <Card className="p-5"><p className="text-xs uppercase tracking-wide text-muted-foreground">Free trial</p><p className="mt-2 text-xl font-semibold">{trialDays !== null ? `${trialDays} days` : "Loading…"}</p>{subscriptionStatus === "trial" && daysLeft !== null && <p className="mt-1 text-xs text-muted-foreground"><strong>{daysLeft} day(s) remaining</strong>{trialEndsAt ? ` · ends ${new Date(trialEndsAt).toLocaleDateString()}` : ""}</p>}</Card>
        <Card className="p-5"><p className="text-xs uppercase tracking-wide text-muted-foreground">Your active package</p><p className="mt-2 text-xl font-semibold capitalize">{ctx?.tenant?.planCode??"Trial"}</p><p className="mt-1 text-xs text-muted-foreground">Your package includes the features shown in your account.</p></Card>
      </div>}

      {section==="plans"&&<Card className="space-y-4 p-4"><div><h2 className="text-lg font-semibold">Choose your paid package</h2><p className="text-sm text-muted-foreground">The package you select controls user limits, asset capacity and available modules. The free trial remains separate.</p></div><div className="flex flex-wrap gap-2">{(publicPlans?.plans??[]).map((p:any)=><Button key={p.id} variant={selectedPlan===p.id?"default":"outline"} onClick={()=>setSelectedPlan(p.id)}>{p.name}</Button>)}</div><div className="flex gap-2"><Button size="sm" variant={period==="monthly"?"secondary":"outline"} onClick={()=>setPeriod("monthly")}>Monthly</Button><Button size="sm" variant={period==="annual"?"secondary":"outline"} onClick={()=>setPeriod("annual")}>Annual</Button></div><label className="flex items-center gap-2 text-sm">Display currency <select value={viewCurrency} onChange={e=>setViewCurrency(e.target.value as "USD"|"UGX")} className="rounded-md border bg-background px-2 py-1"><option value="USD">USD</option><option value="UGX" disabled={!fxRate}>UGX</option></select></label><p className="text-xs text-muted-foreground">{fxRate>0?"Estimated at "+Math.round(fxRate).toLocaleString()+" UGX per USD":"Currency conversion is unavailable; UGX checkout is disabled."}</p><p className="text-xl font-bold">{choice?amountLabel(price):"Select a package"} <span className="text-xs font-normal text-muted-foreground">/{period==="monthly"?"month":"year"}</span></p>{choice&&fxRate>0&&<p className="text-sm font-semibold text-[#315565]">Mobile money: approximately {money(Math.round(price*fxRate),"UGX")}</p>}<p className="text-xs text-muted-foreground">Plans are priced in USD. Yo Uganda converts USD into UGX using a recent reference rate. The final amount is presented before you approve the mobile-money payment. Only confirmed payments activate a package.</p></Card>}
      {section==="addons"&&<Card id="addons" className="p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Add-ons</h2>
            <p className="text-sm text-muted-foreground">Available separately.</p>
          </div>
          <PlugZap className="h-5 w-5 text-primary" />
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {(ctx?.addOns ?? []).map((addon: any) => {
            const enabled = Boolean(ctx?.enabledModules?.includes(addon.key));
            const pending = addonTransaction && addonKey === addon.key;
            return (
              <div key={addon.key} className="rounded-xl border p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold">{addon.name}</p>
                  <Badge variant={enabled ? "secondary" : "outline"}>{enabled ? "Active" : fxRate>0 ? `≈ ${money(Math.round(Number(addon.price)*fxRate),"UGX")}` : money(addon.price, addon.currency)}</Badge>
                </div>
                {!enabled && (
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      disabled={busy || !isTenantAdmin || !ctx.paymentConfigured || addon.price <= 0 || !fxRate}
                      onClick={async () => {
                        const normalizedPhone=requireCheckoutPhone();
                        if(!normalizedPhone || !confirmUgxPayment(Number(addon.price), addon.name+" add-on"))return;
                        setBusy(true);
                        try {
                          const headers = await getServerAuthHeaders();
                          const r = await startAddonPay({ data: { module_key: addon.key, phone:normalizedPhone }, headers });
                          setAddonTransaction(r.transactionId);
                          setAddonKey(addon.key);
                          toast.success("Payment prompt sent.");
                        } catch (e: any) {
                          toast.error(e?.message ?? "Could not start payment");
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      {busy && addonKey === addon.key ? "Sending…" : "Pay & activate"}
                    </Button>
                    {pending && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={checking}
                        onClick={async () => {
                          setChecking(true);
                          try {
                            const headers = await getServerAuthHeaders();
                            const r = await checkAddonPay({ data: { transaction_id: addonTransaction }, headers });
                            if (r.successful) {
                              toast.success("Add-on activated.");
                              setAddonTransaction(null);
                              setAddonKey(null);
                              await refetch();
                              await qc.invalidateQueries({ queryKey: ["saas-context"] });
                            } else {
                              toast.message("Payment: " + (r.status || "PENDING"));
                            }
                          } catch (e: any) {
                            toast.error(e?.message ?? "Could not check payment");
                          } finally {
                            setChecking(false);
                          }
                        }}
                      >
                        {checking ? "Checking…" : "Check payment"}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>


      </Card>}

      {section==="plans"&&(subscriptionStatus === "active" ? (
        <Card className="p-6"><div className="flex items-start gap-3"><CheckCircle2 className="mt-0.5 h-5 w-5 text-success" /><div><h2 className="font-semibold">Paid plan active</h2><p className="mt-1 text-sm text-muted-foreground">Paid features, report exports and custom-domain connection are enabled.</p></div></div></Card>
      ) : (
        <Card className="space-y-5 p-6">
          <div className="flex items-start gap-3"><CreditCard className="mt-0.5 h-5 w-5 text-primary" /><div><h2 className="font-semibold">Upgrade with Mobile Money</h2><p className="mt-1 text-sm text-muted-foreground">A payment prompt will be sent to the mobile-money number below. No email delivery is required.</p></div></div>
          {!isTenantAdmin && <div className="flex gap-2 rounded-lg border bg-muted/40 p-3 text-sm"><LockKeyhole className="h-4 w-4" />Only an admin can start an upgrade.</div>}
          {ctx && !ctx.paymentConfigured && <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">Payment credentials have not been added to this deployment yet. The upgrade flow is ready and credentials are supplied securely on the server.</div>}
          <p className="text-xs text-muted-foreground">The mobile-money number and the UGX conversion appear at the top of this billing page.</p>
          <div className="flex flex-wrap gap-2"><Button onClick={start} disabled={busy || !isTenantAdmin || !ctx?.paymentConfigured || price <= 0 || !fxRate}>{busy ? "Sending prompt…" : `Pay ${price > 0 && fxRate>0 ? money(Math.round(price*fxRate), "UGX") : "with mobile money"}`}</Button>{transactionId && <Button variant="outline" onClick={check} disabled={checking}><Clock className="mr-2 h-4 w-4" />{checking ? "Checking…" : "Check payment status"}</Button>}</div>
        </Card>
      ))}

      {section==="overview"&&<Card className="p-4 text-sm text-muted-foreground"><strong className="text-foreground">Trial:</strong> {trialDays !== null ? trialDays + " days" : "configured period"}{trialUserLimit !== null ? " · " + trialUserLimit + " users" : ""}</Card>}
    </div>
  );
}
