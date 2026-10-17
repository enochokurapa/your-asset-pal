-- Session takeover is opt-in after credential verification. Do not expose device IPs.
CREATE OR REPLACE FUNCTION public.other_login_sessions()
RETURNS TABLE(session_id uuid, device text, last_seen timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path=auth,public
AS $$
 SELECT s.id, left(coalesce(s.user_agent,'Unknown device'),120),
        coalesce(s.refreshed_at,s.updated_at,s.created_at)
 FROM auth.sessions s
 WHERE s.user_id=auth.uid()
   AND s.id IS DISTINCT FROM nullif(auth.jwt()->>'session_id','')::uuid
 ORDER BY coalesce(s.refreshed_at,s.updated_at,s.created_at) DESC
 LIMIT 20;
$$;
CREATE OR REPLACE FUNCTION public.replace_other_login_sessions()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=auth,public AS $$
DECLARE current_id uuid := nullif(auth.jwt()->>'session_id','')::uuid;
DECLARE removed integer;
BEGIN
 IF auth.uid() IS NULL OR current_id IS NULL OR NOT EXISTS
   (SELECT 1 FROM auth.sessions WHERE id=current_id AND user_id=auth.uid())
 THEN RAISE EXCEPTION 'Current session not verified'; END IF;
 DELETE FROM auth.sessions WHERE user_id=auth.uid() AND id<>current_id;
 GET DIAGNOSTICS removed=ROW_COUNT;
 RETURN removed;
END $$;
CREATE OR REPLACE FUNCTION public.current_login_session_valid()
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=auth,public STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM auth.sessions
  WHERE id=nullif(auth.jwt()->>'session_id','')::uuid AND user_id=auth.uid());
$$;
REVOKE ALL ON FUNCTION public.other_login_sessions() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.replace_other_login_sessions() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_login_session_valid() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.other_login_sessions() TO authenticated;
GRANT EXECUTE ON FUNCTION public.replace_other_login_sessions() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_login_session_valid() TO authenticated;
