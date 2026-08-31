import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  backupEnvironmentStatus,
  createDatabaseBackup,
  createR2PresignedUrl,
  createRestoreUpload,
  listBackupObjects,
  readBackupPolicy,
  restoreDatabaseBackup,
  updateBackupPolicy,
} from "@/lib/backup-core.server";

const admin = supabaseAdmin as any;

async function assertSaasAdmin(userId: string) {
  const { data, error } = await admin
    .from("profiles")
    .select("id,email,is_saas_admin")
    .eq("id", userId)
    .single();
  if (error || !data?.is_saas_admin) {
    throw new Error("SaaS administrator privileges required");
  }
  return data as { id: string; email: string | null; is_saas_admin: boolean };
}

function assertBackupKey(key: string) {
  if (!key.startsWith("backups/") || key.includes("..")) {
    throw new Error("Invalid backup object");
  }
  return key;
}

export const getBackupDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSaasAdmin(context.userId);
    const environment = backupEnvironmentStatus();
    let policy = null;
    let backups: Awaited<ReturnType<typeof listBackupObjects>> = [];
    let configurationError: string | null = null;

    try {
      policy = await readBackupPolicy();
      if (environment.r2Configured) backups = (await listBackupObjects()).slice(0, 3);
    } catch (error: any) {
      configurationError = error?.message || "Backup configuration could not be loaded";
    }

    return {
      environment,
      policy,
      backups,
      retentionCount: 3,
      emailConfigured: Boolean(
        process.env.RESEND_API_KEY?.trim() && process.env.BACKUP_EMAIL_FROM?.trim(),
      ),
      configurationError,
    };
  });

export const saveBackupPolicy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        enabled: z.boolean(),
        interval_hours: z.union([z.literal(6), z.literal(24)]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertSaasAdmin(context.userId);
    const policy = await updateBackupPolicy(
      data.enabled,
      data.interval_hours,
      context.userId,
    );
    return { ok: true, policy };
  });

export const runBackupNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSaasAdmin(context.userId);
    const status = backupEnvironmentStatus();
    if (!status.databaseConfigured || !status.r2Configured) {
      throw new Error("DATABASE_URL and Cloudflare R2 credentials must be configured first");
    }
    return createDatabaseBackup("manual");
  });

export const getBackupDownload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ key: z.string().min(1).max(1000) }).parse(input))
  .handler(async ({ data, context }) => {
    await assertSaasAdmin(context.userId);
    const key = assertBackupKey(data.key);
    return {
      url: createR2PresignedUrl("GET", key, 900),
      expiresAt: new Date(Date.now() + 900_000).toISOString(),
    };
  });

export const prepareLocalRestore = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        file_name: z.string().trim().min(1).max(255),
        file_size: z.number().int().positive(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertSaasAdmin(context.userId);
    if (!/\.(dump|backup)$/i.test(data.file_name)) {
      throw new Error("Choose a PostgreSQL .dump or .backup file");
    }
    return createRestoreUpload(data.file_name, data.file_size);
  });

export const restoreBackup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        key: z.string().min(1).max(1000),
        confirmation: z.literal("RESTORE"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertSaasAdmin(context.userId);
    if (
      !data.key.startsWith("backups/") &&
      !data.key.startsWith("restore-uploads/")
    ) {
      throw new Error("Invalid restore object");
    }
    return restoreDatabaseBackup(data.key);
  });

function htmlEscape(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export const emailBackup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        key: z.string().min(1).max(1000),
        recipient: z.string().trim().email().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const profile = await assertSaasAdmin(context.userId);
    const key = assertBackupKey(data.key);
    const apiKey = process.env.RESEND_API_KEY?.trim();
    const from = process.env.BACKUP_EMAIL_FROM?.trim();
    const recipient = data.recipient || profile.email;

    if (!apiKey || !from) {
      throw new Error("Backup email is not configured on the server");
    }
    if (!recipient) {
      throw new Error("The SaaS Admin account does not have an email address");
    }

    const downloadUrl = createR2PresignedUrl("GET", key, 3600);
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [recipient],
        subject: "AssetFlow database backup",
        html: `<p>Your requested AssetFlow database backup is ready.</p><p><a href="${htmlEscape(downloadUrl)}">Download the backup</a></p><p>This private link expires in 1 hour.</p><p>Backup: <code>${htmlEscape(key.split("/").pop() || key)}</code></p>`,
      }),
    });

    if (!response.ok) {
      const detail = (await response.text()).slice(0, 1000);
      throw new Error(`Backup email failed with HTTP ${response.status}${detail ? `: ${detail}` : ""}`);
    }
    return { ok: true, recipient };
  });
