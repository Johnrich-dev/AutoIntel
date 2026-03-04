-- Add ALL missing columns to job_postings table

-- First, let's see what columns currently exist
SELECT 'Current columns in job_postings:' as info;
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'job_postings' 
ORDER BY ordinal_position;

-- Add all missing columns
ALTER TABLE job_postings 
ADD COLUMN IF NOT EXISTS description TEXT,
ADD COLUMN IF NOT EXISTS role_family TEXT,
ADD COLUMN IF NOT EXISTS skills JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS keywords JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS required_education JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS expected_projects JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS preferred_certifications JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS min_years_experience NUMERIC,
ADD COLUMN IF NOT EXISTS max_years_experience NUMERIC,
ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'admin' CHECK (source IN ('dataset', 'admin')),
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Create trigger function for updated_at if not exists
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for job_postings if not exists
DROP TRIGGER IF EXISTS update_job_postings_updated_at ON job_postings;
CREATE TRIGGER update_job_postings_updated_at
    BEFORE UPDATE ON job_postings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Verify all columns were added
SELECT 'Columns after fix:' as info;
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'job_postings' 
ORDER BY ordinal_position;
