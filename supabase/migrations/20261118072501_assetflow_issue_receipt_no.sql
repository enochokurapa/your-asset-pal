-- Atomic idempotent issuance: same activation event always keeps the same number.
-- The global sequence is never reset when the local calendar date changes.
CREATE OR REPLACE FUNCTION public.assetflow_issue_receipt_no(p_event_key text)
RETURNS TABLE(receipt_no text,issued_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog,public
AS $$
DECLARE
  v_next bigint;
  v_receipt text;
BEGIN
  IF p_event_key IS NULL OR char_length(p_event_key) NOT BETWEEN 8 AND 250 THEN
    RAISE EXCEPTION 'Invalid activation event key';
  END IF;
  -- Only one issuer can allocate for a particular activation at a time.
  PERFORM pg_advisory_xact_lock(26011,hashtext(p_event_key));
  RETURN QUERY SELECT r.receipt_no,r.issued_at
    FROM public.assetflow_receipt_registry r WHERE r.event_key=p_event_key;
  IF FOUND THEN RETURN; END IF;
  v_next:=nextval('public.assetflow_receipt_number_seq');
  v_receipt:='AF'||to_char(now() AT TIME ZONE 'Africa/Kampala','YYYYMMDD')||
             lpad(v_next::text,GREATEST(4,char_length(v_next::text)),'0');
  INSERT INTO public.assetflow_receipt_registry(event_key,sequence_no,receipt_no)
    VALUES(p_event_key,v_next,v_receipt);
  RETURN QUERY SELECT r.receipt_no,r.issued_at
    FROM public.assetflow_receipt_registry r WHERE r.event_key=p_event_key;
END
$$;
REVOKE ALL ON FUNCTION public.assetflow_issue_receipt_no(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assetflow_issue_receipt_no(text) FROM anon,authenticated;
