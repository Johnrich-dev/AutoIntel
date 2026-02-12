-- Fix script to reset test tokens
-- Run this in Supabase SQL Editor to fix the token issue

-- 1. Delete any existing test data
DELETE FROM applicants WHERE access_token IN ('token_john_123', 'token_jane_456', 'token_bob_789');

-- 2. Insert fresh test data
INSERT INTO applicants (email, name, position, access_token, access_expires_at, rules_accepted, rules_accepted_at, created_at)
VALUES
  ('john.doe@example.com', 'John Doe', 'Software Engineer', 'token_john_123', now() + interval '2 days', true, now(), now()),
  ('jane.smith@example.com', 'Jane Smith', 'Product Manager', 'token_jane_456', now() + interval '2 days', false, NULL, now()),
  ('bob.wilson@example.com', 'Bob Wilson', 'Data Scientist', 'token_bob_789', now() + interval '2 days', false, NULL, now());

-- 3. Verify the data
SELECT id, email, name, position, access_token, access_expires_at, rules_accepted FROM applicants WHERE access_token IN ('token_john_123', 'token_jane_456', 'token_bob_789');
