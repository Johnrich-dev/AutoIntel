-- Fix script to add missing columns to job_postings table
-- Run this if you get "column does not exist" errors

-- Check if table exists, if not create it
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

-- Add missing columns if they don't exist
DO $$
BEGIN
    -- Add source column if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'job_postings' AND column_name = 'source') THEN
        ALTER TABLE job_postings ADD COLUMN source TEXT NOT NULL DEFAULT 'admin' 
            CHECK (source IN ('dataset', 'admin'));
    END IF;

    -- Add is_active column if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'job_postings' AND column_name = 'is_active') THEN
        ALTER TABLE job_postings ADD COLUMN is_active BOOLEAN DEFAULT true;
    END IF;

    -- Add deleted_at column if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'job_postings' AND column_name = 'deleted_at') THEN
        ALTER TABLE job_postings ADD COLUMN deleted_at TIMESTAMP WITH TIME ZONE;
    END IF;

    -- Add other JSONB columns if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'job_postings' AND column_name = 'skills') THEN
        ALTER TABLE job_postings ADD COLUMN skills JSONB DEFAULT '[]'::jsonb;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'job_postings' AND column_name = 'keywords') THEN
        ALTER TABLE job_postings ADD COLUMN keywords JSONB DEFAULT '[]'::jsonb;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'job_postings' AND column_name = 'required_education') THEN
        ALTER TABLE job_postings ADD COLUMN required_education JSONB DEFAULT '[]'::jsonb;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'job_postings' AND column_name = 'expected_projects') THEN
        ALTER TABLE job_postings ADD COLUMN expected_projects JSONB DEFAULT '[]'::jsonb;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'job_postings' AND column_name = 'preferred_certifications') THEN
        ALTER TABLE job_postings ADD COLUMN preferred_certifications JSONB DEFAULT '[]'::jsonb;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'job_postings' AND column_name = 'min_years_experience') THEN
        ALTER TABLE job_postings ADD COLUMN min_years_experience NUMERIC;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'job_postings' AND column_name = 'max_years_experience') THEN
        ALTER TABLE job_postings ADD COLUMN max_years_experience NUMERIC;
    END IF;
END $$;

-- Create scoring_settings table if it doesn't exist
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
    CONSTRAINT weights_sum_to_100 CHECK (
        experience_weight + skills_weight + education_weight + projects_weight = 100
    ),
    CONSTRAINT qualified_above_review CHECK (
        qualified_threshold > review_threshold
    )
);

-- Insert default scoring settings if none exist
INSERT INTO scoring_settings (
    experience_weight, skills_weight, education_weight, projects_weight,
    qualified_threshold, review_threshold, baseline_project_score
) VALUES (
    40, 30, 20, 10, 80, 60, 2
)
ON CONFLICT DO NOTHING;

SELECT 'Tables and columns fixed successfully!' as status;
