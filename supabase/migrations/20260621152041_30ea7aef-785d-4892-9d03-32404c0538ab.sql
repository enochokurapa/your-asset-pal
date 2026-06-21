REVOKE EXECUTE ON FUNCTION public.delete_asset_cascade(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.notify_on_gate_pass() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.write_audit() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_on_approval() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enqueue_approval_reminders() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_for_disposal(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_asset_cascade(uuid) TO authenticated;