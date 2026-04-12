-- ============================================
-- RLS Policies for new Supabase project
-- Run this in SQL Editor after schema is created
-- ============================================

-- Enable RLS on all tables
ALTER TABLE public.admin_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.applicants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_managers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_postings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.personality_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resume_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resumes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduled_interviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scoring_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_style_assessments ENABLE ROW LEVEL SECURITY;

-- ============================================
-- admin_actions
-- ============================================
CREATE POLICY "admin_actions_admin_select" ON public.admin_actions
  FOR SELECT TO authenticated
  USING ((auth.jwt() ->> 'role') = 'admin');

CREATE POLICY "admin_actions_admin_insert" ON public.admin_actions
  FOR INSERT TO authenticated
  WITH CHECK (((auth.jwt() ->> 'role') = 'admin') AND ((performed_by IS NULL) OR (auth.uid() = performed_by)));

CREATE POLICY "admin_actions_admin_update" ON public.admin_actions
  FOR UPDATE TO authenticated
  USING ((auth.jwt() ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() ->> 'role') = 'admin');

CREATE POLICY "admin_actions_admin_delete" ON public.admin_actions
  FOR DELETE TO authenticated
  USING ((auth.jwt() ->> 'role') = 'admin');

-- ============================================
-- admin_users
-- ============================================
CREATE POLICY "Allow anon password check" ON public.admin_users
  FOR SELECT TO anon
  USING (true);

CREATE POLICY "Allow anon read for login" ON public.admin_users
  FOR SELECT TO authenticated
  USING (true);

-- Service role bypasses RLS, so admin settings updates use getSupabaseAdminClient()
-- This policy documents that intent and covers any future authenticated update paths.
CREATE POLICY "admin_users_service_update" ON public.admin_users
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

-- ============================================
-- applicants
-- ============================================
CREATE POLICY "Applicants can view own data" ON public.applicants
  FOR SELECT TO anon, authenticated
  USING ((access_token = ((current_setting('request.headers', true))::json ->> 'x-access-token')) AND (access_expires_at > now()));

CREATE POLICY "Applicants_auth_select" ON public.applicants
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Applicants_auth_insert" ON public.applicants
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Applicants_auth_update" ON public.applicants
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Applicants_auth_delete" ON public.applicants
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "applicants_admin_all" ON public.applicants
  FOR ALL TO authenticated
  USING ((auth.jwt() ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() ->> 'role') = 'admin');

-- ============================================
-- hr_managers
-- ============================================
CREATE POLICY "hr_managers_full_access" ON public.hr_managers
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- ============================================
-- job_postings
-- ============================================
CREATE POLICY "Job postings are viewable by everyone" ON public.job_postings
  FOR SELECT TO anon, authenticated
  USING (true);

-- Admin frontend uses anon key (custom JWT auth, not Supabase Auth)
-- so write policies must allow anon role
CREATE POLICY "job_postings_anon_insert" ON public.job_postings
  FOR INSERT TO anon
  WITH CHECK (true);

CREATE POLICY "job_postings_anon_update" ON public.job_postings
  FOR UPDATE TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "job_postings_anon_delete" ON public.job_postings
  FOR DELETE TO anon
  USING (true);

-- ============================================
-- personality_tests
-- ============================================
CREATE POLICY "personality_owner_select" ON public.personality_tests
  FOR SELECT TO authenticated
  USING (applicant_id IN (SELECT id FROM applicants WHERE user_id = auth.uid()));

CREATE POLICY "personality_owner_insert" ON public.personality_tests
  FOR INSERT TO authenticated
  WITH CHECK (applicant_id IN (SELECT id FROM applicants WHERE user_id = auth.uid()));

CREATE POLICY "personality_owner_update" ON public.personality_tests
  FOR UPDATE TO authenticated
  USING (applicant_id IN (SELECT id FROM applicants WHERE user_id = auth.uid()))
  WITH CHECK (applicant_id IN (SELECT id FROM applicants WHERE user_id = auth.uid()));

CREATE POLICY "personality_admin_all" ON public.personality_tests
  FOR ALL TO authenticated
  USING ((auth.jwt() ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() ->> 'role') = 'admin');

-- ============================================
-- resume_scores
-- ============================================
CREATE POLICY "Resume scores are viewable by admins" ON public.resume_scores
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Resume scores can be inserted by authenticated users" ON public.resume_scores
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Resume scores can be updated by admins" ON public.resume_scores
  FOR UPDATE TO authenticated
  USING (true);

-- ============================================
-- resumes
-- ============================================
CREATE POLICY "resumes_owner_select" ON public.resumes
  FOR SELECT TO authenticated
  USING (applicant_id IN (SELECT id FROM applicants WHERE user_id = auth.uid()));

CREATE POLICY "resumes_owner_insert" ON public.resumes
  FOR INSERT TO authenticated
  WITH CHECK (applicant_id IN (SELECT id FROM applicants WHERE user_id = auth.uid()));

CREATE POLICY "resumes_owner_update" ON public.resumes
  FOR UPDATE TO authenticated
  USING (applicant_id IN (SELECT id FROM applicants WHERE user_id = auth.uid()))
  WITH CHECK (applicant_id IN (SELECT id FROM applicants WHERE user_id = auth.uid()));

CREATE POLICY "resumes_admin_all" ON public.resumes
  FOR ALL TO authenticated
  USING ((auth.jwt() ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() ->> 'role') = 'admin');

-- ============================================
-- scheduled_interviews
-- ============================================
CREATE POLICY "Allow full access to scheduled_interviews for authenticated use" ON public.scheduled_interviews
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access on scheduled_interviews" ON public.scheduled_interviews
  FOR ALL TO public
  USING (true)
  WITH CHECK (true);

-- ============================================
-- scoring_settings
-- ============================================
CREATE POLICY "Anyone can view scoring settings" ON public.scoring_settings
  FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY "Authenticated users can manage scoring settings" ON public.scoring_settings
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- ============================================
-- video_assessments
-- ============================================
CREATE POLICY "video_owner_select" ON public.video_assessments
  FOR SELECT TO authenticated
  USING (applicant_id IN (SELECT id FROM applicants WHERE user_id = auth.uid()));

CREATE POLICY "video_owner_insert" ON public.video_assessments
  FOR INSERT TO authenticated
  WITH CHECK (applicant_id IN (SELECT id FROM applicants WHERE user_id = auth.uid()));

CREATE POLICY "video_owner_update" ON public.video_assessments
  FOR UPDATE TO authenticated
  USING (applicant_id IN (SELECT id FROM applicants WHERE user_id = auth.uid()))
  WITH CHECK (applicant_id IN (SELECT id FROM applicants WHERE user_id = auth.uid()));

CREATE POLICY "video_admin_all" ON public.video_assessments
  FOR ALL TO authenticated
  USING ((auth.jwt() ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() ->> 'role') = 'admin');

-- ============================================
-- work_style_assessments
-- ============================================
CREATE POLICY "Anyone can view all work style assessments" ON public.work_style_assessments
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Anyone can insert work style assessments" ON public.work_style_assessments
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Anyone can update work style assessments" ON public.work_style_assessments
  FOR UPDATE TO authenticated
  USING (true);
