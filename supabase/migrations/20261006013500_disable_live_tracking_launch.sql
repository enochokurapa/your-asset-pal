-- Launch state: live tracking is built but not commercially enabled yet.
UPDATE public.saas_modules
SET globally_enabled=false,
    trial_enabled=false,
    paid_enabled=true,
    updated_at=now()
WHERE module_key='live_tracking';

NOTIFY pgrst, 'reload schema';
