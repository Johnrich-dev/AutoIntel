/*
  # AutoIntel Recruitment System - Complete Schema

  This migration creates the full database schema for the AutoIntel single-company
  recruitment system including job postings, scoring settings, applicants, and resume scores.

  Tables:
    1. job_postings - Stores job descriptions from ETL dataset and admin-created jobs
    2. scoring_settings - Configurable weights and thresholds for resume scoring
    3. recruitment_applicants - Applicant information and parsed resumes
    4. resume_scores - Resume matching results with scoring breakdowns

  Features:
    - Soft delete support for job postings (is_active, deleted_at)
    - Admin CRUD operations via stored procedures
    - Automatic updated_at timestamps
    - Row Level Security (RLS) enabled
    - Validation constraints (weights sum to 100)
*/

-- ============================================
-- Extension for UUID generation
-- ============================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================
-- Function: update_updated_at_column
-- Automatically updates the updated_at timestamp
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Table: job_postings
-- Stores job descriptions from ETL dataset and admin-created jobs
-- ============================================
CREATE TABLE IF NOT EXISTS job_postings (
    job_id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    role_family TEXT,
    skills JSONB DEFAULT '[]'::jsonb,
    keywords JSONB DEFAULT '[]'::jsonb,
    required_education JSONB DEFAULT '[]'::jsonb,
    expected_projects JSONB DEFAULT '[]'::jsonb,
    preferred_certifications JSONB DEFAULT '[]'::jsonb,
    min_years_experience NUMERIC,
    max_years_experience NUMERIC,
    source TEXT NOT NULL DEFAULT 'admin' CHECK (source IN ('dataset', 'admin')),
    is_active BOOLEAN DEFAULT true,
    deleted_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Trigger for updated_at
CREATE TRIGGER update_job_postings_updated_at
    BEFORE UPDATE ON job_postings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Indexes for job_postings
CREATE INDEX IF NOT EXISTS idx_job_postings_role_family ON job_postings(role_family);
CREATE INDEX IF NOT EXISTS idx_job_postings_source ON job_postings(source);
CREATE INDEX IF NOT EXISTS idx_job_postings_is_active ON job_postings(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_job_postings_deleted_at ON job_postings(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_job_postings_title ON job_postings USING gin(to_tsvector('english', COALESCE(title, '') || ' ' || COALESCE(description, '')));

-- ============================================
-- Table: scoring_settings
-- Configurable weights and thresholds for resume scoring
-- ============================================
CREATE TABLE IF NOT EXISTS scoring_settings (
    settings_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    experience_weight NUMERIC NOT NULL DEFAULT 40 CHECK (experience_weight >= 0),
    skills_weight NUMERIC NOT NULL DEFAULT 30 CHECK (skills_weight >= 0),
    education_weight NUMERIC NOT NULL DEFAULT 20 CHECK (education_weight >= 0),
    projects_weight NUMERIC NOT NULL DEFAULT 10 CHECK (projects_weight >= 0),
    qualified_threshold NUMERIC NOT NULL DEFAULT 80 CHECK (qualified_threshold >= 0 AND qualified_threshold <= 100),
    review_threshold NUMERIC NOT NULL DEFAULT 60 CHECK (review_threshold >= 0 AND review_threshold <= 100),
    baseline_project_score NUMERIC NOT NULL DEFAULT 2 CHECK (baseline_project_score >= 0 AND baseline_project_score <= 10),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    -- Constraint: weights must sum to 100
    CONSTRAINT weights_sum_to_100 CHECK (
        experience_weight + skills_weight + education_weight + projects_weight = 100
    ),
    -- Constraint: qualified threshold must be greater than review threshold
    CONSTRAINT qualified_above_review CHECK (
        qualified_threshold > review_threshold
    )
);

-- Trigger for updated_at
CREATE TRIGGER update_scoring_settings_updated_at
    BEFORE UPDATE ON scoring_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Insert default scoring settings
INSERT INTO scoring_settings (
    experience_weight, skills_weight, education_weight, projects_weight,
    qualified_threshold, review_threshold, baseline_project_score
) VALUES (
    40, 30, 20, 10, 80, 60, 2
)
ON CONFLICT DO NOTHING;

-- ============================================
-- Table: recruitment_applicants
-- Applicant information and parsed resumes
-- ============================================
CREATE TABLE IF NOT EXISTS recruitment_applicants (
    applicant_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    applied_job_id TEXT REFERENCES job_postings(job_id) ON DELETE SET NULL,
    full_name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    resume_text TEXT,
    parsed_resume_json JSONB DEFAULT '{}'::jsonb,
    video_path TEXT,
    transcription_text TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for recruitment_applicants
CREATE INDEX IF NOT EXISTS idx_recruitment_applicants_job_id ON recruitment_applicants(applied_job_id);
CREATE INDEX IF NOT EXISTS idx_recruitment_applicants_email ON recruitment_applicants(email);
CREATE INDEX IF NOT EXISTS idx_recruitment_applicants_created_at ON recruitment_applicants(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recruitment_applicants_parsed_resume ON recruitment_applicants USING gin(parsed_resume_json);

-- ============================================
-- Table: resume_scores
-- Resume matching results with scoring breakdowns
-- ============================================
CREATE TABLE IF NOT EXISTS resume_scores (
    score_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    applicant_id UUID NOT NULL REFERENCES recruitment_applicants(applicant_id) ON DELETE CASCADE,
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

-- Indexes for resume_scores
CREATE INDEX IF NOT EXISTS idx_resume_scores_job_score ON resume_scores(job_id, final_score DESC);
CREATE INDEX IF NOT EXISTS idx_resume_scores_job_status ON resume_scores(job_id, status);
CREATE INDEX IF NOT EXISTS idx_resume_scores_applicant ON resume_scores(applicant_id);
CREATE INDEX IF NOT EXISTS idx_resume_scores_final_score ON resume_scores(final_score DESC);
CREATE INDEX IF NOT EXISTS idx_resume_scores_status ON resume_scores(status);
CREATE INDEX IF NOT EXISTS idx_resume_scores_match_explain ON resume_scores USING gin(match_explain);

-- Unique constraint: one score per applicant-job combination
CREATE UNIQUE INDEX IF NOT EXISTS idx_resume_scores_unique_applicant_job ON resume_scores(applicant_id, job_id);

-- ============================================
-- Stored Procedures: Job Postings CRUD
-- ============================================

-- Procedure: Create a new job posting
CREATE OR REPLACE FUNCTION create_job_posting(
    p_job_id TEXT,
    p_title TEXT,
    p_description TEXT DEFAULT NULL,
    p_role_family TEXT DEFAULT NULL,
    p_skills JSONB DEFAULT '[]'::jsonb,
    p_keywords JSONB DEFAULT '[]'::jsonb,
    p_required_education JSONB DEFAULT '[]'::jsonb,
    p_expected_projects JSONB DEFAULT '[]'::jsonb,
    p_preferred_certifications JSONB DEFAULT '[]'::jsonb,
    p_min_years_experience NUMERIC DEFAULT NULL,
    p_max_years_experience NUMERIC DEFAULT NULL,
    p_source TEXT DEFAULT 'admin'
)
RETURNS TABLE (
    job_id TEXT,
    title TEXT,
    description TEXT,
    role_family TEXT,
    source TEXT,
    is_active BOOLEAN,
    created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    INSERT INTO job_postings (
        job_id, title, description, role_family,
        skills, keywords, required_education, expected_projects, preferred_certifications,
        min_years_experience, max_years_experience, source
    ) VALUES (
        p_job_id, p_title, p_description, p_role_family,
        p_skills, p_keywords, p_required_education, p_expected_projects, p_preferred_certifications,
        p_min_years_experience, p_max_years_experience, p_source
    )
    RETURNING 
        job_postings.job_id, 
        job_postings.title, 
        job_postings.description, 
        job_postings.role_family,
        job_postings.source,
        job_postings.is_active,
        job_postings.created_at;
END;
$$ LANGUAGE plpgsql;

-- Procedure: Update a job posting
CREATE OR REPLACE FUNCTION update_job_posting(
    p_job_id TEXT,
    p_title TEXT DEFAULT NULL,
    p_description TEXT DEFAULT NULL,
    p_role_family TEXT DEFAULT NULL,
    p_skills JSONB DEFAULT NULL,
    p_keywords JSONB DEFAULT NULL,
    p_required_education JSONB DEFAULT NULL,
    p_expected_projects JSONB DEFAULT NULL,
    p_preferred_certifications JSONB DEFAULT NULL,
    p_min_years_experience NUMERIC DEFAULT NULL,
    p_max_years_experience NUMERIC DEFAULT NULL
)
RETURNS TABLE (
    job_id TEXT,
    title TEXT,
    description TEXT,
    role_family TEXT,
    updated_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    UPDATE job_postings
    SET 
        title = COALESCE(p_title, job_postings.title),
        description = COALESCE(p_description, job_postings.description),
        role_family = COALESCE(p_role_family, job_postings.role_family),
        skills = COALESCE(p_skills, job_postings.skills),
        keywords = COALESCE(p_keywords, job_postings.keywords),
        required_education = COALESCE(p_required_education, job_postings.required_education),
        expected_projects = COALESCE(p_expected_projects, job_postings.expected_projects),
        preferred_certifications = COALESCE(p_preferred_certifications, job_postings.preferred_certifications),
        min_years_experience = COALESCE(p_min_years_experience, job_postings.min_years_experience),
        max_years_experience = COALESCE(p_max_years_experience, job_postings.max_years_experience),
        updated_at = NOW()
    WHERE job_postings.job_id = p_job_id AND job_postings.deleted_at IS NULL
    RETURNING 
        job_postings.job_id, 
        job_postings.title, 
        job_postings.description, 
        job_postings.role_family,
        job_postings.updated_at;
END;
$$ LANGUAGE plpgsql;

-- Procedure: Soft delete a job (remove job)
CREATE OR REPLACE FUNCTION soft_delete_job(
    p_job_id TEXT
)
RETURNS TABLE (
    job_id TEXT,
    title TEXT,
    is_active BOOLEAN,
    deleted_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    UPDATE job_postings
    SET 
        is_active = false,
        deleted_at = NOW(),
        updated_at = NOW()
    WHERE job_postings.job_id = p_job_id AND job_postings.deleted_at IS NULL
    RETURNING 
        job_postings.job_id, 
        job_postings.title, 
        job_postings.is_active,
        job_postings.deleted_at;
END;
$$ LANGUAGE plpgsql;

-- Procedure: Restore a soft-deleted job
CREATE OR REPLACE FUNCTION restore_job(
    p_job_id TEXT
)
RETURNS TABLE (
    job_id TEXT,
    title TEXT,
    is_active BOOLEAN,
    deleted_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    UPDATE job_postings
    SET 
        is_active = true,
        deleted_at = NULL,
        updated_at = NOW()
    WHERE job_postings.job_id = p_job_id
    RETURNING 
        job_postings.job_id, 
        job_postings.title, 
        job_postings.is_active,
        job_postings.deleted_at,
        job_postings.updated_at;
END;
$$ LANGUAGE plpgsql;

-- Procedure: List jobs with optional active filter
CREATE OR REPLACE FUNCTION list_jobs(
    p_show_inactive BOOLEAN DEFAULT false
)
RETURNS TABLE (
    job_id TEXT,
    title TEXT,
    description TEXT,
    role_family TEXT,
    skills JSONB,
    keywords JSONB,
    source TEXT,
    is_active BOOLEAN,
    deleted_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        j.job_id,
        j.title,
        j.description,
        j.role_family,
        j.skills,
        j.keywords,
        j.source,
        j.is_active,
        j.deleted_at,
        j.created_at,
        j.updated_at
    FROM job_postings j
    WHERE 
        (p_show_inactive = true OR j.is_active = true)
        AND (p_show_inactive = true OR j.deleted_at IS NULL)
    ORDER BY j.created_at DESC;
END;
$$ LANGUAGE plpgsql;

-- Procedure: Get or create scoring settings
CREATE OR REPLACE FUNCTION get_scoring_settings()
RETURNS TABLE (
    settings_id UUID,
    experience_weight NUMERIC,
    skills_weight NUMERIC,
    education_weight NUMERIC,
    projects_weight NUMERIC,
    qualified_threshold NUMERIC,
    review_threshold NUMERIC,
    baseline_project_score NUMERIC,
    created_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE
) AS $$
DECLARE
    v_settings_id UUID;
BEGIN
    -- Try to get existing settings
    SELECT ss.settings_id INTO v_settings_id FROM scoring_settings ss LIMIT 1;
    
    -- If no settings exist, create default settings
    IF v_settings_id IS NULL THEN
        INSERT INTO scoring_settings (
            experience_weight, skills_weight, education_weight, projects_weight,
            qualified_threshold, review_threshold, baseline_project_score
        ) VALUES (40, 30, 20, 10, 80, 60, 2)
        RETURNING scoring_settings.settings_id INTO v_settings_id;
    END IF;
    
    RETURN QUERY
    SELECT
        ss.settings_id,
        ss.experience_weight,
        ss.skills_weight,
        ss.education_weight,
        ss.projects_weight,
        ss.qualified_threshold,
        ss.review_threshold,
        ss.baseline_project_score,
        ss.created_at,
        ss.updated_at
    FROM scoring_settings ss
    WHERE ss.settings_id = v_settings_id;
END;
$$ LANGUAGE plpgsql;

-- Procedure: Update scoring settings with validation
CREATE OR REPLACE FUNCTION update_scoring_settings(
    p_experience_weight NUMERIC DEFAULT NULL,
    p_skills_weight NUMERIC DEFAULT NULL,
    p_education_weight NUMERIC DEFAULT NULL,
    p_projects_weight NUMERIC DEFAULT NULL,
    p_qualified_threshold NUMERIC DEFAULT NULL,
    p_review_threshold NUMERIC DEFAULT NULL,
    p_baseline_project_score NUMERIC DEFAULT NULL
)
RETURNS TABLE (
    settings_id UUID,
    experience_weight NUMERIC,
    skills_weight NUMERIC,
    education_weight NUMERIC,
    projects_weight NUMERIC,
    qualified_threshold NUMERIC,
    review_threshold NUMERIC,
    baseline_project_score NUMERIC,
    updated_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT
) AS $$
DECLARE
    v_settings_id UUID;
    v_current RECORD;
    v_new_experience NUMERIC;
    v_new_skills NUMERIC;
    v_new_education NUMERIC;
    v_new_projects NUMERIC;
    v_new_qualified NUMERIC;
    v_new_review NUMERIC;
    v_new_baseline NUMERIC;
    v_total_weight NUMERIC;
BEGIN
    -- Get current settings
    SELECT * INTO v_current FROM get_scoring_settings();
    
    IF v_current.settings_id IS NULL THEN
        -- Create default settings if none exist
        INSERT INTO scoring_settings DEFAULT VALUES RETURNING scoring_settings.settings_id INTO v_settings_id;
        SELECT * INTO v_current FROM scoring_settings WHERE settings_id = v_settings_id;
    END IF;
    
    v_settings_id := v_current.settings_id;
    
    -- Calculate new values
    v_new_experience := COALESCE(p_experience_weight, v_current.experience_weight);
    v_new_skills := COALESCE(p_skills_weight, v_current.skills_weight);
    v_new_education := COALESCE(p_education_weight, v_current.education_weight);
    v_new_projects := COALESCE(p_projects_weight, v_current.projects_weight);
    v_new_qualified := COALESCE(p_qualified_threshold, v_current.qualified_threshold);
    v_new_review := COALESCE(p_review_threshold, v_current.review_threshold);
    v_new_baseline := COALESCE(p_baseline_project_score, v_current.baseline_project_score);
    
    -- Validation: Check for negative values
    IF v_new_experience < 0 OR v_new_skills < 0 OR v_new_education < 0 OR v_new_projects < 0 THEN
        RETURN QUERY SELECT
            v_settings_id, v_new_experience, v_new_skills, v_new_education, v_new_projects,
            v_new_qualified, v_new_review, v_new_baseline, NOW(),
            'All weights must be non-negative'::TEXT;
        RETURN;
    END IF;
    
    -- Validation: Check weights sum to 100
    v_total_weight := v_new_experience + v_new_skills + v_new_education + v_new_projects;
    IF v_total_weight != 100 THEN
        RETURN QUERY SELECT
            v_settings_id, v_new_experience, v_new_skills, v_new_education, v_new_projects,
            v_new_qualified, v_new_review, v_new_baseline, NOW(),
            ('Weights must sum to 100%, current sum: ' || v_total_weight || '%')::TEXT;
        RETURN;
    END IF;
    
    -- Validation: Check thresholds are in range 0-100
    IF v_new_qualified < 0 OR v_new_qualified > 100 OR v_new_review < 0 OR v_new_review > 100 THEN
        RETURN QUERY SELECT
            v_settings_id, v_new_experience, v_new_skills, v_new_education, v_new_projects,
            v_new_qualified, v_new_review, v_new_baseline, NOW(),
            'Thresholds must be between 0 and 100'::TEXT;
        RETURN;
    END IF;
    
    -- Validation: qualified must be greater than review
    IF v_new_qualified <= v_new_review THEN
        RETURN QUERY SELECT
            v_settings_id, v_new_experience, v_new_skills, v_new_education, v_new_projects,
            v_new_qualified, v_new_review, v_new_baseline, NOW(),
            'Qualified threshold must be greater than review threshold'::TEXT;
        RETURN;
    END IF;
    
    -- Validation: baseline_project_score must be 0-10
    IF v_new_baseline < 0 OR v_new_baseline > 10 THEN
        RETURN QUERY SELECT
            v_settings_id, v_new_experience, v_new_skills, v_new_education, v_new_projects,
            v_new_qualified, v_new_review, v_new_baseline, NOW(),
            'Baseline project score must be between 0 and 10'::TEXT;
        RETURN;
    END IF;
    
    -- All validations passed, update settings
    RETURN QUERY
    UPDATE scoring_settings
    SET
        experience_weight = v_new_experience,
        skills_weight = v_new_skills,
        education_weight = v_new_education,
        projects_weight = v_new_projects,
        qualified_threshold = v_new_qualified,
        review_threshold = v_new_review,
        baseline_project_score = v_new_baseline,
        updated_at = NOW()
    WHERE scoring_settings.settings_id = v_settings_id
    RETURNING
        scoring_settings.settings_id,
        scoring_settings.experience_weight,
        scoring_settings.skills_weight,
        scoring_settings.education_weight,
        scoring_settings.projects_weight,
        scoring_settings.qualified_threshold,
        scoring_settings.review_threshold,
        scoring_settings.baseline_project_score,
        scoring_settings.updated_at,
        NULL::TEXT;
END;
$$ LANGUAGE plpgsql;

-- Procedure: Reset scoring settings to defaults
CREATE OR REPLACE FUNCTION reset_scoring_settings_to_default()
RETURNS TABLE (
    settings_id UUID,
    experience_weight NUMERIC,
    skills_weight NUMERIC,
    education_weight NUMERIC,
    projects_weight NUMERIC,
    qualified_threshold NUMERIC,
    review_threshold NUMERIC,
    baseline_project_score NUMERIC,
    updated_at TIMESTAMP WITH TIME ZONE
) AS $$
DECLARE
    v_settings_id UUID;
BEGIN
    -- Get or create settings
    SELECT ss.settings_id INTO v_settings_id FROM scoring_settings ss LIMIT 1;
    
    IF v_settings_id IS NULL THEN
        INSERT INTO scoring_settings DEFAULT VALUES RETURNING scoring_settings.settings_id INTO v_settings_id;
    END IF;
    
    RETURN QUERY
    UPDATE scoring_settings
    SET
        experience_weight = 40,
        skills_weight = 30,
        education_weight = 20,
        projects_weight = 10,
        qualified_threshold = 80,
        review_threshold = 60,
        baseline_project_score = 2,
        updated_at = NOW()
    WHERE scoring_settings.settings_id = v_settings_id
    RETURNING
        scoring_settings.settings_id,
        scoring_settings.experience_weight,
        scoring_settings.skills_weight,
        scoring_settings.education_weight,
        scoring_settings.projects_weight,
        scoring_settings.qualified_threshold,
        scoring_settings.review_threshold,
        scoring_settings.baseline_project_score,
        scoring_settings.updated_at;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Views: Active Jobs Only
-- ============================================

-- View for active jobs (hides inactive and deleted)
CREATE OR REPLACE VIEW active_job_postings AS
SELECT *
FROM job_postings
WHERE is_active = true AND deleted_at IS NULL;

-- ============================================
-- Row Level Security (RLS)
-- ============================================

-- Enable RLS on all tables
ALTER TABLE job_postings ENABLE ROW LEVEL SECURITY;
ALTER TABLE scoring_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE recruitment_applicants ENABLE ROW LEVEL SECURITY;
ALTER TABLE resume_scores ENABLE ROW LEVEL SECURITY;

-- Policies for job_postings
CREATE POLICY "Job postings are viewable by everyone" 
ON job_postings FOR SELECT 
TO authenticated, anon 
USING (true);

CREATE POLICY "Job postings can be managed by admins" 
ON job_postings FOR ALL 
TO authenticated 
USING (true);

-- Policies for scoring_settings
CREATE POLICY "Scoring settings are viewable by authenticated users" 
ON scoring_settings FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Scoring settings can be managed by admins" 
ON scoring_settings FOR ALL 
TO authenticated 
USING (true);

-- Policies for recruitment_applicants
CREATE POLICY "Applicants are viewable by admins" 
ON recruitment_applicants FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Applicants can be inserted by authenticated users" 
ON recruitment_applicants FOR INSERT 
TO authenticated 
WITH CHECK (true);

CREATE POLICY "Applicants can be updated by admins" 
ON recruitment_applicants FOR UPDATE 
TO authenticated 
USING (true);

-- Policies for resume_scores
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
COMMENT ON TABLE job_postings IS 'Stores job descriptions from ETL dataset and admin-created custom jobs';
COMMENT ON TABLE scoring_settings IS 'Configurable weights and thresholds for resume scoring algorithm';
COMMENT ON TABLE recruitment_applicants IS 'Applicant information with parsed resume data and video transcriptions';
COMMENT ON TABLE resume_scores IS 'Resume matching module scoring results linking applicants to jobs';

COMMENT ON COLUMN job_postings.source IS 'Origin of job: dataset (ETL import) or admin (manually created)';
COMMENT ON COLUMN job_postings.is_active IS 'Soft delete flag - false means job is hidden/inactive';
COMMENT ON COLUMN job_postings.deleted_at IS 'Timestamp when job was soft deleted';

COMMENT ON COLUMN scoring_settings.experience_weight IS 'Weight percentage for experience score (must sum to 100 with other weights)';
COMMENT ON COLUMN scoring_settings.skills_weight IS 'Weight percentage for skills score';
COMMENT ON COLUMN scoring_settings.education_weight IS 'Weight percentage for education score';
COMMENT ON COLUMN scoring_settings.projects_weight IS 'Weight percentage for projects score';
COMMENT ON COLUMN scoring_settings.qualified_threshold IS 'Minimum final score to be considered qualified (default 80)';
COMMENT ON COLUMN scoring_settings.review_threshold IS 'Minimum final score to require review (default 60)';
COMMENT ON COLUMN scoring_settings.baseline_project_score IS 'Default score for project matching baseline';
