-- Remove unused GPT-related columns from resumes table
-- Keep: gpt_cleaning_status, ner_status, parsed_data, cleaned_resume_text

ALTER TABLE resumes DROP COLUMN IF EXISTS gpt_status;
ALTER TABLE resumes DROP COLUMN IF EXISTS gpt_model;
ALTER TABLE resumes DROP COLUMN IF EXISTS gpt_extracted_json;
ALTER TABLE resumes DROP COLUMN IF EXISTS gpt_extraction_status;

-- Drop the unused indexes
DROP INDEX IF EXISTS idx_resumes_gpt_extraction_status;
