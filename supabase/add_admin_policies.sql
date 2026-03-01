-- Admin access policies for Supabase
-- Run this in Supabase SQL Editor to allow admin dashboard access

-- Allow anyone to view all applicants (prototype - no admin auth required)
CREATE POLICY "Anyone can view all applicants"
  ON applicants FOR SELECT
  TO anon, authenticated
  USING (true);

-- Allow anyone to view all resumes
CREATE POLICY "Anyone can view all resumes"
  ON resumes FOR SELECT
  TO anon, authenticated
  USING (true);

-- Allow anyone to view all video assessments
CREATE POLICY "Anyone can view all video assessments"
  ON video_assessments FOR SELECT
  TO anon, authenticated
  USING (true);

-- Allow anyone to view all personality tests
CREATE POLICY "Anyone can view all personality tests"
  ON personality_tests FOR SELECT
  TO anon, authenticated
  USING (true);

-- Allow anyone to insert admin actions
CREATE POLICY "Anyone can insert admin actions"
  ON admin_actions FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Allow anyone to view admin actions
CREATE POLICY "Anyone can view admin actions"
  ON admin_actions FOR SELECT
  TO anon, authenticated
  USING (true);
