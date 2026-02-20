-- Add raw_extracted_content column for BERT NER pipeline
ALTER TABLE resumes ADD COLUMN IF NOT EXISTS raw_extracted_content text;
ALTER TABLE resumes ADD COLUMN IF NOT EXISTS parsed_data jsonb;
ALTER TABLE resumes ADD COLUMN IF NOT EXISTS ner_status text DEFAULT 'pending';
