
-- 1. Per-user notification preferences
CREATE TABLE IF NOT EXISTS public.user_notification_prefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  approval_kind text NOT NULL,
  in_app boolean NOT NULL DEFAULT true,
  email boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, approval_kind)
);

ALTER TABLE public.user_notification_prefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own prefs or admin"
  ON public.user_notification_prefs FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "users upsert own prefs"
  ON public.user_notification_prefs FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "users update own prefs"
  ON public.user_notification_prefs FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "users delete own prefs"
  ON public.user_notification_prefs FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_user_notification_prefs_updated
  BEFORE UPDATE ON public.user_notification_prefs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 2. Update notify_on_approval to respect user prefs (in_app default true)
CREATE OR REPLACE FUNCTION public.notify_on_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE r record; v_beep boolean; v_in_app boolean;
BEGIN
  IF tg_op = 'INSERT' THEN
    v_beep := (new.kind IN ('retirement','disposal','reactivation','set_for_disposal'));
    FOR r IN SELECT ur.user_id FROM public.user_roles ur WHERE ur.role IN ('admin','manager') LOOP
      -- respect per-user prefs; absence means default-on
      SELECT COALESCE(p.in_app, true) INTO v_in_app
        FROM (SELECT 1) s
        LEFT JOIN public.user_notification_prefs p
               ON p.user_id = r.user_id AND p.approval_kind = new.kind;
      IF v_in_app THEN
        INSERT INTO public.notifications(user_id, type, title, body, entity_type, entity_id, requires_action, beep)
        VALUES (r.user_id, 'approval_requested', 'Approval needed: ' || new.kind,
                'A new ' || new.kind || ' request is pending approval.',
                'approval_requests', new.id, true, v_beep);
      END IF;
    END LOOP;
  ELSIF tg_op = 'UPDATE' AND old.status IS DISTINCT FROM new.status THEN
    INSERT INTO public.notifications(user_id, type, title, body, entity_type, entity_id, requires_action, beep)
    VALUES (new.requested_by, 'approval_decided',
            'Your ' || new.kind || ' request was ' || new.status,
            COALESCE('Reason: ' || NULLIF(new.reason, ''), 'No reason provided.'),
            'approval_requests', new.id, false, true);
  END IF;
  RETURN COALESCE(new, old);
END; $function$;

-- 3. Reminder column + function
ALTER TABLE public.approval_requests
  ADD COLUMN IF NOT EXISTS last_reminded_at timestamptz;

CREATE OR REPLACE FUNCTION public.enqueue_approval_reminders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE req record; r record; v_in_app boolean;
BEGIN
  FOR req IN
    SELECT * FROM public.approval_requests
     WHERE status = 'pending'
       AND kind IN ('movement','retirement','disposal')
       AND created_at < now() - interval '24 hours'
       AND (last_reminded_at IS NULL OR last_reminded_at < now() - interval '24 hours')
  LOOP
    FOR r IN SELECT ur.user_id FROM public.user_roles ur WHERE ur.role IN ('admin','manager') LOOP
      SELECT COALESCE(p.in_app, true) INTO v_in_app
        FROM (SELECT 1) s
        LEFT JOIN public.user_notification_prefs p
               ON p.user_id = r.user_id AND p.approval_kind = req.kind;
      IF v_in_app THEN
        INSERT INTO public.notifications(user_id, type, title, body, entity_type, entity_id, requires_action, beep)
        VALUES (r.user_id, 'approval_reminder',
                'Reminder: ' || req.kind || ' awaiting approval',
                'A ' || req.kind || ' request has been pending for over 24 hours.',
                'approval_requests', req.id, true, true);
      END IF;
    END LOOP;
    UPDATE public.approval_requests SET last_reminded_at = now() WHERE id = req.id;
  END LOOP;
END; $$;

-- 4. Schedule hourly reminder
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'approval-reminders-hourly') THEN
    PERFORM cron.unschedule('approval-reminders-hourly');
  END IF;
  PERFORM cron.schedule(
    'approval-reminders-hourly',
    '0 * * * *',
    $cron$ SELECT public.enqueue_approval_reminders(); $cron$
  );
END $$;
