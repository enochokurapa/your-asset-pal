-- External acquisition analytics use independently authorised providers.
-- Historic custom page view events are intentionally preserved, not presented as acquisition.
CREATE TABLE IF NOT EXISTS public.platform_acquisition_integrations(
 provider text PRIMARY KEY CHECK(provider IN ('google_search_console','cloudflare_web_analytics')),
 config jsonb NOT NULL DEFAULT '{}'::jsonb,
 encrypted_token text,
 updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.platform_search_oauth_states(
 state_hash text PRIMARY KEY CHECK(length(state_hash)=64),
 admin_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS platform_search_oauth_states_expiry_idx
 ON public.platform_search_oauth_states(expires_at);
ALTER TABLE public.platform_acquisition_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_search_oauth_states ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_acquisition_integrations,public.platform_search_oauth_states FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.platform_acquisition_integrations,public.platform_search_oauth_states TO service_role;
COMMENT ON TABLE public.platform_acquisition_integrations IS
 'Real external analytics source configurations; refresh/API tokens encrypted at rest, never sent to browser';
