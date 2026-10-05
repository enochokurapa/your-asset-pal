BEGIN;

CREATE TABLE IF NOT EXISTS public.tenant_automation_settings (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  approval_reminders_enabled boolean NOT NULL DEFAULT true,
  approval_after_hours integer NOT NULL DEFAULT 24 CHECK (approval_after_hours BETWEEN 1 AND 168),
  gate_pass_return_reminders_enabled boolean NOT NULL DEFAULT false,
  gate_pass_days_after_due integer NOT NULL DEFAULT 1 CHECK (gate_pass_days_after_due BETWEEN 0 AND 30),
  depreciation_due_reminders_enabled boolean NOT NULL DEFAULT false,
  verification_due_reminders_enabled boolean NOT NULL DEFAULT false,
  verification_interval_days integer NOT NULL DEFAULT 180 CHECK (verification_interval_days BETWEEN 7 AND 730),
  last_approval_run_at timestamptz,
  last_gate_pass_run_at timestamptz,
  last_depreciation_run_at timestamptz,
  last_verification_run_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

INSERT INTO public.tenant_automation_settings(tenant_id)
SELECT id FROM public.tenants
ON CONFLICT (tenant_id) DO NOTHING;

ALTER TABLE public.tenant_automation_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant read automation settings" ON public.tenant_automation_settings;
CREATE POLICY "tenant read automation settings"
ON public.tenant_automation_settings FOR SELECT TO authenticated
USING (tenant_id = public.current_tenant_id() OR public.is_saas_admin(auth.uid()));

DROP POLICY IF EXISTS "tenant admin write automation settings" ON public.tenant_automation_settings;
CREATE POLICY "tenant admin write automation settings"
ON public.tenant_automation_settings FOR ALL TO authenticated
USING (
  tenant_id = public.current_tenant_id()
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (p.tenant_role = 'tenant_admin' OR p.is_saas_admin = true)
  )
)
WITH CHECK (
  tenant_id = public.current_tenant_id()
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (p.tenant_role = 'tenant_admin' OR p.is_saas_admin = true)
  )
);

NOTIFY pgrst, 'reload schema';
COMMIT;
