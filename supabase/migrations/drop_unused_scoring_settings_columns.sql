-- Migration: Drop unused columns from scoring_settings
-- Columns removed:
--   baseline_project_score  → replaced by baseline_projects, never used by UI or backend
--   store_component_scores  → never read by UI or backend
--   video_fallback_completed → never read by UI or backend
--   video_fallback_submitted → never read by UI or backend
--   job_level               → hardcoded to 'unified' in code, not user-configurable

ALTER TABLE public.scoring_settings
    DROP COLUMN IF EXISTS baseline_project_score,
    DROP COLUMN IF EXISTS store_component_scores,
    DROP COLUMN IF EXISTS video_fallback_completed,
    DROP COLUMN IF EXISTS video_fallback_submitted,
    DROP COLUMN IF EXISTS job_level;
