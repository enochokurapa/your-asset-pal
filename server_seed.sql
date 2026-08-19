-- Insert tesobrain@gmail.com into auth.users
INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  email_change,
  email_change_token_new,
  recovery_token
)
VALUES (
  '00000000-0000-0000-0000-000000000000',
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  'authenticated',
  'authenticated',
  'tesobrain@gmail.com',
  '$2b$10$yPJrTzxg8QZN5igtJX5ZDeOl87RDTgsT4XR6BvCLCyuR/jQulNESy',
  NOW(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Default Admin User"}'::jsonb,
  NOW(),
  NOW(),
  '', '', '', ''
) ON CONFLICT (id) DO UPDATE SET encrypted_password = '$2b$10$yPJrTzxg8QZN5igtJX5ZDeOl87RDTgsT4XR6BvCLCyuR/jQulNESy';

INSERT INTO auth.identities (
  id,
  user_id,
  identity_data,
  provider,
  last_sign_in_at,
  created_at,
  updated_at,
  provider_id
)
VALUES (
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  '{"sub":"a1b2c3d4-e5f6-7890-abcd-ef1234567890","email":"tesobrain@gmail.com"}'::jsonb,
  'email',
  NOW(),
  NOW(),
  NOW(),
  'tesobrain@gmail.com'
) ON CONFLICT (provider_id, provider) DO NOTHING;

INSERT INTO public.user_roles (user_id, role)
VALUES ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;


-- Insert bangella23@gmail.com into auth.users
INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  email_change,
  email_change_token_new,
  recovery_token
)
VALUES (
  '00000000-0000-0000-0000-000000000000',
  'd0d4fb77-2f58-4ee0-8bde-d2cc03fdf526',
  'authenticated',
  'authenticated',
  'bangella23@gmail.com',
  '$2b$10$yPJrTzxg8QZN5igtJX5ZDeOl87RDTgsT4XR6BvCLCyuR/jQulNESy',
  NOW(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Demo User"}'::jsonb,
  NOW(),
  NOW(),
  '', '', '', ''
) ON CONFLICT (id) DO UPDATE SET encrypted_password = '$2b$10$yPJrTzxg8QZN5igtJX5ZDeOl87RDTgsT4XR6BvCLCyuR/jQulNESy';

INSERT INTO auth.identities (
  id,
  user_id,
  identity_data,
  provider,
  last_sign_in_at,
  created_at,
  updated_at,
  provider_id
)
VALUES (
  'd0d4fb77-2f58-4ee0-8bde-d2cc03fdf526',
  'd0d4fb77-2f58-4ee0-8bde-d2cc03fdf526',
  '{"sub":"d0d4fb77-2f58-4ee0-8bde-d2cc03fdf526","email":"bangella23@gmail.com"}'::jsonb,
  'email',
  NOW(),
  NOW(),
  NOW(),
  'bangella23@gmail.com'
) ON CONFLICT (provider_id, provider) DO NOTHING;

INSERT INTO public.user_roles (user_id, role)
VALUES ('d0d4fb77-2f58-4ee0-8bde-d2cc03fdf526', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;
