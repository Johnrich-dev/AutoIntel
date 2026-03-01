-- Step 1: Enable RLS on tables
ALTER TABLE IF EXISTS public.applicants ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.resumes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.video_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.personality_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.admin_actions ENABLE ROW LEVEL SECURITY;

-- Step 2: Drop any existing policies (best-effort cleanup)
DO $$
DECLARE
    r record;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename IN ('applicants','resumes','video_assessments','personality_tests','admin_actions')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I;', r.policyname, r.schemaname, r.tablename);
  END LOOP;
END$$;

-- Step 3: Create indexes for RLS performance
CREATE INDEX IF NOT EXISTS idx_applicants_user_id ON public.applicants(user_id);
CREATE INDEX IF NOT EXISTS idx_resumes_applicant_id ON public.resumes(applicant_id);
CREATE INDEX IF NOT EXISTS idx_video_applicant_id ON public.video_assessments(applicant_id);
CREATE INDEX IF NOT EXISTS idx_personality_applicant_id ON public.personality_tests(applicant_id);
CREATE INDEX IF NOT EXISTS idx_admin_actions_performed_by ON public.admin_actions(performed_by);

-- Step 4: Applicants policies
-- Owner can select their own record (via user_id link to auth.users)
CREATE POLICY applicants_owner_select ON public.applicants
  FOR SELECT TO authenticated
  USING (
    user_id IS NOT NULL 
    AND (SELECT auth.uid()) = user_id
  );

-- Admin can do everything
CREATE POLICY applicants_admin_all ON public.applicants
  FOR ALL TO authenticated
  USING ((auth.jwt() ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() ->> 'role') = 'admin');

-- Step 5: Resumes policies
-- Owner can select their own resume (via applicant_id -> applicants -> user_id)
CREATE POLICY resumes_owner_select ON public.resumes
  FOR SELECT TO authenticated
  USING (
    applicant_id IN (
      SELECT id FROM applicants 
      WHERE user_id = (SELECT auth.uid())
    )
  );

-- Owner can insert resume for themselves
CREATE POLICY resumes_owner_insert ON public.resumes
  FOR INSERT TO authenticated
  WITH CHECK (
    applicant_id IN (
      SELECT id FROM applicants 
      WHERE user_id = (SELECT auth.uid())
    )
  );

-- Owner can update their own resume
CREATE POLICY resumes_owner_update ON public.resumes
  FOR UPDATE TO authenticated
  USING (
    applicant_id IN (
      SELECT id FROM applicants 
      WHERE user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    applicant_id IN (
      SELECT id FROM applicants 
      WHERE user_id = (SELECT auth.uid())
    )
  );

-- Admin can do everything with resumes
CREATE POLICY resumes_admin_all ON public.resumes
  FOR ALL TO authenticated
  USING ((auth.jwt() ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() ->> 'role') = 'admin');

-- Step 6: Video assessments policies
CREATE POLICY video_owner_select ON public.video_assessments
  FOR SELECT TO authenticated
  USING (
    applicant_id IN (
      SELECT id FROM applicants 
      WHERE user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY video_owner_insert ON public.video_assessments
  FOR INSERT TO authenticated
  WITH CHECK (
    applicant_id IN (
      SELECT id FROM applicants 
      WHERE user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY video_owner_update ON public.video_assessments
  FOR UPDATE TO authenticated
  USING (
    applicant_id IN (
      SELECT id FROM applicants 
      WHERE user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    applicant_id IN (
      SELECT id FROM applicants 
      WHERE user_id = (SELECT auth.uid())
    )
  );

-- Admin override for video_assessments
CREATE POLICY video_admin_all ON public.video_assessments
  FOR ALL TO authenticated
  USING ((auth.jwt() ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() ->> 'role') = 'admin');

-- Step 7: Personality tests policies
CREATE POLICY personality_owner_select ON public.personality_tests
  FOR SELECT TO authenticated
  USING (
    applicant_id IN (
      SELECT id FROM applicants 
      WHERE user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY personality_owner_insert ON public.personality_tests
  FOR INSERT TO authenticated
  WITH CHECK (
    applicant_id IN (
      SELECT id FROM applicants 
      WHERE user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY personality_owner_update ON public.personality_tests
  FOR UPDATE TO authenticated
  USING (
    applicant_id IN (
      SELECT id FROM applicants 
      WHERE user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    applicant_id IN (
      SELECT id FROM applicants 
      WHERE user_id = (SELECT auth.uid())
    )
  );

-- Admin override for personality_tests
CREATE POLICY personality_admin_all ON public.personality_tests
  FOR ALL TO authenticated
  USING ((auth.jwt() ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() ->> 'role') = 'admin');

-- Step 8: Admin actions policies (only admins can manage)
CREATE POLICY admin_actions_admin_select ON public.admin_actions
  FOR SELECT TO authenticated
  USING ((auth.jwt() ->> 'role') = 'admin');

CREATE POLICY admin_actions_admin_insert ON public.admin_actions
  FOR INSERT TO authenticated
  WITH CHECK (
    (auth.jwt() ->> 'role') = 'admin' 
    AND (performed_by IS NULL OR (SELECT auth.uid()) = performed_by)
  );

CREATE POLICY admin_actions_admin_update ON public.admin_actions
  FOR UPDATE TO authenticated
  USING ((auth.jwt() ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() ->> 'role') = 'admin');

CREATE POLICY admin_actions_admin_delete ON public.admin_actions
  FOR DELETE TO authenticated
  USING ((auth.jwt() ->> 'role') = 'admin');

-- Comments for documentation
COMMENT ON TABLE public.applicants IS 'RLS: owner via user_id, admin override';
COMMENT ON TABLE public.resumes IS 'RLS: owner via applicant->user_id, admin override';
COMMENT ON TABLE public.video_assessments IS 'RLS: owner via applicant->user_id, admin override';
COMMENT ON TABLE public.personality_tests IS 'RLS: owner via applicant->user_id, admin override';
COMMENT ON TABLE public.admin_actions IS 'RLS: admin only';
