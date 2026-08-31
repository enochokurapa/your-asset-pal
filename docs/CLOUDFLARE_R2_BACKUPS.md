# AssetFlow Cloudflare R2 database backups

The SaaS Admin page now manages private PostgreSQL backups in Cloudflare R2.

## What is backed up

`pg_dump` creates a PostgreSQL custom-format dump of the application database. This includes the application data in `public`, authentication records in `auth`, storage metadata, schema objects, functions, and other database-owned data. The R2 bucket remains private.

The system keeps exactly the newest **3** backup objects under `backups/`.

Backup types:

- `automatic` — created by the built-in 6-hour/daily scheduler.
- `manual` — created with **Back up now**.
- `pre-restore` — created automatically immediately before every destructive restore.

## Cloudflare R2 setup

1. In Cloudflare, create a **private Standard R2 bucket**, for example `assetflow-backups`.
2. Create an R2 API token with **Object Read & Write** permission and scope it to this bucket only.
3. Copy the Cloudflare Account ID, Access Key ID and Secret Access Key into the server environment. Do not put them in any `VITE_*` variable.
4. For **Restore from local file**, configure bucket CORS so the browser can upload directly to a short-lived signed PUT URL.

Example CORS rule; replace the origin with the exact production application origin:

```json
[
  {
    "AllowedOrigins": ["https://your-app.example.com"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

No public bucket access is required.

## Required server environment

Use `.env.example` as the reference. At minimum, backup/restore needs:

```text
DATABASE_URL
R2_ACCOUNT_ID
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_BUCKET
```

`R2_ENDPOINT` is optional. The default is:

```text
https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com
```

The **Email** button additionally needs:

```text
RESEND_API_KEY
BACKUP_EMAIL_FROM
```

Email sends a private R2 download URL that expires after one hour instead of attaching a potentially large database dump.

## Database migration

Apply the latest migration before using the updated SaaS Admin page:

```bash
psql "$DATABASE_URL" -f supabase/migrations/20260831235600_global_saas_policy_and_backup_settings.sql
```

The migration:

- adds `backup_enabled` and `backup_interval_hours` to `saas_settings`;
- accepts only 6-hour or 24-hour automated intervals;
- makes the current `trial_days` policy authoritative for existing trial workspaces;
- recalculates trial expiry when the SaaS Admin changes `trial_days`;
- makes future tenant inserts and transitions back to trial use the current saved policy.

## Docker runtime

The application Docker image installs `postgresql-client`, providing:

```text
pg_dump
pg_restore
psql
```

`DATABASE_URL` should normally use the private database hostname available to the application container, for example `ams-db`, rather than exposing PostgreSQL publicly.

## Restore safety

A restore can only be started by a SaaS Admin.

The server performs this sequence:

1. Download the selected R2 object (or the temporary local upload).
2. Run `pg_restore --list` to verify it is a PostgreSQL custom-format dump.
3. Create a fresh `pre-restore` backup of the current database.
4. Restore in a single transaction with `--clean --if-exists --exit-on-error`.
5. Ask PostgREST to reload its schema cache.
6. Remove a temporary local-upload object after a successful restore.
7. Enforce newest-three retention.

Do not use the Restore action merely to inspect a backup; use Download instead.

## Scheduler behavior

The application server checks every five minutes whether a backup is due. It creates a backup only after the globally configured 6-hour or 24-hour interval has elapsed since the newest backup.

For normal single-instance deployment this avoids another paid cron service. If the application is later scaled to multiple replicas, run the scheduler in one replica only by setting `BACKUP_SCHEDULER_DISABLED=true` on the other replicas or move the scheduled call to a single external cron worker.
