-- Add decision_date to applicants table for Final Decisions tracking
ALTER TABLE applicants
  ADD COLUMN IF NOT EXISTS decision_date TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS decision_notes TEXT;
