-- Add GPT text cleaning columns for the new pipeline
-- GPT cleans text BEFORE NER, NER still does categorization

-- Store cleaned text (output from GPT cleaning)
ALTER TABLE resumes ADD COLUMN IF NOT EXISTS cleaned_resume_text text;

-- GPT cleaning status: not_attempted, success, failed, skipped
ALTER TABLE resumes ADD COLUMN IF NOT EXISTS gpt_cleaning_status text DEFAULT 'pending';

-- GPT extraction status: pending, success, failed, skipped (for full extraction)
ALTER TABLE resumes ADD COLUMN IF NOT EXISTS gpt_status text DEFAULT 'pending';

-- Which model was used for cleaning
ALTER TABLE resumes ADD COLUMN IF NOT EXISTS gpt_model text;

-- Index for efficient querying by gpt_cleaning_status
CREATE INDEX IF NOT EXISTS idx_resumes_gpt_cleaning_status ON resumes(gpt_cleaning_status);

-- Note: parsed_data still comes from BERT NER (not from GPT)
-- gpt_cleaning_status tells you if GPT cleaning was used

-- ============================================================================
-- GPT Full Structured Extraction Columns
-- ============================================================================
-- These columns store the output from extract_resume_json() which does
-- full structured extraction without needing BERT NER

-- Store full structured extraction from GPT (JSON)
ALTER TABLE resumes ADD COLUMN IF NOT EXISTS gpt_extracted_json jsonb;

-- GPT extraction status: pending, success, failed, skipped
ALTER TABLE resumes ADD COLUMN IF NOT EXISTS gpt_extraction_status text DEFAULT 'pending';

-- Index for efficient querying by gpt_extraction_status
CREATE INDEX IF NOT EXISTS idx_resumes_gpt_extraction_status ON resumes(gpt_extraction_status);

-- When gpt_extraction_status = 'success', NER can be skipped (ner_status = 'optional')
