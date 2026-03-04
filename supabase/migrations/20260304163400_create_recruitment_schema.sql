/*
  # AutoIntel Recruitment System Schema

  This migration extends the existing database schema for the resume matching and
  recruitment pipeline, adding support for job descriptions and resume scoring.

  1. Modified Tables
    - `applicants` (existing)
      - Added columns: resume_text, parsed_resume_json, video_path, transcription_text, applied_job_id
      
  2. New Tables
    - `job_postings`
      - Stores enriched job dataset from the ETL pipeline
      - Contains structured job requirements including skills, education, experience
      
    - `resume_scores`
      - Stores resume matching module scoring results
      - Links applicants to job postings with scoring breakdowns
      - Supports filtering by final_score and status

  3. Relationships
    - `applicants.applied_job_id` → `job_postings.job_id`
    - `resume_scores.applicant_id` → `applicants.id`
    - `resume_scores.job_id` → `job_postings.job_id`

  4. Security
    - Enable RLS on new tables
    - Indexes for efficient querying by job_id, final_score, and status
*/

-- ============================================
-- Table: job_postings
-- Stores enriched job dataset from ETL pipeline
-- ============================================
CREATE TABLE IF NOT EXISTS job_postings (
    job_id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    role_family TEXT,
    skills JSONB DEFAULT '[]'::jsonb,
    keywords JSONB DEFAULT '[]'::jsonb,
    required_education JSONB DEFAULT '[]'::jsonb,
    expected_projects JSONB DEFAULT '[]'::jsonb,
    preferred_certifications JSONB DEFAULT '[]'::jsonb,
    min_years_experience NUMERIC,
    max_years_experience NUMERIC,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on role_family for filtering
CREATE INDEX IF NOT EXISTS idx_job_postings_role_family ON job_postings(role_family);

-- Create index on title for search
CREATE INDEX IF NOT EXISTS idx_job_postings_title ON job_postings USING gin(to_tsvector('english', title));

-- ============================================
-- Alter existing applicants table
-- Add columns for resume matching functionality
-- ============================================

-- Add resume_text column if not exists
ALTER TABLE applicants 
ADD COLUMN IF NOT EXISTS resume_text TEXT;

-- Add parsed_resume_json column if not exists
ALTER TABLE applicants 
ADD COLUMN IF NOT EXISTS parsed_resume_json JSONB DEFAULT '{}'::jsonb;

-- Add video_path column if not exists
ALTER TABLE applicants 
ADD COLUMN IF NOT EXISTS video_path TEXT;

-- Add transcription_text column if not exists
ALTER TABLE applicants 
ADD COLUMN IF NOT EXISTS transcription_text TEXT;

-- Add applied_job_id column if not exists (references job_postings)
ALTER TABLE applicants 
ADD COLUMN IF NOT EXISTS applied_job_id TEXT REFERENCES job_postings(job_id) ON DELETE SET NULL;

-- Create index on applied_job_id for efficient querying by job
CREATE INDEX IF NOT EXISTS idx_applicants_job_id ON applicants(applied_job_id);

-- Create GIN index on parsed_resume_json for flexible queries
CREATE INDEX IF NOT EXISTS idx_applicants_parsed_resume ON applicants USING gin(parsed_resume_json);

-- ============================================
-- Table: resume_scores
-- Stores resume matching module scoring results
-- ============================================
CREATE TABLE IF NOT EXISTS resume_scores (
    score_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    applicant_id UUID NOT NULL REFERENCES applicants(id) ON DELETE CASCADE,
    job_id TEXT NOT NULL REFERENCES job_postings(job_id) ON DELETE CASCADE,
    experience_score NUMERIC CHECK (experience_score >= 0 AND experience_score <= 100),
    skills_score NUMERIC CHECK (skills_score >= 0 AND skills_score <= 100),
    education_score NUMERIC CHECK (education_score >= 0 AND education_score <= 100),
    project_score NUMERIC CHECK (project_score >= 0 AND project_score <= 100),
    final_score NUMERIC CHECK (final_score >= 0 AND final_score <= 100),
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_review', 'shortlisted', 'rejected', 'hired')),
    match_explain JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create composite index for querying applicants by job_id and filtering by score/status
CREATE INDEX IF NOT EXISTS idx_resume_scores_job_score ON resume_scores(job_id, final_score DESC);
CREATE INDEX IF NOT EXISTS idx_resume_scores_job_status ON resume_scores(job_id, status);

-- Create index on applicant_id for joining
CREATE INDEX IF NOT EXISTS idx_resume_scores_applicant ON resume_scores(applicant_id);

-- Create index on final_score for sorting/filtering
CREATE INDEX IF NOT EXISTS idx_resume_scores_final_score ON resume_scores(final_score DESC);

-- Create index on status for filtering
CREATE INDEX IF NOT EXISTS idx_resume_scores_status ON resume_scores(status);

-- Create GIN index on match_explain for flexible queries
CREATE INDEX IF NOT EXISTS idx_resume_scores_match_explain ON resume_scores USING gin(match_explain);

-- Ensure one score record per applicant-job combination
CREATE UNIQUE INDEX IF NOT EXISTS idx_resume_scores_unique_applicant_job ON resume_scores(applicant_id, job_id);

-- ============================================
-- Row Level Security (RLS)
-- ============================================

-- Enable RLS on new tables
ALTER TABLE job_postings ENABLE ROW LEVEL SECURITY;
ALTER TABLE resume_scores ENABLE ROW LEVEL SECURITY;

-- Policies for job_postings (readable by all authenticated users)
CREATE POLICY "Job postings are viewable by everyone" 
ON job_postings FOR SELECT 
TO authenticated, anon 
USING (true);

-- Policies for resume_scores (viewable by admins, insertable by service)
CREATE POLICY "Resume scores are viewable by admins" 
ON resume_scores FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Resume scores can be inserted by authenticated users" 
ON resume_scores FOR INSERT 
TO authenticated 
WITH CHECK (true);

CREATE POLICY "Resume scores can be updated by admins" 
ON resume_scores FOR UPDATE 
TO authenticated 
USING (true);

-- ============================================
-- Comments for documentation
-- ============================================
COMMENT ON TABLE job_postings IS 'Stores enriched job dataset from the ETL pipeline with structured requirements';
COMMENT ON TABLE resume_scores IS 'Stores resume matching module scoring results linking applicants to jobs';

COMMENT ON COLUMN job_postings.skills IS 'Array of required skills extracted from ETL dataset';
COMMENT ON COLUMN job_postings.keywords IS 'Array of keywords/tags for job matching';
COMMENT ON COLUMN job_postings.required_education IS 'Array of education requirements';
COMMENT ON COLUMN job_postings.expected_projects IS 'Array of expected project types or domains';
COMMENT ON COLUMN job_postings.preferred_certifications IS 'Array of preferred certifications';

COMMENT ON COLUMN applicants.resume_text IS 'Raw text content extracted from applicant resume';
COMMENT ON COLUMN applicants.parsed_resume_json IS 'Structured JSON output from resume parsing module';
COMMENT ON COLUMN applicants.video_path IS 'Path to uploaded video interview file';
COMMENT ON COLUMN applicants.transcription_text IS 'Text transcription of applicant video interview';
COMMENT ON COLUMN applicants.applied_job_id IS 'Foreign key referencing the job posting this applicant applied for';

COMMENT ON COLUMN resume_scores.experience_score IS 'Score (0-100) for experience matching';
COMMENT ON COLUMN resume_scores.skills_score IS 'Score (0-100) for skills matching';
COMMENT ON COLUMN resume_scores.education_score IS 'Score (0-100) for education matching';
COMMENT ON COLUMN resume_scores.project_score IS 'Score (0-100) for project relevance matching';
COMMENT ON COLUMN resume_scores.final_score IS 'Weighted composite score (0-100)';
COMMENT ON COLUMN resume_scores.status IS 'Application status: pending, in_review, shortlisted, rejected, hired';
COMMENT ON COLUMN resume_scores.match_explain IS 'Detailed explanation of scoring breakdown in JSON format';
