-- =============================================================================
-- Work Style Assessments Table Migration
-- =============================================================================
-- This migration creates a new table for Work Style Assessments.
-- =============================================================================

-- Step 1: Create the new work_style_assessments table
-- =============================================================================
CREATE TABLE IF NOT EXISTS work_style_assessments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    applicant_id UUID NOT NULL REFERENCES applicants(id) ON DELETE CASCADE,
    
    -- Raw answers stored as question-answer pairs (JSONB)
    answers JSONB DEFAULT '[]'::jsonb,
    
    -- Computed dimension scores (JSONB)
    dimension_scores JSONB DEFAULT '[]'::jsonb,
    
    -- Overall work style alignment score (0-100)
    work_style_alignment_score INTEGER,
    
    -- The job role used for scoring
    matched_role TEXT,
    
    -- Status: pending, in_progress, submitted
    status TEXT DEFAULT 'pending',
    
    -- Timestamps
    submitted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Step 2: Add index for faster queries
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_work_style_assessments_applicant_id 
    ON work_style_assessments(applicant_id);

CREATE INDEX IF NOT EXISTS idx_work_style_assessments_status 
    ON work_style_assessments(status);

CREATE INDEX IF NOT EXISTS idx_work_style_assessments_matched_role 
    ON work_style_assessments(matched_role);

-- Step 3: Enable Row Level Security (RLS)
-- =============================================================================
ALTER TABLE work_style_assessments ENABLE ROW LEVEL SECURITY;

-- Step 4: Create RLS Policies
-- =============================================================================

-- Allow anyone authenticated to view all records (simplified for now)
CREATE POLICY "Anyone can view all work style assessments"
    ON work_style_assessments FOR SELECT
    TO authenticated
    USING (true);

-- Allow anyone authenticated to insert records
CREATE POLICY "Anyone can insert work style assessments"
    ON work_style_assessments FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- Allow anyone authenticated to update records
CREATE POLICY "Anyone can update work style assessments"
    ON work_style_assessments FOR UPDATE
    TO authenticated
    USING (true);

-- Step 5: Add comments for documentation
-- =============================================================================
COMMENT ON TABLE work_style_assessments IS 
    'Work Style Assessment results - measures behavioral tendencies and role preferences';
    
COMMENT ON COLUMN work_style_assessments.answers IS 
    'Raw answers as array of {question: number, answer: number} objects';
    
COMMENT ON COLUMN work_style_assessments.dimension_scores IS 
    'Computed dimension scores as array of {dimension: string, score: number} objects';
    
COMMENT ON COLUMN work_style_assessments.work_style_alignment_score IS 
    'Overall alignment score (0-100) calculated against job-specific weights';
    
COMMENT ON COLUMN work_style_assessments.matched_role IS 
    'The job role profile used for calculating alignment score';

-- Step 6: Grant permissions
-- =============================================================================
GRANT SELECT, INSERT, UPDATE ON work_style_assessments TO authenticated;
GRANT ALL ON work_style_assessments TO service_role;