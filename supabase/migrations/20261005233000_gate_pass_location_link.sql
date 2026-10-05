-- Connect gate passes to managed locations without breaking free-text external destinations.
ALTER TABLE public.gate_passes
  ADD COLUMN IF NOT EXISTS destination_location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS movement_type text NOT NULL DEFAULT 'temporary',
  ADD COLUMN IF NOT EXISTS contact_person text,
  ADD COLUMN IF NOT EXISTS contact_phone text;

DO $$ BEGIN
  ALTER TABLE public.gate_passes ADD CONSTRAINT gate_pass_movement_type_check
    CHECK (movement_type IN ('temporary','transfer','repair','fieldwork','other'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_gate_pass_destination_location
  ON public.gate_passes(destination_location_id);

NOTIFY pgrst, 'reload schema';
