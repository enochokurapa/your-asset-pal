-- Prevent repeated clicks or duplicate role rows from flooding approvers with
-- identical notifications.

-- Remove notifications attached to duplicate pending deletion requests, then
-- retain only the oldest pending request for each asset.
WITH ranked AS (
  SELECT id, row_number() OVER (
    PARTITION BY asset_id, kind ORDER BY created_at, id
  ) AS rn
  FROM public.approval_requests
  WHERE status = 'pending' AND kind = 'deletion' AND asset_id IS NOT NULL
)
DELETE FROM public.notifications n
USING ranked r
WHERE r.rn > 1
  AND n.entity_type = 'approval_requests'
  AND n.entity_id = r.id;

WITH ranked AS (
  SELECT id, row_number() OVER (
    PARTITION BY asset_id, kind ORDER BY created_at, id
  ) AS rn
  FROM public.approval_requests
  WHERE status = 'pending' AND kind = 'deletion' AND asset_id IS NOT NULL
)
DELETE FROM public.approval_requests a
USING ranked r
WHERE r.rn > 1 AND a.id = r.id;

CREATE UNIQUE INDEX IF NOT EXISTS approval_one_pending_deletion_per_asset
  ON public.approval_requests(asset_id, kind)
  WHERE status = 'pending' AND kind = 'deletion' AND asset_id IS NOT NULL;

-- Collapse existing exact duplicates before enforcing one notification of each
-- type per request and recipient.
WITH ranked AS (
  SELECT id, row_number() OVER (
    PARTITION BY user_id, type, entity_type, entity_id
    ORDER BY created_at, id
  ) AS rn
  FROM public.notifications
  WHERE entity_id IS NOT NULL
)
DELETE FROM public.notifications n
USING ranked r
WHERE r.rn > 1 AND n.id = r.id;

CREATE UNIQUE INDEX IF NOT EXISTS notifications_one_type_per_entity_user
  ON public.notifications(user_id, type, entity_type, entity_id)
  WHERE entity_id IS NOT NULL;

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
    FOR r IN
      SELECT DISTINCT ur.user_id
      FROM public.user_roles ur
      WHERE ur.role IN ('admin','manager')
    LOOP
      SELECT COALESCE(p.in_app, true) INTO v_in_app
        FROM (SELECT 1) s
        LEFT JOIN public.user_notification_prefs p
          ON p.user_id = r.user_id AND p.approval_kind = new.kind;
      IF v_in_app THEN
        INSERT INTO public.notifications(user_id, type, title, body, entity_type, entity_id, requires_action, beep)
        VALUES (r.user_id, 'approval_requested', 'Approval needed: ' || new.kind,
                'A new ' || new.kind || ' request is pending approval.',
                'approval_requests', new.id, true, v_beep)
        ON CONFLICT DO NOTHING;
      END IF;
    END LOOP;
  ELSIF tg_op = 'UPDATE' AND old.status IS DISTINCT FROM new.status THEN
    INSERT INTO public.notifications(user_id, type, title, body, entity_type, entity_id, requires_action, beep)
    VALUES (new.requested_by, 'approval_decided',
            'Your ' || new.kind || ' request was ' || new.status,
            COALESCE('Reason: ' || NULLIF(new.reason, ''), 'No reason provided.'),
            'approval_requests', new.id, false, true)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN COALESCE(new, old);
END; $function$;

NOTIFY pgrst, 'reload schema';
