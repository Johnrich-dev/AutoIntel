/*
  # AutoIntel Automated Hiring System Schema

  1. New Tables
    - `applicants`
      - `id` (uuid, primary key)
      - `email` (text, unique) - Applicant email for temporary access
      - `name` (text) - Applicant full name
      - `position` (text) - Position applied for
      - `access_token` (text, unique) - Temporary access token
      - `access_expires_at` (timestamptz) - Token expiration (1-2 days)
      - `rules_accepted` (boolean) - Whether terms were accepted
      - `rules_accepted_at` (timestamptz) - When terms were accepted
      - `created_at` (timestamptz) - Account creation time

    - `video_assessments`
      - `id` (uuid, primary key)
      - `applicant_id` (uuid, foreign key) - Reference to applicant
      - `video_url` (text) - Placeholder for video file
      - `status` (text) - pending, submitted, reviewed
      - `submitted_at` (timestamptz) - When video was submitted
      - `created_at` (timestamptz)

    - `personality_tests`
      - `id` (uuid, primary key)
      - `applicant_id` (uuid, foreign key) - Reference to applicant
      - `answers` (jsonb) - Array of question answers
      - `status` (text) - pending, submitted, reviewed
      - `submitted_at` (timestamptz) - When test was submitted
      - `created_at` (timestamptz)

    - `resumes`
      - `id` (uuid, primary key)
      - `applicant_id` (uuid, foreign key) - Reference to applicant
      - `resume_url` (text) - Placeholder for resume file
      - `status` (text) - pending, reviewed, suitable, not_suitable
      - `uploaded_at` (timestamptz)

    - `admin_actions`
      - `id` (uuid, primary key)
      - `applicant_id` (uuid, foreign key) - Reference to applicant
      - `action_type` (text) - marked_suitable, sent_video_invite, sent_test_invite, scheduled_interview
      - `notes` (text) - Admin notes
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on all tables
    - Applicants can read/update their own data using access_token
    - Admin access will be handled through service role for this prototype

  3. Important Notes
    - This is a prototype schema with mock data support
    - Access tokens provide temporary authentication (1-2 days)
    - JSONB used for flexible personality test answers storage
    - Status fields use text for flexibility in prototype phase
*/

CREATE TABLE IF NOT EXISTS applicants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  name text NOT NULL,
  position text NOT NULL,
  access_token text UNIQUE NOT NULL,
  access_expires_at timestamptz NOT NULL,
  rules_accepted boolean DEFAULT false,
  rules_accepted_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS resumes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_id uuid NOT NULL REFERENCES applicants(id) ON DELETE CASCADE,
  resume_url text,
  status text DEFAULT 'pending',
  uploaded_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS video_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_id uuid NOT NULL REFERENCES applicants(id) ON DELETE CASCADE,
  video_url text,
  status text DEFAULT 'pending',
  submitted_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS personality_tests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_id uuid NOT NULL REFERENCES applicants(id) ON DELETE CASCADE,
  answers jsonb DEFAULT '[]'::jsonb,
  status text DEFAULT 'pending',
  submitted_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_id uuid NOT NULL REFERENCES applicants(id) ON DELETE CASCADE,
  action_type text NOT NULL,
  notes text,
  created_at timestamptz DEFAULT now()
);

-- ALTER TABLE applicants ENABLE ROW LEVEL SECURITY; -- Disabled for prototype
-- ALTER TABLE resumes ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE video_assessments ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE personality_tests ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE admin_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Applicants can view own data"
  ON applicants FOR SELECT
  USING (
    access_token = current_setting('request.headers', true)::json->>'x-access-token'
    AND access_expires_at > now()
  );

CREATE POLICY "Applicants can update own data"
  ON applicants FOR UPDATE
  USING (
    access_token = current_setting('request.headers', true)::json->>'x-access-token'
    AND access_expires_at > now()
  );

CREATE POLICY "Applicants can view own resume"
  ON resumes FOR SELECT
  USING (
    applicant_id IN (
      SELECT id FROM applicants
      WHERE access_token = current_setting('request.headers', true)::json->>'x-access-token'
      AND access_expires_at > now()
    )
  );

CREATE POLICY "Applicants can view own video assessment"
  ON video_assessments FOR SELECT
  USING (
    applicant_id IN (
      SELECT id FROM applicants
      WHERE access_token = current_setting('request.headers', true)::json->>'x-access-token'
      AND access_expires_at > now()
    )
  );

CREATE POLICY "Applicants can insert own video assessment"
  ON video_assessments FOR INSERT
  WITH CHECK (
    applicant_id IN (
      SELECT id FROM applicants
      WHERE access_token = current_setting('request.headers', true)::json->>'x-access-token'
      AND access_expires_at > now()
    )
  );

CREATE POLICY "Applicants can update own video assessment"
  ON video_assessments FOR UPDATE
  USING (
    applicant_id IN (
      SELECT id FROM applicants
      WHERE access_token = current_setting('request.headers', true)::json->>'x-access-token'
      AND access_expires_at > now()
    )
  );

CREATE POLICY "Applicants can view own personality test"
  ON personality_tests FOR SELECT
  USING (
    applicant_id IN (
      SELECT id FROM applicants
      WHERE access_token = current_setting('request.headers', true)::json->>'x-access-token'
      AND access_expires_at > now()
    )
  );

CREATE POLICY "Applicants can insert own personality test"
  ON personality_tests FOR INSERT
  WITH CHECK (
    applicant_id IN (
      SELECT id FROM applicants
      WHERE access_token = current_setting('request.headers', true)::json->>'x-access-token'
      AND access_expires_at > now()
    )
  );

CREATE POLICY "Applicants can update own personality test"
  ON personality_tests FOR UPDATE
  USING (
    applicant_id IN (
      SELECT id FROM applicants
      WHERE access_token = current_setting('request.headers', true)::json->>'x-access-token'
      AND access_expires_at > now()
    )
  );

CREATE INDEX IF NOT EXISTS idx_applicants_access_token ON applicants(access_token);
CREATE INDEX IF NOT EXISTS idx_applicants_email ON applicants(email);
CREATE INDEX IF NOT EXISTS idx_resumes_applicant_id ON resumes(applicant_id);
CREATE INDEX IF NOT EXISTS idx_video_assessments_applicant_id ON video_assessments(applicant_id);
CREATE INDEX IF NOT EXISTS idx_personality_tests_applicant_id ON personality_tests(applicant_id);
CREATE INDEX IF NOT EXISTS idx_admin_actions_applicant_id ON admin_actions(applicant_id);