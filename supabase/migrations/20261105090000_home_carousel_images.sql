-- Each homepage carousel slide has an independently replaceable background.
-- Existing home artwork remains slide 1; slide 2 and 3 use the bundled
-- lightweight WebP illustrations until a SaaS admin uploads replacements.
ALTER TABLE public.platform_hero_images
  DROP CONSTRAINT IF EXISTS platform_hero_images_page_check;
ALTER TABLE public.platform_hero_images
  ADD CONSTRAINT platform_hero_images_page_check
  CHECK (page IN ('home','home_2','home_3','features','solutions','pricing','about'));

NOTIFY pgrst, 'reload schema';
