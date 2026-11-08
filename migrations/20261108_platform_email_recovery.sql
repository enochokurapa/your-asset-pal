BEGIN;
CREATE TABLE IF NOT EXISTS public.platform_email_recovery_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 requested_by uuid NOT NULL REFERENCES auth.users(id),
 tenant_id uuid,
 previous_email text NOT NULL,
 replacement_email text NOT NULL,
 token_hash text NOT NULL UNIQUE,
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT (now()+interval '1 day'),
 consumed_at timestamptz,
 cancelled_at timestamptz
);
CREATE INDEX IF NOT EXISTS platform_email_recovery_users_idx ON public.platform_email_recovery_requests(user_id,created_at DESC);
REVOKE ALL ON public.platform_email_recovery_requests FROM PUBLIC,anon,authenticated;
COMMIT;
