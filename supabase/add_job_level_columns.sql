-- Migration: Add separate columns for each job level
-- This restructures scoring_settings to have separate thresholds and weights per job level

-- Add separate threshold columns for each job level
ALTER TABLE scoring_settings 
ADD COLUMN IF NOT EXISTS fresh_grad_qualified_threshold NUMERIC DEFAULT 75,
ADD COLUMN IF NOT EXISTS fresh_grad_review_threshold NUMERIC DEFAULT 60,
ADD COLUMN IF NOT EXISTS entry_level_qualified_threshold NUMERIC DEFAULT 78,
ADD COLUMN IF NOT EXISTS entry_level_review_threshold NUMERIC DEFAULT 65,
ADD COLUMN IF NOT EXISTS mid_level_qualified_threshold NUMERIC DEFAULT 80,
ADD COLUMN IF NOT EXISTS mid_level_review_threshold NUMERIC DEFAULT 68;

-- Add separate weight columns for each job level (stored as JSONB for simplicity)
ALTER TABLE scoring_settings 
ADD COLUMN IF NOT EXISTS fresh_grad_weights JSONB DEFAULT '{
  "experience_weight": 18,
  "skills_weight": 30,
  "education_weight": 22,
  "projects_weight": 18,
  "traincert_weight": 7,
  "achievements_weight": 5,
  "baseline_experience": 1,
  "baseline_skills": 8,
  "baseline_education": 2,
  "baseline_projects": 2,
  "baseline_traincert": 2,
  "baseline_achievements": 1
}'::jsonb,
ADD COLUMN IF NOT EXISTS entry_level_weights JSONB DEFAULT '{
  "experience_weight": 28,
  "skills_weight": 30,
  "education_weight": 18,
  "projects_weight": 14,
  "traincert_weight": 6,
  "achievements_weight": 4,
  "baseline_experience": 2,
  "baseline_skills": 10,
  "baseline_education": 2,
  "baseline_projects": 2,
  "baseline_traincert": 2,
  "baseline_achievements": 1
}'::jsonb,
ADD COLUMN IF NOT EXISTS mid_level_weights JSONB DEFAULT '{
  "experience_weight": 42,
  "skills_weight": 28,
  "education_weight": 14,
  "projects_weight": 8,
  "traincert_weight": 5,
  "achievements_weight": 3,
  "baseline_experience": 4,
  "baseline_skills": 12,
  "baseline_education": 2,
  "baseline_projects": 2,
  "baseline_traincert": 2,
  "baseline_achievements": 1
}'::jsonb;

-- Verify the columns were added
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'scoring_settings' 
AND (column_name LIKE '%threshold%' OR column_name LIKE '%weights%')
ORDER BY column_name;
