-- Every newly registered or imported asset starts pending until a verification is recorded.
-- The default verification renewal is 12 calendar months; tenant admins may adjust it.
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS asset_verification_interval_months integer NOT NULL DEFAULT 12;
ALTER TABLE public.tenants
  DROP CONSTRAINT IF EXISTS tenants_asset_verification_interval_months_check;
ALTER TABLE public.tenants
  ADD CONSTRAINT tenants_asset_verification_interval_months_check
    CHECK (asset_verification_interval_months BETWEEN 1 AND 60);

CREATE INDEX IF NOT EXISTS idx_asset_verification_latest
  ON public.asset_verifications(asset_id, verified_at DESC, id DESC);

-- SECURITY INVOKER: caller's existing RLS policies still govern all source tables.
-- Do not recreate this view without security_invoker=true.
CREATE OR REPLACE VIEW public.asset_verification_schedule
  WITH (security_invoker = true)
AS
SELECT
  a.id AS asset_id,
  a.tenant_id,
  a.branch_id,
  a.asset_tag,
  a.name AS asset_name,
  a.created_at AS registered_at,
  a.status::text AS asset_status,
  v.status AS latest_verification_status,
  v.verified_at AS last_verified_at,
  CASE WHEN v.status = 'verified'
    THEN v.verified_at + make_interval(months => t.asset_verification_interval_months)
    ELSE NULL END AS verification_due_at,
  t.asset_verification_interval_months AS interval_months,
  CASE
    WHEN v.status IS NULL THEN 'pending'
    WHEN v.status <> 'verified' THEN 'attention'
    WHEN v.verified_at + make_interval(months => t.asset_verification_interval_months) < now() THEN 'overdue'
    WHEN v.verified_at + make_interval(months => t.asset_verification_interval_months) <= now() + interval '30 days' THEN 'due_soon'
    ELSE 'current'
  END AS verification_state
FROM public.assets a
JOIN public.tenants t ON t.id = a.tenant_id
LEFT JOIN LATERAL (
  SELECT status, verified_at
  FROM public.asset_verifications av
  WHERE av.asset_id = a.id
  ORDER BY av.verified_at DESC, av.id DESC
  LIMIT 1
) v ON TRUE
WHERE a.status::text NOT IN ('retired','disposed');

REVOKE ALL ON public.asset_verification_schedule FROM PUBLIC, anon;
GRANT SELECT ON public.asset_verification_schedule TO authenticated;
