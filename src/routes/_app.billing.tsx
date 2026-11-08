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
  checkYoAddonPurchase,getTenantPaymentHistory,
  startYoSeatPurchase,checkYoSeatPurchase,startYoAssetCapacityPurchase,checkYoAssetCapacityPurchase,
} from "@/lib/saas.functions";
import { getServerAuthHeaders } from "@/lib/auth-headers";
import { normalizeUgandanMobileMoneyPhone } from "@/lib/uganda-mobile-money";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { CreditCard, CheckCircle2, Clock, LockKeyhole, PlugZap, Radar } from "lucide-react";

const BILLING_SECTIONS=["overview","plans","seats","capacity","addons","history"] as const;
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
  const getHistory=useServerFn(getTenantPaymentHistory);
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
  const [paymentStep,setPaymentStep]=useState<"phone"|"processing"|"sent">("phone");
  const [paymentRequest,setPaymentRequest]=useState<{name:string;usd:number;submit:(phone:string)=>Promise<void>}|null>(null);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [transactionId, setTransactionId] = useState<string | null>(null);
  const [addonTransaction, setAddonTransaction] = useState<string | null>(null);
  const [addonKey, setAddonKey] = useState<string | null>(null);

  const {data:paymentHistory=[],isLoading:historyLoading}=useQuery({
    queryKey:["tenant-payment-history"],queryFn:async()=>getHistory({headers:await getServerAuthHeaders()}),
    enabled:section==="history"&&isTenantAdmin,
  });
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

  const checkoutPhone=normalizeUgandanMobileMoneyPhone(phone);
  const requestPayment=(name:string,usd:number,submit:(normalizedPhone:string)=>Promise<void>)=>{
    if(!isTenantAdmin){toast.error("Only an administrator can purchase billing items.");return;}
    if(!ctx?.paymentConfigured||!fxRate||!Number.isFinite(usd)||usd<=0){toast.error("Checkout is not available for this item.");return;}
    setPaymentStep("phone");setPaymentRequest({name,usd,submit});
  };
  const submitPayment=async()=>{
    if(!paymentRequest||paymentStep!=="phone")return;
    const number=normalizeUgandanMobileMoneyPhone(phone);
    if(!number){toast.error("Enter a valid Uganda mobile-money number.");return;}
    setPaymentStep("processing");
    try{await paymentRequest.submit(number);setPaymentStep("sent");}
    catch(e:any){toast.error(e?.message||"Could not send payment request");setPaymentStep("phone");}
  };

  const start = async (normalizedPhone:string) => {
    setBusy(true);
    try {
      const headers = await getServerAuthHeaders();
      const r = await startPay({ data: { phone:normalizedPhone,plan_id:selectedPlan as "starter"|"business"|"enterprise",period }, headers });
      setTransactionId(r.transactionId);
      toast.success("UGX payment request sent. Check the amount on your phone before approving.");
    } catch (e: any) { throw e; }
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
      <div><h1 className="text-xl font-bold tracking-tight sm:text-2xl">{section==="history"?"Payments & receipts":section==="addons"?"Add-ons":"Subscription & billing"}</h1>
       <p className="mt-1 text-xs text-muted-foreground">{tenantName || "Workspace"}</p></div>


      {section==="history"&&<Card className="space-y-3 p-4"><div><h2 className="font-semibold">Payment history</h2><p className="text-xs text-muted-foreground">Recorded transactions from your workspace. A payment record is not a tax invoice.</p></div>
       {historyLoading?<p className="text-sm">Loading payments…</p>:!paymentHistory.length?<p className="text-sm text-muted-foreground">No payments recorded yet.</p>:
       <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b bg-muted/30"><tr><th className="px-3 py-2">Date</th><th className="px-3 py-2">Purchase</th><th className="px-3 py-2">Amount</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Reference</th></tr></thead><tbody>
       {paymentHistory.map((tx:any)=><tr key={tx.id} className="border-b"><td className="whitespace-nowrap px-3 py-3">{new Date(tx.created_at).toLocaleDateString()}</td><td className="px-3 py-3">{tx.type}</td><td className="whitespace-nowrap px-3 py-3">{money(Number(tx.amount),tx.currency||"UGX")}</td><td className="px-3 py-3 capitalize">{tx.status}</td><td className="px-3 py-3 font-mono text-xs">{tx.provider_reference||"—"}</td></tr>)}
       </tbody></table></div>}
       <p className="text-xs text-muted-foreground">Formal invoices, where issued, should use the business's approved invoicing process. This page does not manufacture invoice numbers or tax documents.</p>
      </Card>}
      {section==="seats"&&<Card className="space-y-4 border-primary/20 p-4">
        <div><h2 className="text-lg font-semibold">Team seats</h2><p className="text-xs text-muted-foreground">Available seats: {totalSeats}</p></div>
        <div className="flex flex-wrap items-end gap-3"><div className="space-y-2"><Label>Additional users</Label><Input className="w-28" type="number" min={1} max={100} value={seatQuantity} onChange={e=>setSeatQuantity(Math.max(1,Math.min(100,Number(e.target.value)||1)))}/></div><div className="space-y-1"><p className="text-lg font-semibold">{money(extraUserPrice*seatQuantity,currency)}</p>{fxRate>0&&<p className="text-xs text-muted-foreground">≈ {money(Math.round(extraUserPrice*seatQuantity*fxRate),"UGX")} payable</p>}</div><Button disabled={busy||!isTenantAdmin||subscriptionStatus!=="active"||extraUserPrice<=0||!ctx?.paymentConfigured||!fxRate} onClick={()=>requestPayment(seatQuantity+" additional user seat(s)",extraUserPrice*seatQuantity,async normalizedPhone=>{setBusy(true);try{const result=await startSeatPay({headers:await getServerAuthHeaders(),data:{phone:normalizedPhone,quantity:seatQuantity}});setSeatTx(result.transactionId);toast.success("Payment request sent. Approve on your phone.")}catch(e:any){throw e}finally{setBusy(false)}})}>Buy extra users</Button>{seatTx&&<Button variant="outline" disabled={checking} onClick={async()=>{setChecking(true);try{const result=await checkSeatPay({headers:await getServerAuthHeaders(),data:{transactionId:seatTx}});if(result.successful){toast.success("Extra user seats activated");setSeatTx(null);await refetch()}else toast.message("Payment: "+result.status)}catch(e:any){toast.error(e.message||"Could not check payment")}finally{setChecking(false)}}}>Check seat payment</Button>}</div>

      </Card>}
      {section==="capacity"&&<Card className="space-y-4 p-4"><div><h2 className="text-lg font-semibold">Additional asset capacity</h2><p className="text-xs text-muted-foreground">Current capacity: {assetCapacity.toLocaleString()} assets</p></div><div className="flex flex-wrap items-end gap-3"><div className="space-y-1"><Label>Asset blocks</Label><Input className="w-28" type="number" min={1} max={100} value={assetBlocks} onChange={e=>setAssetBlocks(Math.max(1,Math.min(100,Number(e.target.value)||1)))}/></div><div><p className="text-sm text-muted-foreground">Adds {(assetBlocks*blockSize).toLocaleString()} assets</p><p className="font-bold">{money(assetBlocks*blockPrice,currency)}</p>{fxRate>0&&<p className="text-xs text-muted-foreground">≈ {money(Math.round(assetBlocks*blockPrice*fxRate),"UGX")} payable</p>}</div><Button disabled={busy||!isTenantAdmin||subscriptionStatus!=="active"||blockPrice<=0||!ctx?.paymentConfigured||!fxRate} onClick={()=>requestPayment(assetBlocks+" additional asset block(s)",blockPrice*assetBlocks,async normalizedPhone=>{setBusy(true);try{const r=await startAssetPay({headers:await getServerAuthHeaders(),data:{phone:normalizedPhone,quantity:assetBlocks}});setAssetTx(r.transactionId);toast.success("Payment request sent. Approve on your phone.")}catch(e:any){throw e}finally{setBusy(false)}})}>Buy additional assets</Button>{assetTx&&<Button variant="outline" disabled={checking} onClick={async()=>{setChecking(true);try{const r=await checkAssetPay({headers:await getServerAuthHeaders(),data:{transactionId:assetTx}});if(r.successful){toast.success("Additional asset capacity activated");setAssetTx(null);await refetch()}else toast.message("Payment: "+r.status)}catch(e:any){toast.error(e.message||"Could not check payment")}finally{setChecking(false)}}}>Check asset payment</Button>}</div></Card>}
      {section==="overview"&&<div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-5"><p className="text-xs uppercase tracking-wide text-muted-foreground">Current status</p><div className="mt-2 flex items-center gap-2"><Badge className="capitalize">{subscriptionStatus}</Badge>{subscriptionStatus === "active" && <CheckCircle2 className="h-4 w-4 text-success" />}</div></Card>
        <Card className="p-5"><p className="text-xs uppercase tracking-wide text-muted-foreground">Free trial</p><p className="mt-2 text-xl font-semibold">{trialDays !== null ? `${trialDays} days` : "Loading…"}</p>{subscriptionStatus === "trial" && daysLeft !== null && <p className="mt-1 text-xs text-muted-foreground"><strong>{daysLeft} day(s) remaining</strong>{trialEndsAt ? ` · ends ${new Date(trialEndsAt).toLocaleDateString()}` : ""}</p>}</Card>
        <Card className="p-5"><p className="text-xs uppercase tracking-wide text-muted-foreground">Your active package</p><p className="mt-2 text-xl font-semibold capitalize">{ctx?.tenant?.planCode??"Trial"}</p><p className="mt-1 text-xs text-muted-foreground">Your package includes the features shown in your account.</p></Card>
      </div>}

      {section==="plans"&&<Card className="space-y-4 p-4"><div><h2 className="text-lg font-semibold">Choose your paid package</h2></div><div className="flex flex-wrap gap-2">{(publicPlans?.plans??[]).map((p:any)=><Button key={p.id} variant={selectedPlan===p.id?"default":"outline"} onClick={()=>setSelectedPlan(p.id)}>{p.name}</Button>)}</div><div className="flex gap-2"><Button size="sm" variant={period==="monthly"?"secondary":"outline"} onClick={()=>setPeriod("monthly")}>Monthly</Button><Button size="sm" variant={period==="annual"?"secondary":"outline"} onClick={()=>setPeriod("annual")}>Annual</Button></div><label className="flex items-center gap-2 text-sm">Display currency <select value={viewCurrency} onChange={e=>setViewCurrency(e.target.value as "USD"|"UGX")} className="rounded-md border bg-background px-2 py-1"><option value="USD">USD</option><option value="UGX" disabled={!fxRate}>UGX</option></select></label><p className="text-xl font-bold">{choice?amountLabel(price):"Select a package"} <span className="text-xs font-normal text-muted-foreground">/{period==="monthly"?"month":"year"}</span></p>{choice&&fxRate>0&&<p className="text-sm font-semibold text-[#315565]">Mobile money: approximately {money(Math.round(price*fxRate),"UGX")}</p>}</Card>}
      {section==="addons"&&<Card id="addons" className="p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Add-ons</h2>

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
                      onClick={()=>requestPayment(addon.name+" add-on",Number(addon.price),async normalizedPhone=>{
                        setBusy(true);
                        try {
                          const headers = await getServerAuthHeaders();
                          const r = await startAddonPay({ data: { module_key: addon.key, phone:normalizedPhone }, headers });
                          setAddonTransaction(r.transactionId);
                          setAddonKey(addon.key);
                          toast.success("Payment prompt sent.");
                        } catch (e: any) {
                          throw e;
                        } finally {
                          setBusy(false);
                        }
                      })}
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
          <div className="flex items-start gap-3"><CreditCard className="mt-0.5 h-5 w-5 text-primary" /><div><h2 className="font-semibold">Upgrade with Mobile Money</h2></div></div>
          {!isTenantAdmin && <div className="flex gap-2 rounded-lg border bg-muted/40 p-3 text-sm"><LockKeyhole className="h-4 w-4" />Only an admin can start an upgrade.</div>}
          {ctx && !ctx.paymentConfigured && <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">Payment credentials have not been added to this deployment yet. The upgrade flow is ready and credentials are supplied securely on the server.</div>}

          <div className="flex flex-wrap gap-2"><Button onClick={()=>requestPayment(selectedPlan+" subscription",price,start)} disabled={busy || !isTenantAdmin || !ctx?.paymentConfigured || price <= 0 || !fxRate}>{busy ? "Sending prompt…" : `Pay ${price > 0 && fxRate>0 ? money(Math.round(price*fxRate), "UGX") : "with mobile money"}`}</Button>{transactionId && <Button variant="outline" onClick={check} disabled={checking}><Clock className="mr-2 h-4 w-4" />{checking ? "Checking…" : "Check payment status"}</Button>}</div>
        </Card>
      ))}

      {section==="overview"&&<Card className="p-4 text-sm text-muted-foreground"><strong className="text-foreground">Trial:</strong> {trialDays !== null ? trialDays + " days" : "configured period"}{trialUserLimit !== null ? " · " + trialUserLimit + " users" : ""}</Card>}
      <Dialog open={Boolean(paymentRequest)} onOpenChange={open=>{if(!open&&paymentStep!=="processing")setPaymentRequest(null)}}>
        <DialogContent className="w-[calc(100vw-32px)] max-w-sm rounded-xl p-5">
          <DialogHeader><DialogTitle>{paymentStep==="sent"?"Payment request sent":"Mobile money checkout"}</DialogTitle>
            <DialogDescription>{paymentRequest?.name}</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <p className="text-xl font-bold">{paymentRequest&&fxRate>0?money(Math.round(paymentRequest.usd*fxRate),"UGX"):"Unavailable"}</p>
            {paymentStep==="phone"&&<div className="space-y-1.5"><Label htmlFor="billing-mobile-number">Mobile money number</Label>
              <Input id="billing-mobile-number" type="tel" inputMode="tel" autoComplete="tel" autoFocus value={phone} onChange={e=>setPhone(e.target.value)} placeholder="0772 123 456"/>
            </div>}
            {paymentStep==="processing"&&<p role="status" className="text-sm">Sending payment request…</p>}
            {paymentStep==="sent"&&<p role="status" className="text-sm">Approve the payment on your phone using your mobile-money provider's secure prompt. Never enter your PIN on this website.</p>}
          </div>
          <DialogFooter>
            {paymentStep==="phone"?<Button onClick={submitPayment} disabled={!checkoutPhone||busy}>Send payment request</Button>
             :paymentStep==="sent"?<Button onClick={()=>setPaymentRequest(null)}>Done</Button>:<Button disabled>Processing…</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
