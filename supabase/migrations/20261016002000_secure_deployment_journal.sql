-- Restrict the deployment migration journal to privileged server processes.
ALTER TABLE public.assetflow_deployment_migrations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.assetflow_deployment_migrations FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assetflow_deployment_migrations TO service_role;
