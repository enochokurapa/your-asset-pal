-- Permanent, per-activation receipt numbering. The numeric tail is cumulative,
-- not reset each calendar day, while the prefix captures the Kampala issue date.
-- Older UUID-based documents are historical and are deliberately left unchanged.
CREATE SEQUENCE IF NOT EXISTS public.assetflow_receipt_number_seq
  AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 NO MAXVALUE CACHE 1;

CREATE TABLE IF NOT EXISTS public.assetflow_receipt_registry (
  event_key text PRIMARY KEY,
  sequence_no bigint NOT NULL UNIQUE,
  receipt_no text NOT NULL UNIQUE,
  issued_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT af_receipt_event_key_nonempty CHECK (char_length(event_key) BETWEEN 8 AND 250),
  CONSTRAINT af_receipt_number_format CHECK (receipt_no ~ '^AF[0-9]{12,}$')
);

CREATE INDEX IF NOT EXISTS idx_assetflow_receipt_issued_at
  ON public.assetflow_receipt_registry(issued_at DESC);

-- Numbers are issued only by the trusted server-side PostgreSQL connection.
REVOKE ALL ON public.assetflow_receipt_registry FROM PUBLIC;
REVOKE ALL ON SEQUENCE public.assetflow_receipt_number_seq FROM PUBLIC;
