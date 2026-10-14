CREATE TABLE IF NOT EXISTS public.saas_pricing_plans (
 id text PRIMARY KEY CHECK(id IN ('starter','business','enterprise')),
 name text NOT NULL,
 description text NOT NULL DEFAULT '',
 monthly_price numeric(15,2) NOT NULL CHECK(monthly_price>=0),
 annual_price numeric(15,2) NOT NULL CHECK(annual_price>=0),
 included_users integer NOT NULL CHECK(included_users>0),
 included_assets integer NOT NULL CHECK(included_assets>0),
 features jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(features)='array'),
 is_published boolean NOT NULL DEFAULT true,
 updated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.saas_pricing_plans FROM anon,authenticated;
GRANT ALL ON public.saas_pricing_plans TO service_role;
INSERT INTO public.saas_pricing_plans(id,name,description,monthly_price,annual_price,included_users,included_assets,features)
VALUES
('starter','Starter','For smaller teams starting an organised asset register',25,250,3,1000,'["Asset registration","Asset locations","Standard reports"]'::jsonb),
('business','Business','For growing teams managing assets across locations',59,590,10,10000,'["Everything in Starter","Asset verification","Depreciation","Register Builder","Custom reporting"]'::jsonb),
('enterprise','Enterprise','For organisations that need broader capacity and control',129,1290,25,50000,'["Everything in Business","Advanced reporting","Multi-branch operations","Priority support"]'::jsonb)
ON CONFLICT(id) DO NOTHING;
