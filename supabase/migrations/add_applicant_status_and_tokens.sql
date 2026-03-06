-- ============================================
-- Migration: Add applicant status and access tokens
-- Description: Adds status tracking and access token fields for the new workflow
-- ============================================

-- Add status column to recruitment_applicants
ALTER TABLE recruitment_applicants 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending_screening' 
CHECK (status IN (
    'pending_screening',    -- After email collection, before scoring
    'passed_screening',     -- Passed, token sent, awaiting assessment
    'needs_review',         -- Score in review range (60-79)
    'failed_screening',     -- Did not pass (score < 60)
    'video_in_progress',    -- Currently recording video
    'video_completed',      -- Video submitted
    'exam_in_progress',     -- Taking personality test
    'exam_completed',       -- Personality test done
    'assessments_done',     -- Both assessments completed
    'admin_review',         -- Ready for admin review
    'shortlisted',          -- Shortlisted for interview
    'rejected',             -- Rejected after review
    'hired'                 -- Offered/accepted position
));

-- Add access token and expiry
ALTER TABLE recruitment_applicants 
ADD COLUMN IF NOT EXISTS access_token TEXT,
ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS screening_score NUMERIC,
ADD COLUMN IF NOT EXISTS screening_fit_category TEXT;

-- Create index for token lookup
CREATE INDEX IF NOT EXISTS idx_recruitment_applicants_access_token 
ON recruitment_applicants(access_token);

CREATE INDEX IF NOT EXISTS idx_recruitment_applicants_status 
ON recruitment_applicants(status);

CREATE INDEX IF NOT EXISTS idx_recruitment_applicants_token_expires 
ON recruitment_applicants(token_expires_at) 
WHERE token_expires_at IS NOT NULL;

-- Function to update status with timestamp
CREATE OR REPLACE FUNCTION update_applicant_status()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status <> OLD.status THEN
        NEW.updated_at = NOW();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for status updates
DROP TRIGGER IF EXISTS update_applicant_status_trigger ON recruitment_applicants;
CREATE TRIGGER update_applicant_status_trigger
    BEFORE UPDATE ON recruitment_applicants
    FOR EACH ROW
    EXECUTE FUNCTION update_applicant_status();

-- Add updated_at column if not exists
ALTER TABLE recruitment_applicants 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Add job title column for email subject (denormalized for convenience)
ALTER TABLE recruitment_applicants 
ADD COLUMN IF NOT EXISTS applied_job_title TEXT;

-- Function to validate and cleanup expired tokens
CREATE OR REPLACE FUNCTION cleanup_expired_tokens()
RETURNS void AS $$
BEGIN
    UPDATE recruitment_applicants
    SET access_token = NULL,
        token_expires_at = NULL,
        status = 'failed_screening'
    WHERE token_expires_at < NOW()
    AND status = 'passed_screening';
END;
$$ LANGUAGE plpgsql;

-- Comment on the new columns
COMMENT ON COLUMN recruitment_applicants.status IS 'Application workflow status';
COMMENT ON COLUMN recruitment_applicants.access_token IS 'Temporary access token for passed applicants';
COMMENT ON COLUMN recruitment_applicants.token_expires_at IS 'When the access token expires';
COMMENT ON COLUMN recruitment_applicants.screening_score IS 'Automated screening score (0-100)';
COMMENT ON COLUMN recruitment_applicants.screening_fit_category IS 'Fit category: Excellent, Good, Poor';
