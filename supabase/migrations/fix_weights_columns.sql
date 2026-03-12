-- Migration: Fix scoring_settings weights columns completely
-- First drop the constraint, then fix the data, then re-add constraint

-- Step 1: Drop the constraint first (so we can update the data)
ALTER TABLE scoring_settings 
DROP CONSTRAINT IF EXISTS weights_sum_to_100;

-- Step 2: Check current values to understand the column order
SELECT 
  settings_id,
  experience_weight,
  skills_weight,
  education_weight,
  projects_weight,
  qualified_threshold,
  review_threshold,
  baseline_project_score,
  job_level,
  traincert_weight,
  achievements_weight,
  baseline_experience,
  baseline_skills,
  baseline_education,
  baseline_projects,
  baseline_traincert,
  baseline_achievements,
  scoring_type
FROM scoring_settings
LIMIT 1;

-- Step 3: Update to correct 6-weight values (entry_level profile)
UPDATE scoring_settings SET
  experience_weight = 28,
  skills_weight = 30,
  education_weight = 18,
  projects_weight = 14,
  traincert_weight = 6,
  achievements_weight = 4,
  qualified_threshold = 78,
  review_threshold = 65,
  baseline_experience = 2,
  baseline_skills = 10,
  baseline_education = 2,
  baseline_projects = 2,
  baseline_traincert = 2,
  baseline_achievements = 1,
  job_level = 'entry_level',
  scoring_type = 'hybrid';

-- Step 4: Add the new constraint for 6 weights
ALTER TABLE scoring_settings 
ADD CONSTRAINT weights_sum_to_100 
CHECK (
  experience_weight + skills_weight + education_weight + 
  projects_weight + traincert_weight + achievements_weight = 100
);

-- Step 5: Verify
SELECT 
  experience_weight + skills_weight + education_weight + 
  projects_weight + traincert_weight + achievements_weight as total_weights,
  *
FROM scoring_settings;
