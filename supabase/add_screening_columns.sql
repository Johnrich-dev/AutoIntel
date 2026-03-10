-- Add screening_score columns to applicants table
ALTER TABLE applicants ADD COLUMN IF NOT EXISTS screening_score numeric;
ALTER TABLE applicants ADD COLUMN IF NOT EXISTS screening_fit_category text;
