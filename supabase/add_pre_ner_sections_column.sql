-- Add pre_ner_sections column for storing pre-NER sectioning output
ALTER TABLE resumes ADD COLUMN IF NOT EXISTS pre_ner_sections jsonb;
