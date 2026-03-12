-- Fix RLS policy for scoring_settings to allow authenticated users to read
-- The current policy requires authenticated role but frontend uses anon key

-- First, drop existing policies
DROP POLICY IF EXISTS "Scoring settings are viewable by authenticated users" ON scoring_settings;
DROP POLICY IF EXISTS "Scoring settings can be managed by admins" ON scoring_settings;

-- Allow anyone (both anon and authenticated) to SELECT scoring settings
-- This is needed because the frontend uses anon key
CREATE POLICY "Anyone can view scoring settings"
ON scoring_settings FOR SELECT
TO anon, authenticated
USING (true);

-- Allow authenticated users to UPDATE scoring settings (admins)
CREATE POLICY "Authenticated users can manage scoring settings"
ON scoring_settings FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- Also enable RLS if not already enabled
ALTER TABLE scoring_settings ENABLE ROW LEVEL SECURITY;

-- Verify the policies
SELECT policyname, cmd, qual, with_check 
FROM pg_policies 
WHERE tablename = 'scoring_settings';
