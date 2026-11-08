BEGIN;
CREATE TABLE IF NOT EXISTS public.platform_partner_logos(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 name varchar(80) NOT NULL,
 logo_data_url text NOT NULL,
 is_active boolean NOT NULL DEFAULT true,
 sort_order integer NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT partner_logo_format CHECK(logo_data_url ~ '^data:image/(png|webp|jpeg);base64,[A-Za-z0-9+/=]+$'),
 CONSTRAINT partner_order CHECK(sort_order BETWEEN 0 AND 9999)
);
REVOKE ALL ON public.platform_partner_logos FROM PUBLIC,anon,authenticated;
COMMIT;
