import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  emailBackup,
  getBackupDashboard,
  getBackupDownload,
  prepareLocalRestore,
  restoreBackup,
  runBackupNow,
  saveBackupPolicy,
} from "@/lib/backup.functions";
import { getServerAuthHeaders } from "@/lib/auth-headers";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Cloud,
  DatabaseBackup,
  Download,
  Mail,
  RefreshCw,
  RotateCcw,
  Save,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${value.toFixed(index === 0 ? 0 : value >= 10 ? 1 : 2)} ${units[index]}`;
}

function backupLabel(kind: string) {
  if (kind === "automatic") return "Automatic";
  if (kind === "pre-restore") return "Safety backup";
  if (kind === "manual") return "Manual";
  return "Backup";
}

export function SaasBackupManager() {
  const getDashboard = useServerFn(getBackupDashboard);
  const savePolicy = useServerFn(saveBackupPolicy);
  const backupNow = useServerFn(runBackupNow);
  const getDownload = useServerFn(getBackupDownload);
  const sendEmail = useServerFn(emailBackup);
  const prepareRestore = useServerFn(prepareLocalRestore);
  const restore = useServerFn(restoreBackup);
  const fileInput = useRef<HTMLInputElement | null>(null);

  const [enabled, setEnabled] = useState(true);
  const [intervalHours, setIntervalHours] = useState<6 | 24>(24);
  const [savingPolicy, setSavingPolicy] = useState(false);
  const [runningBackup, setRunningBackup] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [localRestoreBusy, setLocalRestoreBusy] = useState(false);

  const authCall = async <T,>(fn: (arg: any) => Promise<T>, arg: any = {}) => {
    const headers = await getServerAuthHeaders();
    return fn({ ...arg, headers });
  };

  const { data, refetch, isFetching } = useQuery({
    queryKey: ["saas-backups"],
    queryFn: () => authCall(getDashboard),
  });

  useEffect(() => {
    if (!data?.policy) return;
    setEnabled(Boolean(data.policy.enabled));
    setIntervalHours(data.policy.intervalHours === 6 ? 6 : 24);
  }, [data?.policy]);

  const persistPolicy = async () => {
    setSavingPolicy(true);
    try {
      await authCall(savePolicy, {
        data: { enabled, interval_hours: intervalHours },
      });
      toast.success("Backup schedule saved globally");
      await refetch();
    } catch (error: any) {
      toast.error(error?.message || "Could not save backup schedule");
    } finally {
      setSavingPolicy(false);
    }
  };

  const runNow = async () => {
    setRunningBackup(true);
    try {
      await authCall(backupNow);
      toast.success("Database backup saved to Cloudflare R2");
      await refetch();
    } catch (error: any) {
      toast.error(error?.message || "Backup failed");
    } finally {
      setRunningBackup(false);
    }
  };

  const download = async (key: string) => {
    setBusyKey(key);
    try {
      const result = await authCall(getDownload, { data: { key } });
      window.open(result.url, "_blank", "noopener,noreferrer");
    } catch (error: any) {
      toast.error(error?.message || "Could not create download link");
    } finally {
      setBusyKey(null);
    }
  };

  const email = async (key: string) => {
    setBusyKey(key);
    try {
      const result = await authCall(sendEmail, { data: { key } });
      toast.success(`Backup link sent to ${result.recipient}`);
    } catch (error: any) {
      toast.error(error?.message || "Could not send backup email");
    } finally {
      setBusyKey(null);
    }
  };

  const restoreKey = async (key: string, sourceLabel: string) => {
    const accepted = window.confirm(
      `Restore the database from ${sourceLabel}?\n\nThis replaces the current database contents. A fresh safety backup will be created automatically before the restore starts.`,
    );
    if (!accepted) return;

    setBusyKey(key);
    try {
      await authCall(restore, {
        data: { key, confirmation: "RESTORE" as const },
      });
      toast.success("Database restored successfully. Reloading the application…");
      window.setTimeout(() => window.location.reload(), 750);
    } catch (error: any) {
      toast.error(error?.message || "Database restore failed");
    } finally {
      setBusyKey(null);
    }
  };

  const restoreLocalFile = async (file: File) => {
    setLocalRestoreBusy(true);
    try {
      const prepared = await authCall(prepareRestore, {
        data: { file_name: file.name, file_size: file.size },
      });
      const upload = await fetch(prepared.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/octet-stream" },
        body: file,
      });
      if (!upload.ok) {
        throw new Error(
          `Upload to Cloudflare R2 failed with HTTP ${upload.status}. Check the bucket CORS settings.`,
        );
      }
      await restoreKey(prepared.key, `local file “${file.name}”`);
    } catch (error: any) {
      toast.error(error?.message || "Could not upload the local backup");
    } finally {
      if (fileInput.current) fileInput.current.value = "";
      setLocalRestoreBusy(false);
    }
  };

  const ready = Boolean(data?.environment.databaseConfigured && data?.environment.r2Configured);

  return (
    <Card className="space-y-5 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <DatabaseBackup className="mt-0.5 h-5 w-5 text-primary" />
          <div>
            <h2 className="font-semibold">Database backup & restore</h2>
            <p className="text-sm text-muted-foreground">
              Private Cloudflare R2 backups. The system always keeps only the newest {data?.retentionCount ?? 3} database backups.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant={data?.environment.r2Configured ? "default" : "outline"}>
            <Cloud className="mr-1 h-3 w-3" />R2 {data?.environment.r2Configured ? "connected" : "not configured"}
          </Badge>
          <Badge variant={data?.environment.databaseConfigured ? "default" : "outline"}>
            Database {data?.environment.databaseConfigured ? "ready" : "not configured"}
          </Badge>
        </div>
      </div>

      {data?.configurationError && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          {data.configurationError}
        </div>
      )}

      <div className="grid gap-4 rounded-lg border p-4 md:grid-cols-[1fr_220px_auto] md:items-end">
        <div className="flex items-center justify-between gap-4">
          <div>
            <Label>Automated backups</Label>
            <p className="text-xs text-muted-foreground">Runs while the application server is online.</p>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} disabled={!data?.policy} />
        </div>
        <div className="space-y-2">
          <Label>Frequency</Label>
          <Select
            value={String(intervalHours)}
            onValueChange={(value) => setIntervalHours(value === "6" ? 6 : 24)}
            disabled={!data?.policy || !enabled}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="6">Every 6 hours</SelectItem>
              <SelectItem value="24">Once a day</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={persistPolicy} disabled={!data?.policy || savingPolicy}>
          <Save className="mr-2 h-4 w-4" />{savingPolicy ? "Saving…" : "Save schedule"}
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={runNow} disabled={!ready || runningBackup || localRestoreBusy}>
          <DatabaseBackup className="mr-2 h-4 w-4" />{runningBackup ? "Backing up…" : "Back up now"}
        </Button>
        <Button
          variant="outline"
          onClick={() => fileInput.current?.click()}
          disabled={!ready || localRestoreBusy || runningBackup}
        >
          <Upload className="mr-2 h-4 w-4" />{localRestoreBusy ? "Uploading…" : "Restore from local file"}
        </Button>
        <input
          ref={fileInput}
          type="file"
          className="hidden"
          accept=".dump,.backup,application/octet-stream"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void restoreLocalFile(file);
          }}
        />
        <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />Refresh
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Size</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(data?.backups ?? []).length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">No Cloudflare backups found yet.</td></tr>
            ) : (
              (data?.backups ?? []).map((backup) => {
                const busy = busyKey === backup.key;
                return (
                  <tr key={backup.key} className="border-b last:border-0">
                    <td className="px-4 py-3">
                      <p className="font-medium">{new Date(backup.createdAt).toLocaleString()}</p>
                      <p className="max-w-xs truncate text-xs text-muted-foreground" title={backup.key}>{backup.key.split("/").pop()}</p>
                    </td>
                    <td className="px-4 py-3"><Badge variant="outline">{backupLabel(backup.kind)}</Badge></td>
                    <td className="px-4 py-3">{formatBytes(backup.size)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button size="sm" variant="outline" disabled={busy} onClick={() => download(backup.key)}>
                          <Download className="mr-1 h-4 w-4" />Download
                        </Button>
                        <Button size="sm" variant="outline" disabled={busy || !data?.emailConfigured} onClick={() => email(backup.key)} title={data?.emailConfigured ? undefined : "Configure Resend email variables first"}>
                          <Mail className="mr-1 h-4 w-4" />Email
                        </Button>
                        <Button size="sm" variant="destructive" disabled={busy} onClick={() => restoreKey(backup.key, backup.key.split("/").pop() || "this backup")}>
                          <RotateCcw className="mr-1 h-4 w-4" />Restore
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        Restore is restricted to the SaaS Admin. Uploaded local files are temporary and are removed from R2 after a successful restore. Email sends a private one-hour download link rather than attaching the database to the message.
      </p>
    </Card>
  );
}
