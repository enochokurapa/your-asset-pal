-- Complete tenant isolation for user references and automated notifications.
-- Depends on 20260930030000_harden_multitenancy.sql.

BEGIN;

DO $$
DECLARE
  spec text[];
  trigger_name text;
  source_table text;
  source_column text;
BEGIN
  FOREACH spec SLICE 1 IN ARRAY ARRAY[
    ARRAY['assets','created_by'],
    ARRAY['asset_assignments','assigned_by'],
    ARRAY['asset_movements','moved_by'],
    ARRAY['asset_attachments','uploaded_by'],
    ARRAY['asset_disposals','recorded_by'],
    ARRAY['asset_disposals','approved_by'],
    ARRAY['notifications','user_id'],
    ARRAY['approval_requests','requested_by'],
    ARRAY['approval_requests','decided_by'],
    ARRAY['approval_requests','approved_by'],
    ARRAY['asset_imports','created_by'],
    ARRAY['asset_imports','uploaded_by'],
    ARRAY['user_notification_prefs','user_id'],
    ARRAY['depreciation_runs','triggered_by'],
    ARRAY['depreciation_overrides','created_by'],
    ARRAY['gate_passes','requested_by'],
    ARRAY['gate_passes','approver_id'],
    ARRAY['gate_passes','checked_out_by'],
    ARRAY['gate_passes','returned_by'],
    ARRAY['document_templates','updated_by'],
    ARRAY['asset_verifications','verified_by']
  ]
  LOOP
    source_table := spec[1];
    source_column := spec[2];

    IF to_regclass('public.' || source_table) IS NOT NULL
       AND EXISTS (
         SELECT 1
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = source_table
           AND column_name = source_column
       )
    THEN
      trigger_name := 'tenant_user_ref_' || source_table || '_' || source_column;
      EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', trigger_name, source_table);
      EXECUTE format(
        'CREATE TRIGGER %I BEFORE INSERT OR UPDATE OF %I, tenant_id ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.enforce_same_tenant_reference(%L,%L)',
        trigger_name, source_column, source_table, 'profiles', source_column
      );
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.notify_on_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  v_beep boolean;
  v_in_app boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_beep := (NEW.kind IN ('retirement','disposal','reactivation','set_for_disposal'));

    FOR r IN
      SELECT DISTINCT ur.user_id
      FROM public.user_roles ur
      JOIN public.profiles pr ON pr.id = ur.user_id
      WHERE ur.role IN ('admin','manager')
        AND pr.tenant_id = NEW.tenant_id
        AND pr.is_active = true
    LOOP
      SELECT COALESCE(pref.in_app, true)
      INTO v_in_app
      FROM (SELECT 1) s
      LEFT JOIN public.user_notification_prefs pref
        ON pref.user_id = r.user_id
       AND pref.tenant_id = NEW.tenant_id
       AND pref.approval_kind = NEW.kind;

      IF v_in_app THEN
        INSERT INTO public.notifications(
          tenant_id, user_id, type, title, body,
          entity_type, entity_id, requires_action, beep
        )
        VALUES (
          NEW.tenant_id,
          r.user_id,
          'approval_requested',
          'Approval needed: ' || NEW.kind,
          'A new ' || NEW.kind || ' request is pending approval.',
          'approval_requests',
          NEW.id,
          true,
          v_beep
        )
        ON CONFLICT DO NOTHING;
      END IF;
    END LOOP;

  ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.notifications(
      tenant_id, user_id, type, title, body,
      entity_type, entity_id, requires_action, beep
    )
    VALUES (
      NEW.tenant_id,
      NEW.requested_by,
      'approval_decided',
      'Your ' || NEW.kind || ' request was ' || NEW.status,
      COALESCE('Reason: ' || NULLIF(NEW.reason, ''), 'No reason provided.'),
      'approval_requests',
      NEW.id,
      false,
      true
    )
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

CREATE OR REPLACE FUNCTION public.enqueue_approval_reminders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  req record;
  r record;
  v_in_app boolean;
BEGIN
  FOR req IN
    SELECT *
    FROM public.approval_requests
    WHERE status = 'pending'
      AND kind IN ('movement','retirement','disposal')
      AND created_at < now() - interval '24 hours'
      AND (last_reminded_at IS NULL OR last_reminded_at < now() - interval '24 hours')
  LOOP
    FOR r IN
      SELECT DISTINCT ur.user_id
      FROM public.user_roles ur
      JOIN public.profiles pr ON pr.id = ur.user_id
      WHERE ur.role IN ('admin','manager')
        AND pr.tenant_id = req.tenant_id
        AND pr.is_active = true
    LOOP
      SELECT COALESCE(pref.in_app, true)
      INTO v_in_app
      FROM (SELECT 1) s
      LEFT JOIN public.user_notification_prefs pref
        ON pref.user_id = r.user_id
       AND pref.tenant_id = req.tenant_id
       AND pref.approval_kind = req.kind;

      IF v_in_app THEN
        INSERT INTO public.notifications(
          tenant_id, user_id, type, title, body,
          entity_type, entity_id, requires_action, beep
        )
        VALUES (
          req.tenant_id,
          r.user_id,
          'approval_reminder',
          'Reminder: ' || req.kind || ' awaiting approval',
          'A ' || req.kind || ' request has been pending for over 24 hours.',
          'approval_requests',
          req.id,
          true,
          true
        )
        ON CONFLICT DO NOTHING;
      END IF;
    END LOOP;

    UPDATE public.approval_requests
    SET last_reminded_at = now()
    WHERE id = req.id
      AND tenant_id = req.tenant_id;
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.notify_on_gate_pass()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  r record;
BEGIN
  IF TG_OP = 'INSERT' THEN
    FOR r IN
      SELECT DISTINCT candidate.user_id
      FROM (
        SELECT ur.user_id
        FROM public.user_roles ur
        WHERE ur.role IN ('admin','manager','security')
        UNION
        SELECT uar.user_id
        FROM public.user_action_rights uar
        WHERE uar.action_kind IN ('approve_gate_pass','verify_gate_pass')
      ) candidate
      JOIN public.profiles pr ON pr.id = candidate.user_id
      WHERE pr.tenant_id = NEW.tenant_id
        AND pr.is_active = true
    LOOP
      INSERT INTO public.notifications(
        tenant_id, user_id, type, title, body,
        entity_type, entity_id, requires_action, beep
      )
      VALUES (
        NEW.tenant_id,
        r.user_id,
        'gate_pass_requested',
        'New gate pass request',
        'A new gate pass is awaiting approval.',
        'gate_passes',
        NEW.id,
        true,
        true
      )
      ON CONFLICT DO NOTHING;
    END LOOP;

  ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.notifications(
      tenant_id, user_id, type, title, body,
      entity_type, entity_id, requires_action, beep
    )
    VALUES (
      NEW.tenant_id,
      NEW.requested_by,
      'gate_pass_' || NEW.status,
      'Your gate pass was ' || NEW.status,
      COALESCE('Pass: ' || NEW.pass_number, 'Status changed'),
      'gate_passes',
      NEW.id,
      false,
      true
    )
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.notify_on_failed_depreciation_run()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  r record;
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.status = 'failed')
     OR (TG_OP = 'UPDATE' AND NEW.status = 'failed' AND OLD.status IS DISTINCT FROM NEW.status)
  THEN
    FOR r IN
      SELECT DISTINCT ur.user_id
      FROM public.user_roles ur
      JOIN public.profiles pr ON pr.id = ur.user_id
      WHERE ur.role IN ('admin','manager')
        AND pr.tenant_id = NEW.tenant_id
        AND pr.is_active = true
    LOOP
      INSERT INTO public.notifications(
        tenant_id, user_id, type, title, body,
        entity_type, entity_id, requires_action, beep
      )
      VALUES (
        NEW.tenant_id,
        r.user_id,
        'depreciation_run_failed',
        'Depreciation run failed · ' || NEW.period_start || ' → ' || NEW.period_end,
        COALESCE(NULLIF(NEW.error_message, ''), NEW.notes, 'Run was marked failed.'),
        'depreciation_runs',
        NEW.id,
        false,
        true
      )
      ON CONFLICT DO NOTHING;
    END LOOP;

    IF NEW.triggered_by IS NOT NULL THEN
      INSERT INTO public.notifications(
        tenant_id, user_id, type, title, body,
        entity_type, entity_id, requires_action, beep
      )
      SELECT
        NEW.tenant_id,
        NEW.triggered_by,
        'depreciation_run_failed',
        'Your depreciation run failed · ' || NEW.period_start || ' → ' || NEW.period_end,
        COALESCE(NULLIF(NEW.error_message, ''), NEW.notes, 'Run was marked failed.'),
        'depreciation_runs',
        NEW.id,
        false,
        true
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.user_roles ur
        JOIN public.profiles pr ON pr.id = ur.user_id
        WHERE ur.user_id = NEW.triggered_by
          AND ur.role IN ('admin','manager')
          AND pr.tenant_id = NEW.tenant_id
      )
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

NOTIFY pgrst, 'reload schema';

COMMIT;
