-- Create Admin User
-- Run this SQL in Supabase SQL Editor to create an admin user
-- After running, use these credentials to log in:
-- Email: admin@autointel.com
-- Password: Admin@123456

-- This uses Supabase's internal function to create a user with hashed password
-- The password here is: Admin@123456

SELECT 
  auth.users.id,
  auth.users.email,
  auth.users.created_at,
  auth.users.email_confirmed_at
WHERE email = 'admin@autointel.com';

-- If no user exists, create one (run this separately if user doesn't exist)
-- Note: You need to use the service_role key or run this in the Supabase Dashboard SQL editor
-- The following creates a user directly (requires service_role privileges):

-- Insert into auth.users table
INSERT INTO auth.users (
  id,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  raw_user_meta_data
) VALUES (
  gen_random_uuid(),
  'admin@autointel.com',
  -- This is the bcrypt hash of "Admin@123456" - DO NOT use in production without proper hashing
  -- Instead, use the Supabase Admin API or Dashboard to create users
  '$2a$10$abcdefghijklmnopqrstuvwxyz', -- placeholder, will be replaced
  now(),
  now(),
  now(),
  '{"role": "admin"}'::jsonb
) ON CONFLICT (email) DO NOTHING;

-- NOTE: The password hashing method above is not secure for production.
-- For a quick test, use the Supabase Dashboard:
-- 1. Go to Authentication -> Users
-- 2. Click "Add user"
-- 3. Enter email: admin@autointel.com
-- 4. Enter password: Admin@123456
-- 5. Toggle "Email confirm" to ON
-- 6. Click "Create user"

-- Alternative: Use the Supabase CLI to create a user:
-- supabase users create --email admin@autointel.com --password Admin@123456