-- API Access and Live Tracking remain locked until explicitly activated.
DELETE FROM public.tenant_module_overrides
WHERE module_key IN ('api_access', 'live_tracking');
