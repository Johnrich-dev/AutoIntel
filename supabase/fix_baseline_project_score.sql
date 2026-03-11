-- Fix: Lower baseline_project_score from 10 to 3
-- This prevents penalizing candidates with fewer projects

UPDATE scoring_settings 
SET baseline_project_score = 3, 
    updated_at = NOW();

-- Verify the update
SELECT settings_id, baseline_project_score FROM scoring_settings;
