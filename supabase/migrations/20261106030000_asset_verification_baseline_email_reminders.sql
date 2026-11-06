-- Legacy assets without a physical inspection receive a registration baseline, not a fabricated inspection.
-- The baseline starts the ordinary 12-month review cycle while preserving verification history and mismatches.
ALTER TABLE public.assets
  ADD COLUMN IF NOT EXISTS verification_baseline_at timestamptz NOT NULL DEFAULT now();
COMMENT ON COLUMN public.assets.verification_baseline_at IS
  'Registration/current-cycle anchor only. Never evidence of a physical inspection.';

-- Keep exactly the old view column order and types. Append provenance last.
CREATE OR REPLACE VIEW public.asset_verification_schedule
  WITH (security_invoker=true)
AS SELECT
  a.id AS asset_id,
  a.tenant_id,
  a.branch_id,
  a.asset_tag,
  a.name AS asset_name,
  a.created_at AS registered_at,
  a.status::text AS asset_status,
  v.status AS latest_verification_status,
  v.verified_at AS last_verified_at,
  CASE
    WHEN v.status = 'verified' THEN
      v.verified_at + make_interval(months=>t.asset_verification_interval_months)
    WHEN v.status IS NULL THEN
      a.verification_baseline_at + make_interval(months=>t.asset_verification_interval_months)
    ELSE NULL
  END AS verification_due_at,
  t.asset_verification_interval_months AS interval_months,
  CASE
    WHEN v.status IS NOT NULL AND v.status <> 'verified' THEN 'attention'
    WHEN COALESCE(v.verified_at,a.verification_baseline_at) +
        make_interval(months=>t.asset_verification_interval_months) < now() THEN 'overdue'
    WHEN COALESCE(v.verified_at,a.verification_baseline_at) +
        make_interval(months=>t.asset_verification_interval_months) <= now()+interval '30 days'
      THEN 'due_soon'
    ELSE 'current'
  END AS verification_state,
  CASE WHEN v.status='verified' THEN 'physical_verification'
       WHEN v.status IS NOT NULL THEN 'inspection_exception'
       ELSE 'registration_baseline' END AS verification_basis
FROM public.assets a
JOIN public.tenants t ON t.id=a.tenant_id
LEFT JOIN LATERAL (
  SELECT status,verified_at FROM public.asset_verifications av
  WHERE av.asset_id=a.id ORDER BY verified_at DESC,id DESC LIMIT 1
) v ON TRUE
WHERE a.status::text NOT IN ('retired','disposed');

REVOKE ALL ON public.asset_verification_schedule FROM PUBLIC,anon;
GRANT SELECT ON public.asset_verification_schedule TO authenticated;

-- Email reminders are opt-in and sent only to addresses explicitly entered by tenant administrators.
ALTER TABLE public.tenant_automation_settings
  ADD COLUMN IF NOT EXISTS verification_notification_emails text[] NOT NULL DEFAULT '{}'::text[];
ALTER TABLE public.tenant_automation_settings
  DROP CONSTRAINT IF EXISTS automation_verification_email_limit;
ALTER TABLE public.tenant_automation_settings
  ADD CONSTRAINT automation_verification_email_limit
    CHECK (cardinality(verification_notification_emails) <= 10);
ALTER TABLE public.tenant_automation_settings
  ALTER COLUMN verification_interval_days SET DEFAULT 365;

-- Per-asset, per-due-date idempotency: rechecks and server restarts cannot resend the same milestone.
CREATE TABLE IF NOT EXISTS public.asset_verification_email_log (
  id bigserial PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  recipient_email text NOT NULL,
  cycle_due_at timestamptz NOT NULL,
  milestone text NOT NULL,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,asset_id,recipient_email,cycle_due_at,milestone)
);
CREATE INDEX IF NOT EXISTS asset_verification_email_log_tenant_idx
  ON public.asset_verification_email_log(tenant_id,created_at DESC);
ALTER TABLE public.asset_verification_email_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.asset_verification_email_log FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.asset_verification_email_log TO service_role;
GRANT USAGE,SELECT ON SEQUENCE public.asset_verification_email_log_id_seq TO service_role;

NOTIFY pgrst,'reload schema';
