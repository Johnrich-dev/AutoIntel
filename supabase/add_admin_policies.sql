-- Admin access policies for Supabase
-- Run this in Supabase SQL Editor to allow admin dashboard access

-- Allow authenticated users to view all applicants (admin access)
CREATE POLICY "Admin can view all applicants"
  ON applicants FOR SELECT
  USING (auth.role() = 'authenticated');

-- Allow authenticated users to view all resumes
CREATE POLICY "Admin can view all resumes"
  ON resumes FOR SELECT
  USING (auth.role() = 'authenticated');

-- Allow authenticated users to view all video assessments
CREATE POLICY "Admin can view all video assessments"
  ON video_assessments FOR SELECT
  USING (auth.role() = 'authenticated');

-- Allow authenticated users to view all personality tests
CREATE POLICY "Admin can view all personality tests"
  ON personality_tests FOR SELECT
  USING (auth.role() = 'authenticated');

-- Allow authenticated users to insert admin actions
CREATE POLICY "Admin can insert admin actions"
  ON admin_actions FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Allow authenticated users to view admin actions
CREATE POLICY "Admin can view admin actions"
  ON admin_actions FOR SELECT
  USING (auth.role() = 'authenticated');
