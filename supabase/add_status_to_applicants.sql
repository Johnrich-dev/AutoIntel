-- Add missing columns to applicants table for screening workflow
-- These columns are needed by screening_service.py

-- Add status column for application workflow tracking
ALTER TABLE applicants ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending_screening';

-- Add access_token for passed applicants to log in
ALTER TABLE applicants ADD COLUMN IF NOT EXISTS access_token TEXT;

-- Add access_expires_at for token expiry
ALTER TABLE applicants ADD COLUMN IF NOT EXISTS access_expires_at TIMESTAMP WITH TIME ZONE;

-- Add applied_job_id to reference job_postings
ALTER TABLE applicants ADD COLUMN IF NOT EXISTS applied_job_id TEXT REFERENCES job_postings(job_id) ON DELETE SET NULL;

-- Add updated_at for tracking last updates
ALTER TABLE applicants ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_applicants_status ON applicants(status);
CREATE INDEX IF NOT EXISTS idx_applicants_access_token ON applicants(access_token);
CREATE INDEX IF NOT EXISTS idx_applicants_email ON applicants(email);

-- Add comments
COMMENT ON COLUMN applicants.status IS 'Application workflow status';
COMMENT ON COLUMN applicants.access_token IS 'Temporary access token for passed applicants';
COMMENT ON COLUMN applicants.access_expires_at IS 'When the access token expires';
