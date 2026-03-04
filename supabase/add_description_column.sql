-- Add description column if missing
ALTER TABLE job_postings 
ADD COLUMN IF NOT EXISTS description TEXT;

-- Also ensure role_family exists
ALTER TABLE job_postings 
ADD COLUMN IF NOT EXISTS role_family TEXT;

-- Verify columns
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'job_postings' 
ORDER BY ordinal_position;
