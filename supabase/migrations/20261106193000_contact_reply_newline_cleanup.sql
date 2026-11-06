-- Restore normal paragraph breaks in legacy SQL-seeded support templates.
-- Convert only saved escaped line breaks; never change customer messages.
UPDATE public.platform_contact_templates
SET body=replace(body,chr(92)||'n',chr(10)),updated_at=NOW()
WHERE title IN ('Acknowledgement','Information requested','Resolved')
  AND position(chr(92)||'n' in body)>0;
-- The previously failed outbound attempts were never accepted by the SMTP
-- service. Make their stored history readable without creating new sends.
UPDATE public.platform_contact_messages
SET body=replace(body,chr(92)||'n',chr(10))
WHERE delivery_status='failed' AND position(chr(92)||'n' in body)>0;
