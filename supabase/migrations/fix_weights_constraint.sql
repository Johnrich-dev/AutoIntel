-- Migration: Fix weights check constraint for 6-category scoring
-- Drop the old constraint that only checks 4 weights
-- Add new constraint that checks all 6 weights

-- First, find and drop the old constraint
ALTER TABLE scoring_settings 
DROP CONSTRAINT IF EXISTS weights_sum_to_100;

-- Add new constraint for 6 weights
ALTER TABLE scoring_settings 
ADD CONSTRAINT weights_sum_to_100 
CHECK (
  experience_weight + skills_weight + education_weight + 
  projects_weight + traincert_weight + achievements_weight = 100
);

-- Also add check constraints for individual weights if not already present
ALTER TABLE scoring_settings 
DROP CONSTRAINT IF EXISTS experience_weight_range;

ALTER TABLE scoring_settings 
ADD CONSTRAINT experience_weight_range 
CHECK (experience_weight >= 0 AND experience_weight <= 100);

ALTER TABLE scoring_settings 
DROP CONSTRAINT IF EXISTS skills_weight_range;

ALTER TABLE scoring_settings 
ADD CONSTRAINT skills_weight_range 
CHECK (skills_weight >= 0 AND skills_weight <= 100);

ALTER TABLE scoring_settings 
DROP CONSTRAINT IF EXISTS education_weight_range;

ALTER TABLE scoring_settings 
ADD CONSTRAINT education_weight_range 
CHECK (education_weight >= 0 AND education_weight <= 100);

ALTER TABLE scoring_settings 
DROP CONSTRAINT IF EXISTS projects_weight_range;

ALTER TABLE scoring_settings 
ADD CONSTRAINT projects_weight_range 
CHECK (projects_weight >= 0 AND projects_weight <= 100);

ALTER TABLE scoring_settings 
DROP CONSTRAINT IF EXISTS traincert_weight_range;

ALTER TABLE scoring_settings 
ADD CONSTRAINT traincert_weight_range 
CHECK (traincert_weight >= 0 AND traincert_weight <= 100);

ALTER TABLE scoring_settings 
DROP CONSTRAINT IF EXISTS achievements_weight_range;

ALTER TABLE scoring_settings 
ADD CONSTRAINT achievements_weight_range 
CHECK (achievements_weight >= 0 AND achievements_weight <= 100);

-- Verify the constraints
SELECT 
    conname, 
    pg_get_constraintdef(oid) 
FROM pg_constraint 
WHERE conrelid = 'scoring_settings'::regclass;
