-- Add extractor_used column to track which PDF extractor was used
ALTER TABLE resumes ADD COLUMN IF NOT EXISTS extractor_used TEXT;
