-- Add missing permissions to existing setup
-- Run this to fix the login issue

-- Grant execute on the function
GRANT EXECUTE ON FUNCTION verify_admin_password TO anon;
GRANT EXECUTE ON FUNCTION verify_admin_password TO authenticated;

-- Verify the user exists
SELECT id, email, name, role FROM admin_users WHERE email = 'admin@autointel.com';

-- Test the function (this should work now)
SELECT * FROM verify_admin_password('admin@autointel.com', 'Admin@123456');