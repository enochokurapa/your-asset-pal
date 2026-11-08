BEGIN;
CREATE TABLE IF NOT EXISTS public.platform_security_email_mfa (
 user_id uuid NOT NULL,
 session_id uuid NOT NULL,
 code_hash text,
 code_expires_at timestamptz,
 last_sent_at timestamptz,
 window_started_at timestamptz NOT NULL DEFAULT now(),
 sends_in_window integer NOT NULL DEFAULT 0,
 failed_attempts integer NOT NULL DEFAULT 0,
 verified_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,session_id),
 CONSTRAINT mfa_send_window_check CHECK(sends_in_window BETWEEN 0 AND 5),
 CONSTRAINT mfa_attempts_check CHECK(failed_attempts BETWEEN 0 AND 5)
);
REVOKE ALL ON public.platform_security_email_mfa FROM PUBLIC,anon,authenticated;
CREATE INDEX IF NOT EXISTS platform_security_email_mfa_recent_idx ON public.platform_security_email_mfa(last_sent_at);
COMMIT;
