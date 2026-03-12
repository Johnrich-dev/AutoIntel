-- Migration: Fix existing scoring_settings data and update constraint for 6-category scoring
-- First update the existing row to have valid 6-weight values
-- Then drop and recreate the constraint

-- Step 1: Update existing row to add missing weight columns with default values
-- This makes the sum work with the new constraint
UPDATE scoring_settings SET
  traincert_weight = COALESCE(traincert_weight, 0),
  achievements_weight = COALESCE(achievements_weight, 0)
WHERE traincert_weight IS NULL OR achievements_weight IS NULL;

-- Step 2: Check current weights and adjust if needed
-- Get current values
SELECT 
  experience_weight, 
  skills_weight, 
  education_weight, 
  projects_weight,
  COALESCE(traincert_weight, 0) as traincert_weight,
  COALESCE(achievements_weight, 0) as achievements_weight
FROM scoring_settings
LIMIT 1;

-- Step 3: Update weights to sum to 100 with 6 categories
-- This sets default values for entry_level profile
UPDATE scoring_settings SET
  experience_weight = 28,
  skills_weight = 30,
  education_weight = 18,
  projects_weight = 14,
  traincert_weight = 6,
  achievements_weight = 4,
  baseline_experience = COALESCE(baseline_experience, 2),
  baseline_skills = COALESCE(baseline_skills, 10),
  baseline_education = COALESCE(baseline_education, 2),
  baseline_projects = COALESCE(baseline_projects, 2),
  baseline_traincert = COALESCE(baseline_traincert, 2),
  baseline_achievements = COALESCE(baseline_achievements, 1),
  job_level = COALESCE(job_level, 'entry_level'),
  scoring_type = COALESCE(scoring_type, 'hybrid')
WHERE experience_weight + skills_weight + education_weight + projects_weight + 
      COALESCE(traincert_weight, 0) + COALESCE(achievements_weight, 0) != 100
   OR experience_weight + skills_weight + education_weight + projects_weight != 100;

-- Step 4: Now drop and recreate the constraint
ALTER TABLE scoring_settings 
DROP CONSTRAINT IF EXISTS weights_sum_to_100;

ALTER TABLE scoring_settings 
ADD CONSTRAINT weights_sum_to_100 
CHECK (
  experience_weight + skills_weight + education_weight + 
  projects_weight + traincert_weight + achievements_weight = 100
);

-- Verify the update worked
SELECT 
  experience_weight + skills_weight + education_weight + 
  projects_weight + traincert_weight + achievements_weight as total_weight,
  *
FROM scoring_settings;
