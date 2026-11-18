-- Security history must not be destroyed from ordinary tenant clients.
-- Privileged operations may archive business audit entries by setting cleared_at.
-- GoTrue's own auth.audit_log_entries is a separate, server-owned history.
REVOKE DELETE ON TABLE public.audit_log FROM anon,authenticated;
REVOKE DELETE ON TABLE public.platform_tenant_security_events FROM anon,authenticated;
REVOKE DELETE ON TABLE public.platform_tenant_access_audit FROM anon,authenticated;
REVOKE DELETE ON TABLE public.tenant_support_audit FROM anon,authenticated;
