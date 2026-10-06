import { useEffect, useState } from "react";
import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/use-auth";
import { getServerAuthHeaders } from "@/lib/auth-headers";
import { createApiKey, listApiKeys, revokeApiKey } from "@/lib/api-access.functions";
import {
  disconnectMicrosoft365,
  getMicrosoft365ConnectUrl,
  getMicrosoft365Status,
  sendMicrosoft365TestEmail,
  syncMicrosoft365Directory,
} from "@/lib/microsoft365.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { KeyRound, Copy, Ban, PlugZap, ShieldCheck, Cloud, Users, RefreshCw, Mail, ExternalLink, Unplug, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/integrations")({
  validateSearch: (s: Record<string, unknown>) => ({
    microsoft: typeof s.microsoft === "string" ? s.microsoft : undefined,
    message: typeof s.message === "string" ? s.message : undefined,
  }),
  component: IntegrationsPage,
});

function IntegrationsPage() {
  const { isTenantAdmin, canView } = useAuth();
  const search = Route.useSearch();
  const nav = useNavigate();
  const listKeys = useServerFn(listApiKeys);
  const makeKey = useServerFn(createApiKey);
  const revokeKey = useServerFn(revokeApiKey);
  const getMicrosoftStatus = useServerFn(getMicrosoft365Status);
  const connectMicrosoft = useServerFn(getMicrosoft365ConnectUrl);
  const syncMicrosoft = useServerFn(syncMicrosoft365Directory);
  const sendMicrosoftTest = useServerFn(sendMicrosoft365TestEmail);
  const disconnectMicrosoft = useServerFn(disconnectMicrosoft365);
  const [name, setName] = useState("");
  const [keyType, setKeyType] = useState<"read" | "tracking">("read");
  const [newKey, setNewKey] = useState<string | null>(null);
  const [microsoftBusy, setMicrosoftBusy] = useState<string | null>(null);
  const [testEmail, setTestEmail] = useState("");

  const authCall = async <T,>(fn: (arg: any) => Promise<T>, arg: any = {}) => {
    const headers = await getServerAuthHeaders();
    return fn({ ...arg, headers });
  };

  const { data: keys = [], refetch, isLoading } = useQuery({
    queryKey: ["tenant-api-keys"],
    queryFn: () => authCall(listKeys),
    enabled: isTenantAdmin && canView("api_access"),
  });

  const { data: microsoftStatus, refetch: refetchMicrosoft, isLoading: microsoftLoading } = useQuery({
    queryKey: ["microsoft-365-status"],
    queryFn: () => authCall(getMicrosoftStatus),
    enabled: isTenantAdmin,
  });

  useEffect(() => {
    if (search.microsoft === "connected") {
      toast.success("Microsoft 365 connected");
      refetchMicrosoft();
      nav({ to: "/integrations", search: {} as any, replace: true });
    } else if (search.microsoft === "error") {
      toast.error(search.message || "Microsoft 365 connection failed");
      nav({ to: "/integrations", search: {} as any, replace: true });
    }
  }, [search.microsoft, search.message]);

  if (!isTenantAdmin) return <Navigate to="/dashboard" />;

  const create = async () => {
    if (!name.trim()) return toast.error("Give the API key a name");
    try {
      const result: any = await authCall(makeKey, { data: { name: name.trim(), key_type: keyType } });
      setNewKey(result.key);
      setName("");
      setKeyType("read");
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

  const startMicrosoftConnect = async () => {
    setMicrosoftBusy("connect");
    try {
      const result: any = await authCall(connectMicrosoft);
      window.location.assign(result.url);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not start Microsoft 365 connection");
      setMicrosoftBusy(null);
    }
  };

  const syncMicrosoftUsers = async () => {
    setMicrosoftBusy("sync");
    try {
      const result: any = await authCall(syncMicrosoft);
      await refetchMicrosoft();
      toast.success(`Synced ${result.count} Microsoft 365 users`);
    } catch (e: any) {
      toast.error(e?.message ?? "Microsoft 365 directory sync failed");
    } finally {
      setMicrosoftBusy(null);
    }
  };

  const sendMicrosoftEmail = async () => {
    if (!testEmail.trim()) return toast.error("Enter an email address");
    setMicrosoftBusy("email");
    try {
      await authCall(sendMicrosoftTest, { data: { to: testEmail.trim() } });
      toast.success("Microsoft 365 test email sent");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not send Microsoft 365 test email");
    } finally {
      setMicrosoftBusy(null);
    }
  };

  const disconnectMicrosoftAccount = async () => {
    if (!confirm("Disconnect Microsoft 365 from this workspace? Directory cache will remain for audit/reference, but Microsoft actions will stop.")) return;
    setMicrosoftBusy("disconnect");
    try {
      await authCall(disconnectMicrosoft);
      await refetchMicrosoft();
      toast.success("Microsoft 365 disconnected");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not disconnect Microsoft 365");
    } finally {
      setMicrosoftBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">API & Integrations</h1>
        <p className="text-sm text-muted-foreground">
          Connect external systems to AssetFlow using tenant-scoped API keys. API v1 is read-only in this release.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Cloud className="h-5 w-5 text-primary" /> Microsoft 365
              </CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Connect this workspace to Microsoft Entra ID and Microsoft Graph for directory sync and Microsoft 365 email delivery.
              </p>
            </div>
            {microsoftStatus?.connection?.status === "connected" ? (
              <Badge className="gap-1"><CheckCircle2 className="h-3.5 w-3.5"/>Connected</Badge>
            ) : microsoftStatus?.configured ? (
              <Badge variant="outline">Ready to connect</Badge>
            ) : (
              <Badge variant="outline" className="gap-1"><AlertCircle className="h-3.5 w-3.5"/>Setup required</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {microsoftLoading ? (
            <p className="text-sm text-muted-foreground">Checking Microsoft 365 connection…</p>
          ) : !microsoftStatus?.configured ? (
            <div className="space-y-3 rounded-xl border bg-muted/25 p-4">
              <p className="text-sm font-semibold">Microsoft Entra app registration required</p>
              <p className="text-sm text-muted-foreground">
                The AssetFlow server does not yet have a Microsoft 365 client ID and client secret. Configure the platform app registration before tenants can connect.
              </p>
              <div className="grid gap-2 text-xs">
                <div><span className="font-medium">Redirect URI:</span> <code className="break-all rounded bg-background px-1.5 py-0.5">{microsoftStatus?.redirect_uri}</code></div>
                <div><span className="font-medium">Graph permissions:</span> {(microsoftStatus?.required_scopes || []).join(", ")}</div>
              </div>
            </div>
          ) : microsoftStatus?.connection?.status !== "connected" ? (
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-muted/20 p-4">
              <div>
                <p className="text-sm font-semibold">Connect your Microsoft 365 tenant</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  A Microsoft 365 administrator may need to approve directory permissions during consent.
                </p>
              </div>
              <Button onClick={startMicrosoftConnect} disabled={!!microsoftBusy}>
                <ExternalLink className="mr-2 h-4 w-4" />
                {microsoftBusy === "connect" ? "Opening Microsoft…" : "Connect Microsoft 365"}
              </Button>
            </div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl border p-3">
                  <p className="text-xs text-muted-foreground">Connected account</p>
                  <p className="mt-1 truncate text-sm font-semibold">{microsoftStatus.connection.display_name || microsoftStatus.connection.account_email || "Microsoft 365"}</p>
                  <p className="truncate text-xs text-muted-foreground">{microsoftStatus.connection.account_email}</p>
                </div>
                <div className="rounded-xl border p-3">
                  <p className="text-xs text-muted-foreground">Directory users</p>
                  <p className="mt-1 text-2xl font-bold tabular-nums">{microsoftStatus.connection.directory_user_count || 0}</p>
                </div>
                <div className="rounded-xl border p-3">
                  <p className="text-xs text-muted-foreground">Last sync</p>
                  <p className="mt-1 text-sm font-semibold">
                    {microsoftStatus.connection.last_sync_at ? new Date(microsoftStatus.connection.last_sync_at).toLocaleString() : "Not synced yet"}
                  </p>
                  {microsoftStatus.connection.last_sync_status && <p className="text-xs text-muted-foreground">{microsoftStatus.connection.last_sync_status}</p>}
                </div>
                <div className="rounded-xl border p-3">
                  <p className="text-xs text-muted-foreground">Microsoft tenant</p>
                  <p className="mt-1 truncate font-mono text-xs">{microsoftStatus.connection.microsoft_tenant_id || "Not reported"}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button onClick={syncMicrosoftUsers} disabled={!!microsoftBusy}>
                  <RefreshCw className={`mr-2 h-4 w-4 ${microsoftBusy === "sync" ? "animate-spin" : ""}`} />
                  Sync directory
                </Button>
                <Button variant="outline" onClick={disconnectMicrosoftAccount} disabled={!!microsoftBusy}>
                  <Unplug className="mr-2 h-4 w-4"/>Disconnect
                </Button>
              </div>

              <div className="grid gap-4 lg:grid-cols-[1.2fr_.8fr]">
                <div className="rounded-xl border p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <Users className="h-4 w-4 text-primary"/>
                    <p className="text-sm font-semibold">Microsoft 365 directory</p>
                  </div>
                  {!microsoftStatus.directory_preview?.length ? (
                    <p className="text-sm text-muted-foreground">Sync the directory to load Microsoft 365 users.</p>
                  ) : (
                    <div className="space-y-2">
                      {microsoftStatus.directory_preview.map((u:any)=>(
                        <div key={u.microsoft_user_id} className="flex items-center justify-between gap-3 rounded-lg bg-muted/30 px-3 py-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{u.display_name}</p>
                            <p className="truncate text-xs text-muted-foreground">{u.mail || u.user_principal_name}</p>
                          </div>
                          <div className="text-right">
                            {u.department && <p className="text-xs font-medium">{u.department}</p>}
                            {u.job_title && <p className="text-[11px] text-muted-foreground">{u.job_title}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-xl border p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <Mail className="h-4 w-4 text-primary"/>
                    <p className="text-sm font-semibold">Test Microsoft email</p>
                  </div>
                  <p className="mb-3 text-xs text-muted-foreground">Send a test message through the connected Microsoft 365 mailbox.</p>
                  <div className="space-y-2">
                    <Input
                      type="email"
                      value={testEmail}
                      onChange={(e)=>setTestEmail(e.target.value)}
                      placeholder={microsoftStatus.connection.account_email || "recipient@company.com"}
                    />
                    <Button variant="outline" className="w-full" onClick={sendMicrosoftEmail} disabled={microsoftBusy === "email"}>
                      <Mail className="mr-2 h-4 w-4"/>{microsoftBusy === "email" ? "Sending…" : "Send test email"}
                    </Button>
                  </div>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

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
            <div className="space-y-2">
              <Label>Key type</Label>
              <Select value={keyType} onValueChange={(v) => setKeyType(v as "read" | "tracking")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="read">Read-only integration</SelectItem>
                  {canView("live_tracking") && <SelectItem value="tracking">Live tracking ingest</SelectItem>}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={create} disabled={!canView("api_access")}>Generate API key</Button>
            <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
              {keyType === "tracking" ? (
                <>Scope: <strong>tracking:write</strong>. Use only for an approved GPS/IoT provider.</>
              ) : (
                <>Scopes: <strong>assets:read</strong>, <strong>locations:read</strong>, <strong>branches:read</strong>.</>
              )}
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
              {canView("live_tracking") && <code className="rounded border p-2">POST /api/v1/tracking/events</code>}
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
