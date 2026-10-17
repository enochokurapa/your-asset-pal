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
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { CreditCard, CheckCircle2, Clock, LockKeyhole, PlugZap, Radar } from "lucide-react";

export const Route = createFileRoute("/_app/billing")({ component: BillingPage });

function money(amount: number, currency: string) {
  try { return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 }).format(amount); }
  catch { return `${currency} ${amount.toLocaleString()}`; }
}

function BillingPage() {
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
  const [phone, setPhone] = useState("256");
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
  const currency = ctx?.settings?.currency ?? "UGX";
  const blockSize=ctx?.settings?.extraAssetBlockSize??2000,blockPrice=ctx?.settings?.extraAssetBlockPrice??20;
  const assetCapacity=(ctx?.settings?.includedAssets??0)+(ctx?.settings?.purchasedExtraAssets??0);
  const trialDays = ctx?.settings?.trialDays ?? null;
  const trialUserLimit = ctx?.settings?.trialUserLimit ?? null;
  const daysLeft = trialEndsAt ? Math.max(0, Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / 86400000)) : null;

  const start = async () => {
    if (!isTenantAdmin) return toast.error("Only an admin can upgrade the workspace");
    setBusy(true);
    try {
      const headers = await getServerAuthHeaders();
      const r = await startPay({ data: { phone,plan_id:selectedPlan as "starter"|"business"|"enterprise",period }, headers });
      setTransactionId(r.transactionId);
      toast.success("Payment request sent. Approve the prompt on your phone.");
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
    <div className="mx-auto max-w-4xl space-y-6">
      <div><h1 className="text-2xl font-bold tracking-tight">Plan & billing</h1><p className="text-sm text-muted-foreground">Manage the subscription for {tenantName || "this workspace"}.</p></div>

      <Card className="space-y-4 border-primary/20 p-5">
        <div><h2 className="text-lg font-semibold">Team seats</h2><p className="text-sm text-muted-foreground">Your paid plan includes {ctx?.settings?.includedPaidUsers??"—"} users. Purchased additional seats: {ctx?.settings?.purchasedExtraUsers??0}. Total capacity: {totalSeats}.</p></div>
        <div className="flex flex-wrap items-end gap-3"><div className="space-y-2"><Label>Additional users</Label><Input className="w-28" type="number" min={1} max={100} value={seatQuantity} onChange={e=>setSeatQuantity(Math.max(1,Math.min(100,Number(e.target.value)||1)))}/></div><div className="space-y-1"><p className="text-sm text-muted-foreground">Price per user: {money(extraUserPrice,currency)}</p><p className="text-lg font-semibold">{money(extraUserPrice*seatQuantity,currency)}</p></div><Button disabled={busy||!isTenantAdmin||subscriptionStatus!=="active"||extraUserPrice<=0||!ctx?.paymentConfigured} onClick={async()=>{setBusy(true);try{const result=await startSeatPay({headers:await getServerAuthHeaders(),data:{phone,quantity:seatQuantity}});setSeatTx(result.transactionId);toast.success("Payment request sent. Approve on your phone.")}catch(e:any){toast.error(e.message||"Could not purchase seats")}finally{setBusy(false)}}}>Buy extra users</Button>{seatTx&&<Button variant="outline" disabled={checking} onClick={async()=>{setChecking(true);try{const result=await checkSeatPay({headers:await getServerAuthHeaders(),data:{transactionId:seatTx}});if(result.successful){toast.success("Extra user seats activated");setSeatTx(null);await refetch()}else toast.message("Payment: "+result.status)}catch(e:any){toast.error(e.message||"Could not check payment")}finally{setChecking(false)}}}>Check seat payment</Button>}</div>
        <p className="text-xs text-muted-foreground">Paid seats are enabled only after confirmed payment. Then open Users to add team members.</p>
      </Card>
      <Card className="space-y-4 p-5"><div><h2 className="text-lg font-semibold">Additional asset capacity</h2><p className="text-sm text-muted-foreground">Current allowance: {assetCapacity.toLocaleString()} assets. Purchased expansion: {(ctx?.settings?.purchasedExtraAssets??0).toLocaleString()} assets. Each block adds {blockSize.toLocaleString()} assets.</p></div><div className="flex flex-wrap items-end gap-3"><div className="space-y-1"><Label>Asset blocks</Label><Input className="w-28" type="number" min={1} max={100} value={assetBlocks} onChange={e=>setAssetBlocks(Math.max(1,Math.min(100,Number(e.target.value)||1)))}/></div><div><p className="text-sm text-muted-foreground">Adds {(assetBlocks*blockSize).toLocaleString()} assets</p><p className="font-bold">{money(assetBlocks*blockPrice,currency)}</p></div><Button disabled={busy||!isTenantAdmin||subscriptionStatus!=="active"||blockPrice<=0||!ctx?.paymentConfigured} onClick={async()=>{setBusy(true);try{const r=await startAssetPay({headers:await getServerAuthHeaders(),data:{phone,quantity:assetBlocks}});setAssetTx(r.transactionId);toast.success("Payment request sent. Approve on your phone.")}catch(e:any){toast.error(e.message||"Could not start capacity purchase")}finally{setBusy(false)}}}>Buy additional assets</Button>{assetTx&&<Button variant="outline" disabled={checking} onClick={async()=>{setChecking(true);try{const r=await checkAssetPay({headers:await getServerAuthHeaders(),data:{transactionId:assetTx}});if(r.successful){toast.success("Additional asset capacity activated");setAssetTx(null);await refetch()}else toast.message("Payment: "+r.status)}catch(e:any){toast.error(e.message||"Could not check payment")}finally{setChecking(false)}}}>Check asset payment</Button>}</div><p className="text-xs text-muted-foreground">Asset capacity increases only after confirmed payment. Mobile money checkout currently requires UGX prices.</p></Card>
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-5"><p className="text-xs uppercase tracking-wide text-muted-foreground">Current status</p><div className="mt-2 flex items-center gap-2"><Badge className="capitalize">{subscriptionStatus}</Badge>{subscriptionStatus === "active" && <CheckCircle2 className="h-4 w-4 text-success" />}</div></Card>
        <Card className="p-5"><p className="text-xs uppercase tracking-wide text-muted-foreground">Free trial</p><p className="mt-2 text-xl font-semibold">{trialDays !== null ? `${trialDays} days` : "Loading…"}</p>{subscriptionStatus === "trial" && daysLeft !== null && <p className="mt-1 text-xs text-muted-foreground"><strong>{daysLeft} day(s) remaining</strong>{trialEndsAt ? ` · ends ${new Date(trialEndsAt).toLocaleDateString()}` : ""}</p>}</Card>
        <Card className="p-5"><p className="text-xs uppercase tracking-wide text-muted-foreground">Your active package</p><p className="mt-2 text-xl font-semibold capitalize">{ctx?.tenant?.planCode??"Trial"}</p><p className="mt-1 text-xs text-muted-foreground">Your package includes the features shown in your account.</p></Card>
      </div>

      <Card className="space-y-4 p-5"><div><h2 className="text-lg font-semibold">Choose your paid package</h2><p className="text-sm text-muted-foreground">The package you select controls user limits, asset capacity and available modules. The free trial remains separate.</p></div><div className="flex flex-wrap gap-2">{(publicPlans?.plans??[]).map((p:any)=><Button key={p.id} variant={selectedPlan===p.id?"default":"outline"} onClick={()=>setSelectedPlan(p.id)}>{p.name}</Button>)}</div><div className="flex gap-2"><Button size="sm" variant={period==="monthly"?"secondary":"outline"} onClick={()=>setPeriod("monthly")}>Monthly</Button><Button size="sm" variant={period==="annual"?"secondary":"outline"} onClick={()=>setPeriod("annual")}>Annual</Button></div><p className="text-xl font-bold">{choice?money(price,currency):"Select a package"} <span className="text-xs font-normal text-muted-foreground">/{period==="monthly"?"month":"year"}</span></p><p className="text-xs text-muted-foreground">Mobile-money payments require matching UGX pricing. Only a confirmed payment activates the package.</p></Card>
      <Card id="addons" className="p-6">
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
                  <Badge variant={enabled ? "secondary" : "outline"}>{enabled ? "Active" : money(addon.price, addon.currency)}</Badge>
                </div>
                {!enabled && (
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      disabled={busy || !isTenantAdmin || !ctx.paymentConfigured || addon.price <= 0}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          const headers = await getServerAuthHeaders();
                          const r = await startAddonPay({ data: { module_key: addon.key, phone }, headers });
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

        {(ctx?.addOns ?? []).some((a: any) => a.available && a.price > 0) && (
          <div className="mt-4 flex max-w-sm items-center gap-2">
            <Label className="shrink-0">Mobile money</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="2567XXXXXXXX" disabled={!isTenantAdmin || !ctx?.paymentConfigured} />
          </div>
        )}
      </Card>

      {subscriptionStatus === "active" ? (
        <Card className="p-6"><div className="flex items-start gap-3"><CheckCircle2 className="mt-0.5 h-5 w-5 text-success" /><div><h2 className="font-semibold">Paid plan active</h2><p className="mt-1 text-sm text-muted-foreground">Paid features, report exports and custom-domain connection are enabled.</p></div></div></Card>
      ) : (
        <Card className="space-y-5 p-6">
          <div className="flex items-start gap-3"><CreditCard className="mt-0.5 h-5 w-5 text-primary" /><div><h2 className="font-semibold">Upgrade with Mobile Money</h2><p className="mt-1 text-sm text-muted-foreground">A payment prompt will be sent to the mobile-money number below. No email delivery is required.</p></div></div>
          {!isTenantAdmin && <div className="flex gap-2 rounded-lg border bg-muted/40 p-3 text-sm"><LockKeyhole className="h-4 w-4" />Only an admin can start an upgrade.</div>}
          {ctx && !ctx.paymentConfigured && <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">Payment credentials have not been added to this deployment yet. The upgrade flow is ready and credentials are supplied securely on the server.</div>}
          <div className="max-w-md space-y-2"><Label>Mobile money number</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="2567XXXXXXXX" disabled={!isTenantAdmin || !ctx?.paymentConfigured} /><p className="text-xs text-muted-foreground">Use international format, for example 2567XXXXXXXX.</p></div>
          <div className="flex flex-wrap gap-2"><Button onClick={start} disabled={busy || !isTenantAdmin || !ctx?.paymentConfigured || price <= 0}>{busy ? "Sending prompt…" : `Pay ${price > 0 ? money(price, currency) : "configured price"}`}</Button>{transactionId && <Button variant="outline" onClick={check} disabled={checking}><Clock className="mr-2 h-4 w-4" />{checking ? "Checking…" : "Check payment status"}</Button>}</div>
        </Card>
      )}

      <Card className="p-5 text-sm text-muted-foreground"><strong className="text-foreground">Trial:</strong> {trialDays !== null ? trialDays + " days" : "configured period"}{trialUserLimit !== null ? " · " + trialUserLimit + " users" : ""}</Card>
    </div>
  );
}
