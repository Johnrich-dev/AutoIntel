-- Migration: Update scoring_settings for Unified Scoring
-- This migration updates the scoring_settings table to reflect the unified scoring approach
-- where all applicants are scored using the same weights and thresholds regardless of career level

-- Step 1: Drop the check constraint that limits job_level values
ALTER TABLE scoring_settings 
DROP CONSTRAINT IF EXISTS scoring_settings_job_level_check;

-- Step 2: Update the job_level to 'unified' to indicate unified scoring is being used
UPDATE scoring_settings
SET job_level = 'unified'
WHERE job_level IS NULL OR job_level NOT IN ('unified');

-- Step 3: Update comments to reflect unified scoring
COMMENT ON COLUMN scoring_settings.job_level IS 'Scoring mode: unified (same for all applicants)';
COMMENT ON COLUMN scoring_settings.weights_by_level IS 'DEPRECATED: Kept for backward compatibility only. Now using unified weights.';
COMMENT ON COLUMN scoring_settings.baselines_by_level IS 'DEPRECATED: Kept for backward compatibility only. Now using unified baselines.';
COMMENT ON COLUMN scoring_settings.fresh_grad_weights IS 'DEPRECATED: No longer used for scoring.';
COMMENT ON COLUMN scoring_settings.fresh_grad_qualified_threshold IS 'DEPRECATED: No longer used for scoring.';
COMMENT ON COLUMN scoring_settings.fresh_grad_review_threshold IS 'DEPRECATED: No longer used for scoring.';
COMMENT ON COLUMN scoring_settings.mid_level_weights IS 'DEPRECATED: No longer used for scoring.';
COMMENT ON COLUMN scoring_settings.mid_level_qualified_threshold IS 'DEPRECATED: No longer used for scoring.';
COMMENT ON COLUMN scoring_settings.mid_level_review_threshold IS 'DEPRECATED: No longer used for scoring.';
COMMENT ON COLUMN scoring_settings.entry_level_weights IS 'DEPRECATED: No longer used for scoring.';
COMMENT ON COLUMN scoring_settings.entry_level_qualified_threshold IS 'DEPRECATED: No longer used for scoring.';
COMMENT ON COLUMN scoring_settings.entry_level_review_threshold IS 'DEPRECATED: No longer used for scoring.';

-- Verify the update
SELECT 
    settings_id, 
    job_level,
    experience_weight,
    skills_weight,
    education_weight,
    projects_weight,
    traincert_weight,
    achievements_weight,
    qualified_threshold,
    review_threshold
FROM scoring_settings;
