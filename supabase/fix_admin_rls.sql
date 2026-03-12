-- Fix RLS policy for scoring_settings to allow service_role to bypass RLS
-- The admin client uses service_role key which bypasses RLS by default
-- But we need to ensure policies don't block it

-- Drop existing policies
DROP POLICY IF EXISTS "Anyone can view scoring settings" ON scoring_settings;
DROP POLICY IF EXISTS "Authenticated users can manage scoring settings" ON scoring_settings;

-- Allow service_role to do everything (bypasses RLS automatically)
-- This is the Supabase default behavior but let's be explicit
CREATE POLICY "service_role full access"
ON scoring_settings FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Allow anyone (anon and authenticated) to SELECT
CREATE POLICY "Anyone can view scoring settings"
ON scoring_settings FOR SELECT
TO anon, authenticated
USING (true);

-- Allow authenticated users to UPDATE/INSERT/DELETE
CREATE POLICY "Authenticated users can manage scoring settings"
ON scoring_settings FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- Verify policies
SELECT policyname, cmd, roles 
FROM pg_policies 
WHERE tablename = 'scoring_settings';
