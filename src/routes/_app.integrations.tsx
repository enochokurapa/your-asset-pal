import { useState } from "react";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/use-auth";
import { getServerAuthHeaders } from "@/lib/auth-headers";
import { createApiKey, listApiKeys, revokeApiKey } from "@/lib/api-access.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { KeyRound, Copy, Ban, PlugZap, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/integrations")({
  component: IntegrationsPage,
});

function IntegrationsPage() {
  const { isTenantAdmin, canView } = useAuth();
  const listKeys = useServerFn(listApiKeys);
  const makeKey = useServerFn(createApiKey);
  const revokeKey = useServerFn(revokeApiKey);
  const [name, setName] = useState("");
  const [newKey, setNewKey] = useState<string | null>(null);

  const authCall = async <T,>(fn: (arg: any) => Promise<T>, arg: any = {}) => {
    const headers = await getServerAuthHeaders();
    return fn({ ...arg, headers });
  };

  const { data: keys = [], refetch, isLoading } = useQuery({
    queryKey: ["tenant-api-keys"],
    queryFn: () => authCall(listKeys),
    enabled: isTenantAdmin && canView("api_access"),
  });

  if (!isTenantAdmin) return <Navigate to="/dashboard" />;

  const create = async () => {
    if (!name.trim()) return toast.error("Give the API key a name");
    try {
      const result: any = await authCall(makeKey, { data: { name: name.trim() } });
      setNewKey(result.key);
      setName("");
      await refetch();
      toast.success("API key created");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not create API key");
    }
  };

  const revoke = async (id: string) => {
    if (!confirm("Revoke this API key? Systems using it will immediately stop working.")) return;
    try {
      await authCall(revokeKey, { data: { id } });
      await refetch();
      toast.success("API key revoked");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not revoke API key");
    }
  };

  const copyKey = async () => {
    if (!newKey) return;
    await navigator.clipboard.writeText(newKey);
    toast.success("API key copied");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">API & Integrations</h1>
        <p className="text-sm text-muted-foreground">
          Connect external systems to AssetFlow using tenant-scoped API keys. API v1 is read-only in this release.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.3fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5 text-primary" /> Create API key</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Key name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. PesaPal ERP integration" />
            </div>
            <Button onClick={create} disabled={!canView("api_access")}>Generate API key</Button>
            <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
              Default scopes: <strong>assets:read</strong>, <strong>locations:read</strong>, <strong>branches:read</strong>.
              Write scopes are intentionally disabled for the first release.
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><PlugZap className="h-5 w-5 text-primary" /> API v1</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>Base path: <code className="rounded bg-muted px-1.5 py-0.5">/api/v1</code></p>
            <div className="grid gap-2">
              <code className="rounded border p-2">GET /api/v1/assets</code>
              <code className="rounded border p-2">GET /api/v1/locations</code>
              <code className="rounded border p-2">GET /api/v1/branches</code>
            </div>
            <p className="text-xs text-muted-foreground">
              Send the key as <code>Authorization: Bearer af_live_...</code>. Results are automatically restricted to this workspace.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" /> API keys</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading keys…</p>
          ) : keys.length === 0 ? (
            <p className="text-sm text-muted-foreground">No API keys created yet.</p>
          ) : (
            <div className="space-y-3">
              {keys.map((key: any) => (
                <div key={key.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{key.name}</p>
                      <Badge variant={key.is_active ? "secondary" : "outline"}>{key.is_active ? "Active" : "Revoked"}</Badge>
                    </div>
                    <p className="mt-1 font-mono text-xs text-muted-foreground">{key.key_prefix}••••••••</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Created {new Date(key.created_at).toLocaleString()}
                      {key.last_used_at ? ` · Last used ${new Date(key.last_used_at).toLocaleString()}` : ""}
                    </p>
                  </div>
                  {key.is_active && (
                    <Button variant="outline" size="sm" onClick={() => revoke(key.id)}>
                      <Ban className="mr-2 h-4 w-4" /> Revoke
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!newKey} onOpenChange={(open) => !open && setNewKey(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>API key created</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Copy this key now. For security, AssetFlow will not show the full secret again.</p>
            <div className="break-all rounded-lg border bg-muted p-3 font-mono text-sm">{newKey}</div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={copyKey}><Copy className="mr-2 h-4 w-4" /> Copy</Button>
            <Button onClick={() => setNewKey(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
