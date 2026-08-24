import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/use-auth";
import { listCustomDomains, addCustomDomain, verifyCustomDomain } from "@/lib/saas.functions";
import { getServerAuthHeaders } from "@/lib/auth-headers";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Globe2, LockKeyhole, RefreshCw } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/domains")({ component: DomainsPage });

function DomainsPage() {
  const { canUseCustomDomain, isTenantAdmin, subscriptionStatus } = useAuth();
  const listFn = useServerFn(listCustomDomains);
  const addFn = useServerFn(addCustomDomain);
  const verifyFn = useServerFn(verifyCustomDomain);
  const [hostname, setHostname] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: domains = [], refetch } = useQuery({
    queryKey: ["custom-domains"],
    enabled: isTenantAdmin && canUseCustomDomain,
    queryFn: async () => listFn({ headers: await getServerAuthHeaders() }),
  });

  if (!isTenantAdmin) {
    return <Card className="mx-auto max-w-2xl p-6"><h1 className="text-xl font-semibold">Custom domain</h1><p className="mt-2 text-sm text-muted-foreground">Only a tenant administrator can manage the workspace domain.</p></Card>;
  }

  if (!canUseCustomDomain) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div><h1 className="text-2xl font-bold tracking-tight">Custom domain</h1><p className="text-sm text-muted-foreground">Use your own domain or subdomain for AssetFlow.</p></div>
        <Card className="p-6">
          <div className="flex items-start gap-3"><LockKeyhole className="mt-0.5 h-5 w-5 text-primary" /><div><h2 className="font-semibold">Paid feature</h2><p className="mt-1 text-sm text-muted-foreground">Custom domains are available on the paid plan. Your current status is <strong>{subscriptionStatus}</strong>.</p><Button asChild className="mt-4"><Link to="/billing">Upgrade to connect a domain</Link></Button></div></div>
        </Card>
      </div>
    );
  }

  const add = async () => {
    if (!hostname.trim()) return;
    setBusy(true);
    try {
      const headers = await getServerAuthHeaders();
      await addFn({ data: { hostname }, headers });
      setHostname("");
      await refetch();
      toast.success("Domain added. Add the TXT record shown below, then verify.");
    } catch (e: any) { toast.error(e?.message ?? "Could not add domain"); }
    finally { setBusy(false); }
  };

  const verify = async (id: string) => {
    try {
      const headers = await getServerAuthHeaders();
      await verifyFn({ data: { domain_id: id }, headers });
      await refetch();
      toast.success("Domain ownership verified");
    } catch (e: any) { toast.error(e?.message ?? "Verification failed"); }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div><h1 className="text-2xl font-bold tracking-tight">Custom domain</h1><p className="text-sm text-muted-foreground">Connect a domain or subdomain owned by your organization.</p></div>
      <Card className="space-y-4 p-6">
        <div className="flex items-center gap-2"><Globe2 className="h-5 w-5 text-primary" /><h2 className="font-semibold">Add domain</h2></div>
        <div className="space-y-2"><Label>Domain or subdomain</Label><Input value={hostname} onChange={(e) => setHostname(e.target.value)} placeholder="assets.example.com" /></div>
        <Button onClick={add} disabled={busy}>{busy ? "Adding…" : "Add domain"}</Button>
      </Card>

      <div className="space-y-3">
        {domains.length === 0 && <Card className="p-6 text-sm text-muted-foreground">No custom domain has been added yet.</Card>}
        {domains.map((d: any) => (
          <Card key={d.id} className="space-y-3 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-semibold">{d.hostname}</p><p className="text-xs text-muted-foreground">Added {new Date(d.created_at).toLocaleDateString()}</p></div><Badge variant={d.status === "verified" || d.status === "active" ? "default" : "outline"} className="capitalize">{d.status}</Badge></div>
            {d.status === "pending" && <div className="rounded-lg bg-muted p-3 text-sm"><p className="font-medium">DNS ownership check</p><p className="mt-1 text-xs text-muted-foreground">Create this TXT record at your DNS provider:</p><div className="mt-2 grid gap-2 font-mono text-xs"><div><span className="text-muted-foreground">Name:</span> _assetflow.{d.hostname}</div><div className="break-all"><span className="text-muted-foreground">Value:</span> {d.verification_token}</div></div><Button variant="outline" size="sm" className="mt-3" onClick={() => verify(d.id)}><RefreshCw className="mr-2 h-3.5 w-3.5" />Verify DNS</Button></div>}
            {(d.status === "verified" || d.status === "active") && <p className="text-sm text-muted-foreground">Ownership is verified. Final HTTPS routing is activated by the hosting gateway for this installation.</p>}
          </Card>
        ))}
      </div>
    </div>
  );
}
