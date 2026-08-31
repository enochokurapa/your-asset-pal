import { createHash, createHmac, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const admin = supabaseAdmin as any;
const BACKUP_PREFIX = "backups/";
const RESTORE_UPLOAD_PREFIX = "restore-uploads/";
const RETENTION_COUNT = 3;
const MAX_LOCAL_RESTORE_BYTES = 5 * 1024 * 1024 * 1024;

type BackupKind = "manual" | "automatic" | "pre-restore";

export type BackupObject = {
  key: string;
  createdAt: string;
  size: number;
  kind: BackupKind | "unknown";
};

export type BackupPolicy = {
  enabled: boolean;
  intervalHours: 6 | 24;
};

type R2Config = {
  endpoint: URL;
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
};

type DatabaseCli = {
  args: string[];
  env: NodeJS.ProcessEnv;
};

let activeOperation: Promise<unknown> | null = null;
let schedulerStarted = false;

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

export function backupEnvironmentStatus() {
  return {
    databaseConfigured: Boolean(process.env.DATABASE_URL?.trim()),
    r2Configured: Boolean(
      process.env.R2_ACCOUNT_ID?.trim() &&
        process.env.R2_ACCESS_KEY_ID?.trim() &&
        process.env.R2_SECRET_ACCESS_KEY?.trim() &&
        process.env.R2_BUCKET?.trim(),
    ),
  };
}

function getR2Config(): R2Config {
  const accountId = requiredEnv("R2_ACCOUNT_ID");
  const accessKeyId = requiredEnv("R2_ACCESS_KEY_ID");
  const secretAccessKey = requiredEnv("R2_SECRET_ACCESS_KEY");
  const bucket = requiredEnv("R2_BUCKET");
  const configuredEndpoint = process.env.R2_ENDPOINT?.trim();
  const endpoint = new URL(
    configuredEndpoint || `https://${accountId}.r2.cloudflarestorage.com`,
  );
  endpoint.pathname = endpoint.pathname.replace(/\/+$/, "");
  endpoint.search = "";
  endpoint.hash = "";
  return { endpoint, accountId, accessKeyId, secretAccessKey, bucket };
}

function awsEncode(value: string) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function encodePath(value: string) {
  return value
    .split("/")
    .filter((part, index, all) => part.length > 0 || index === all.length - 1)
    .map(awsEncode)
    .join("/");
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function hmac(key: Buffer | string, value: string) {
  return createHmac("sha256", key).update(value).digest();
}

function amzTimestamp(date: Date) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function signingKey(secret: string, dateStamp: string) {
  const kDate = hmac(`AWS4${secret}`, dateStamp);
  const kRegion = hmac(kDate, "auto");
  const kService = hmac(kRegion, "s3");
  return hmac(kService, "aws4_request");
}

function canonicalQuery(params: Record<string, string>) {
  return Object.entries(params)
    .sort(([aKey, aValue], [bKey, bValue]) =>
      aKey === bKey ? aValue.localeCompare(bValue) : aKey.localeCompare(bKey),
    )
    .map(([key, value]) => `${awsEncode(key)}=${awsEncode(value)}`)
    .join("&");
}

function objectPath(config: R2Config, key: string) {
  const base = config.endpoint.pathname.replace(/\/+$/, "");
  const encodedBucket = awsEncode(config.bucket);
  const encodedKey = encodePath(key);
  return `${base}/${encodedBucket}/${encodedKey}`.replace(/\/+/g, "/");
}

export function createR2PresignedUrl(
  method: "GET" | "PUT" | "DELETE" | "HEAD",
  key: string,
  expiresSeconds = 900,
  extraQuery: Record<string, string> = {},
) {
  const config = getR2Config();
  const now = new Date();
  const amzDate = amzTimestamp(now);
  const dateStamp = amzDate.slice(0, 8);
  const credentialScope = `${dateStamp}/auto/s3/aws4_request`;
  const host = config.endpoint.host;
  const path = objectPath(config, key);
  const params: Record<string, string> = {
    ...extraQuery,
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${config.accessKeyId}/${credentialScope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(Math.min(Math.max(expiresSeconds, 1), 604800)),
    "X-Amz-SignedHeaders": "host",
  };
  const query = canonicalQuery(params);
  const canonicalRequest = [
    method,
    path,
    query,
    `host:${host}\n`,
    "host",
    "UNSIGNED-PAYLOAD",
  ].join("\n");
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256(canonicalRequest),
  ].join("\n");
  const signature = createHmac("sha256", signingKey(config.secretAccessKey, dateStamp))
    .update(stringToSign)
    .digest("hex");

  return `${config.endpoint.protocol}//${host}${path}?${query}&X-Amz-Signature=${signature}`;
}

function decodeXml(value: string) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function backupKindFromKey(key: string): BackupObject["kind"] {
  if (key.includes("-automatic.dump")) return "automatic";
  if (key.includes("-manual.dump")) return "manual";
  if (key.includes("-pre-restore.dump")) return "pre-restore";
  return "unknown";
}

export async function listBackupObjects(): Promise<BackupObject[]> {
  const url = createR2PresignedUrl("GET", "", 300, {
    "list-type": "2",
    prefix: BACKUP_PREFIX,
    "max-keys": "1000",
  });
  const response = await fetch(url, { method: "GET" });
  if (!response.ok) {
    throw new Error(`Cloudflare R2 list failed with HTTP ${response.status}`);
  }
  const xml = await response.text();
  const objects: BackupObject[] = [];
  const contents = xml.match(/<Contents>[\s\S]*?<\/Contents>/g) ?? [];
  for (const block of contents) {
    const key = decodeXml(block.match(/<Key>([\s\S]*?)<\/Key>/)?.[1] ?? "");
    const createdAt = decodeXml(
      block.match(/<LastModified>([\s\S]*?)<\/LastModified>/)?.[1] ?? "",
    );
    const size = Number(block.match(/<Size>(\d+)<\/Size>/)?.[1] ?? 0);
    if (!key.startsWith(BACKUP_PREFIX) || !createdAt) continue;
    objects.push({ key, createdAt, size, kind: backupKindFromKey(key) });
  }
  return objects.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

async function deleteR2Object(key: string) {
  const response = await fetch(createR2PresignedUrl("DELETE", key, 300), {
    method: "DELETE",
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(`Cloudflare R2 delete failed with HTTP ${response.status}`);
  }
}

async function enforceRetention() {
  const backups = await listBackupObjects();
  for (const oldBackup of backups.slice(RETENTION_COUNT)) {
    await deleteR2Object(oldBackup.key);
  }
  return (await listBackupObjects()).slice(0, RETENTION_COUNT);
}

function getDatabaseCli(): DatabaseCli {
  const raw = requiredEnv("DATABASE_URL");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("DATABASE_URL is invalid");
  }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error("DATABASE_URL must be a PostgreSQL URL");
  }
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  const username = decodeURIComponent(url.username);
  if (!url.hostname || !database || !username) {
    throw new Error("DATABASE_URL must include host, database and username");
  }
  const env: NodeJS.ProcessEnv = { ...process.env };
  if (url.password) env.PGPASSWORD = decodeURIComponent(url.password);
  const sslMode = url.searchParams.get("sslmode");
  if (sslMode) env.PGSSLMODE = sslMode;
  return {
    args: [
      "--host",
      url.hostname,
      "--port",
      url.port || "5432",
      "--username",
      username,
      "--dbname",
      database,
    ],
    env,
  };
}

async function runCommand(command: string, args: string[], env: NodeJS.ProcessEnv) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { env, stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stdout.on("data", () => undefined);
    child.stderr.on("data", (chunk) => {
      if (stderr.length < 16000) stderr += String(chunk);
    });
    child.on("error", (error) => reject(error));
    child.on("close", (code) => {
      if (code === 0) return resolve();
      const detail = stderr.trim().slice(-4000);
      reject(new Error(`${command} failed${detail ? `: ${detail}` : ""}`));
    });
  });
}

async function createDumpFile(filePath: string) {
  const db = getDatabaseCli();
  await runCommand(
    "pg_dump",
    [
      ...db.args,
      "--format=custom",
      "--compress=6",
      "--no-owner",
      "--no-acl",
      "--file",
      filePath,
    ],
    db.env,
  );
}

async function validateDumpFile(filePath: string) {
  const db = getDatabaseCli();
  await runCommand("pg_restore", ["--list", filePath], db.env);
}

async function restoreDumpFile(filePath: string) {
  const db = getDatabaseCli();
  await runCommand(
    "pg_restore",
    [
      ...db.args,
      "--clean",
      "--if-exists",
      "--no-owner",
      "--no-acl",
      "--exit-on-error",
      "--single-transaction",
      filePath,
    ],
    db.env,
  );
  try {
    await runCommand(
      "psql",
      [...db.args, "--command", "NOTIFY pgrst, 'reload schema';"],
      db.env,
    );
  } catch (error) {
    console.warn("[Backup] Database restored but PostgREST reload notification failed", error);
  }
}

async function uploadFileToR2(filePath: string, key: string) {
  const info = await stat(filePath);
  const response = await fetch(createR2PresignedUrl("PUT", key, 1800), {
    method: "PUT",
    headers: {
      "content-type": "application/octet-stream",
      "content-length": String(info.size),
    },
    body: createReadStream(filePath) as any,
    duplex: "half",
  } as RequestInit & { duplex: "half" });
  if (!response.ok) {
    throw new Error(`Cloudflare R2 upload failed with HTTP ${response.status}`);
  }
  return info.size;
}

async function downloadR2ToFile(key: string, filePath: string) {
  const response = await fetch(createR2PresignedUrl("GET", key, 1800));
  if (!response.ok || !response.body) {
    throw new Error(`Cloudflare R2 download failed with HTTP ${response.status}`);
  }
  await pipeline(Readable.fromWeb(response.body as any), createWriteStream(filePath));
}

function timestampForKey() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function createDatabaseBackupInternal(kind: BackupKind) {
  const dir = await mkdtemp(join(tmpdir(), "assetflow-backup-"));
  const filePath = join(dir, "database.dump");
  try {
    await createDumpFile(filePath);
    await validateDumpFile(filePath);
    const key = `${BACKUP_PREFIX}${timestampForKey()}-${kind}.dump`;
    const size = await uploadFileToR2(filePath, key);
    const backups = await enforceRetention();
    return {
      key,
      size,
      kind,
      createdAt: new Date().toISOString(),
      backups,
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function runExclusive<T>(operation: () => Promise<T>) {
  if (activeOperation) {
    throw new Error("A database backup or restore is already in progress");
  }
  const promise = operation();
  activeOperation = promise;
  try {
    return await promise;
  } finally {
    if (activeOperation === promise) activeOperation = null;
  }
}

export async function createDatabaseBackup(kind: BackupKind = "manual") {
  return runExclusive(() => createDatabaseBackupInternal(kind));
}

function isAllowedRestoreKey(key: string) {
  return key.startsWith(BACKUP_PREFIX) || key.startsWith(RESTORE_UPLOAD_PREFIX);
}

export async function restoreDatabaseBackup(key: string) {
  if (!isAllowedRestoreKey(key)) throw new Error("Invalid restore object");
  return runExclusive(async () => {
    const dir = await mkdtemp(join(tmpdir(), "assetflow-restore-"));
    const filePath = join(dir, "restore.dump");
    try {
      // Download and validate the requested restore point before making any database change.
      await downloadR2ToFile(key, filePath);
      await validateDumpFile(filePath);

      // Always create a fresh safety backup immediately before a destructive restore.
      await createDatabaseBackupInternal("pre-restore");
      await restoreDumpFile(filePath);

      if (key.startsWith(RESTORE_UPLOAD_PREFIX)) {
        await deleteR2Object(key).catch((error) =>
          console.warn("[Backup] Temporary restore upload cleanup failed", error),
        );
      }
      return { ok: true, restoredKey: key, restoredAt: new Date().toISOString() };
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
}

export function createRestoreUpload(keySuffix: string, fileSize: number) {
  if (!Number.isFinite(fileSize) || fileSize < 1 || fileSize > MAX_LOCAL_RESTORE_BYTES) {
    throw new Error("Restore file must be between 1 byte and 5 GB");
  }
  const safeName = keySuffix.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120) || "backup.dump";
  const key = `${RESTORE_UPLOAD_PREFIX}${randomUUID()}-${safeName}`;
  return {
    key,
    uploadUrl: createR2PresignedUrl("PUT", key, 900),
    expiresAt: new Date(Date.now() + 900_000).toISOString(),
  };
}

export async function readBackupPolicy(): Promise<BackupPolicy> {
  const { data, error } = await admin
    .from("saas_settings")
    .select("backup_enabled,backup_interval_hours")
    .eq("id", true)
    .single();
  if (error || !data) {
    throw new Error(
      error?.message || "Backup settings are unavailable; apply the latest database migration",
    );
  }
  const hours = Number(data.backup_interval_hours);
  if (hours !== 6 && hours !== 24) {
    throw new Error("Backup interval must be 6 or 24 hours");
  }
  return { enabled: data.backup_enabled !== false, intervalHours: hours };
}

export async function updateBackupPolicy(enabled: boolean, intervalHours: 6 | 24, userId: string) {
  const { error } = await admin
    .from("saas_settings")
    .update({
      backup_enabled: enabled,
      backup_interval_hours: intervalHours,
      updated_at: new Date().toISOString(),
      updated_by: userId,
    })
    .eq("id", true);
  if (error) throw new Error(error.message);
  return readBackupPolicy();
}

async function scheduledBackupTick() {
  const status = backupEnvironmentStatus();
  if (!status.databaseConfigured || !status.r2Configured) return;
  const policy = await readBackupPolicy();
  if (!policy.enabled) return;
  const backups = await listBackupObjects();
  const newest = backups[0];
  const ageMs = newest ? Date.now() - new Date(newest.createdAt).getTime() : Number.POSITIVE_INFINITY;
  if (ageMs < policy.intervalHours * 60 * 60 * 1000) return;
  await createDatabaseBackup("automatic");
}

export function startBackupScheduler() {
  if (schedulerStarted || process.env.BACKUP_SCHEDULER_DISABLED === "true") return;
  schedulerStarted = true;

  const tick = () => {
    scheduledBackupTick().catch((error) =>
      console.error("[Backup] Scheduled backup check failed", error),
    );
  };

  const initial = setTimeout(tick, 30_000);
  const recurring = setInterval(tick, 5 * 60_000);
  initial.unref?.();
  recurring.unref?.();
}
