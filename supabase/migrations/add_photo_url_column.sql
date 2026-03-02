-- Add photo_url column to applicants table
ALTER TABLE applicants ADD COLUMN IF NOT EXISTS photo_url TEXT;
