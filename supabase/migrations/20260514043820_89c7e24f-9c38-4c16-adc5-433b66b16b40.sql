ALTER TABLE public.locations
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.locations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS locations_parent_id_idx ON public.locations(parent_id);