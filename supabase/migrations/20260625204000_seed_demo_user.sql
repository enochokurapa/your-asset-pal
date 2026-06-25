-- Insert demo user into auth.users if they don't already exist
INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  recovery_sent_at,
  last_sign_in_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  email_change,
  email_change_token_new,
  recovery_token
)
SELECT
  '00000000-0000-0000-0000-000000000000',
  'd0d4fb77-2f58-4ee0-8bde-d2cc03fdf526',
  'authenticated',
  'authenticated',
  'bangella23@gmail.com',
  '$2a$12$UJ8wCnRS9oqTVNQR6/paaOFEsD/muu1i5q6BQ.lv3SC7WzYB/GPfy',
  NOW(),
  NULL,
  NULL,
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Demo User"}'::jsonb,
  NOW(),
  NOW(),
  '',
  '',
  '',
  ''
WHERE NOT EXISTS (
  SELECT 1 FROM auth.users WHERE email = 'bangella23@gmail.com'
);

-- The 'on_auth_user_created' trigger automatically adds the profile and a default role.
-- We want to ensure the demo user is specifically an 'admin'.
DELETE FROM public.user_roles WHERE user_id = 'd0d4fb77-2f58-4ee0-8bde-d2cc03fdf526';
INSERT INTO public.user_roles (user_id, role)
VALUES ('d0d4fb77-2f58-4ee0-8bde-d2cc03fdf526', 'admin');
