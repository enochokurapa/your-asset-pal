import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/use-auth";
import { getSaasContext, startYoUpgrade, checkYoUpgrade } from "@/lib/saas.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { CreditCard, CheckCircle2, Clock, LockKeyhole } from "lucide-react";

export const Route = createFileRoute("/_app/billing")({ component: BillingPage });

function money(amount: number, currency: string) {
  try { return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 }).format(amount); }
  catch { return `${currency} ${amount.toLocaleString()}`; }
}

function BillingPage() {
  const { isTenantAdmin, subscriptionStatus, tenantName, trialEndsAt } = useAuth();
  const qc = useQueryClient();
  const getCtx = useServerFn(getSaasContext);
  const startPay = useServerFn(startYoUpgrade);
  const checkPay = useServerFn(checkYoUpgrade);
  const [phone, setPhone] = useState("256");
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [transactionId, setTransactionId] = useState<string | null>(null);

  const { data: ctx, refetch } = useQuery({ queryKey: ["saas-context"], queryFn: () => getCtx() });
  const price = ctx?.settings?.paidPrice ?? 0;
  const currency = ctx?.settings?.currency ?? "UGX";
  const daysLeft = trialEndsAt ? Math.max(0, Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / 86400000)) : null;

  const start = async () => {
    if (!isTenantAdmin) return toast.error("Only a tenant administrator can upgrade the workspace");
    setBusy(true);
    try {
      const r = await startPay({ data: { phone } });
      setTransactionId(r.transactionId);
      toast.success("Payment request sent. Approve the prompt on your phone.");
    } catch (e: any) { toast.error(e?.message ?? "Could not start payment"); }
    finally { setBusy(false); }
  };

  const check = async () => {
    if (!transactionId) return;
    setChecking(true);
    try {
      const r = await checkPay({ data: { transaction_id: transactionId } });
      if (r.successful) {
        toast.success("Payment confirmed. Your workspace is now on the paid plan.");
        await refetch();
        await qc.invalidateQueries({ queryKey: ["saas-context"] });
        window.location.reload();
      } else toast.message(`Payment status: ${r.status || "PENDING"}`);
    } catch (e: any) { toast.error(e?.message ?? "Could not check payment"); }
    finally { setChecking(false); }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Plan & billing</h1>
        <p className="text-sm text-muted-foreground">Manage the subscription for {tenantName || "this workspace"}.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-5"><p className="text-xs uppercase tracking-wide text-muted-foreground">Current status</p><div className="mt-2 flex items-center gap-2"><Badge className="capitalize">{subscriptionStatus}</Badge>{subscriptionStatus === "active" && <CheckCircle2 className="h-4 w-4 text-success" />}</div></Card>
        <Card className="p-5"><p className="text-xs uppercase tracking-wide text-muted-foreground">Free trial</p><p className="mt-2 text-xl font-semibold">4 weeks</p>{subscriptionStatus === "trial" && daysLeft !== null && <p className="mt-1 text-xs text-muted-foreground">{daysLeft} day(s) remaining</p>}</Card>
        <Card className="p-5"><p className="text-xs uppercase tracking-wide text-muted-foreground">Paid plan</p><p className="mt-2 text-xl font-semibold">{price > 0 ? money(price, currency) : "Price not set"}</p><p className="mt-1 text-xs text-muted-foreground">Price is controlled by the SaaS administrator.</p></Card>
      </div>

      {subscriptionStatus === "active" ? (
        <Card className="p-6"><div className="flex items-start gap-3"><CheckCircle2 className="mt-0.5 h-5 w-5 text-success" /><div><h2 className="font-semibold">Paid plan active</h2><p className="mt-1 text-sm text-muted-foreground">Report exports and custom-domain connection are enabled.</p></div></div></Card>
      ) : (
        <Card className="space-y-5 p-6">
          <div className="flex items-start gap-3"><CreditCard className="mt-0.5 h-5 w-5 text-primary" /><div><h2 className="font-semibold">Upgrade with Yo! Payments Uganda</h2><p className="mt-1 text-sm text-muted-foreground">A mobile-money payment prompt will be sent to the number below. No email delivery is required.</p></div></div>
          {!isTenantAdmin && <div className="flex gap-2 rounded-lg border bg-muted/40 p-3 text-sm"><LockKeyhole className="h-4 w-4" />Only a tenant administrator can start an upgrade.</div>}
          {ctx && !ctx.paymentConfigured && <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">Yo! Payments credentials have not been added to this deployment yet. The upgrade flow is ready; the API username/password will be supplied through server environment variables at deployment.</div>}
          <div className="max-w-md space-y-2"><Label>Mobile money number</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="2567XXXXXXXX" disabled={!isTenantAdmin || !ctx?.paymentConfigured} /><p className="text-xs text-muted-foreground">Use international format, for example 2567XXXXXXXX.</p></div>
          <div className="flex flex-wrap gap-2"><Button onClick={start} disabled={busy || !isTenantAdmin || !ctx?.paymentConfigured || price <= 0}>{busy ? "Sending prompt…" : `Pay ${price > 0 ? money(price, currency) : "configured price"}`}</Button>{transactionId && <Button variant="outline" onClick={check} disabled={checking}><Clock className="mr-2 h-4 w-4" />{checking ? "Checking…" : "Check payment status"}</Button>}</div>
        </Card>
      )}

      <Card className="p-5 text-sm text-muted-foreground"><strong className="text-foreground">Trial policy:</strong> up to 4 active users for 4 weeks. Assets and Settings remain available according to module access. Reports can be viewed during trial, but the built-in PDF/Excel export is a paid feature.</Card>
    </div>
  );
}
