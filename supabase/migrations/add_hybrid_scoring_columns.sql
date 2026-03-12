-- Migration: Add hybrid scoring columns to scoring_settings
-- This adds support for the full 6-category hybrid scoring system
-- as documented in SCORING_DOCUMENTATION.md

-- Add job_level column (fresh_grad, entry_level, mid_level)
ALTER TABLE scoring_settings 
ADD COLUMN IF NOT EXISTS job_level TEXT DEFAULT 'entry_level' 
CHECK (job_level IN ('fresh_grad', 'entry_level', 'mid_level'));

-- Add weights for the 6 categories (replacing old 4-category weights)
ALTER TABLE scoring_settings 
ADD COLUMN IF NOT EXISTS traincert_weight NUMERIC DEFAULT 6 
CHECK (traincert_weight >= 0 AND traincert_weight <= 100);

ALTER TABLE scoring_settings 
ADD COLUMN IF NOT EXISTS achievements_weight NUMERIC DEFAULT 4 
CHECK (achievements_weight >= 0 AND achievements_weight <= 100);

-- Add baselines for count scoring (6 categories)
ALTER TABLE scoring_settings 
ADD COLUMN IF NOT EXISTS baseline_experience NUMERIC DEFAULT 2 
CHECK (baseline_experience >= 0);

ALTER TABLE scoring_settings 
ADD COLUMN IF NOT EXISTS baseline_skills NUMERIC DEFAULT 8 
CHECK (baseline_skills >= 0);

ALTER TABLE scoring_settings 
ADD COLUMN IF NOT EXISTS baseline_education NUMERIC DEFAULT 2 
CHECK (baseline_education >= 0);

-- Rename baseline_project_score to baseline_projects for consistency
ALTER TABLE scoring_settings 
ADD COLUMN IF NOT EXISTS baseline_projects NUMERIC DEFAULT 2 
CHECK (baseline_projects >= 0);

ALTER TABLE scoring_settings 
ADD COLUMN IF NOT EXISTS baseline_traincert NUMERIC DEFAULT 2 
CHECK (baseline_traincert >= 0);

ALTER TABLE scoring_settings 
ADD COLUMN IF NOT EXISTS baseline_achievements NUMERIC DEFAULT 1 
CHECK (baseline_achievements >= 0);

-- Add weights_by_level JSONB to store preset weights for each job level
-- This allows quick switching between fresh_grad, entry_level, mid_level profiles
ALTER TABLE scoring_settings 
ADD COLUMN IF NOT EXISTS weights_by_level JSONB DEFAULT '{
  "fresh_grad": {
    "experience_weight": 18,
    "skills_weight": 30,
    "education_weight": 22,
    "projects_weight": 18,
    "traincert_weight": 7,
    "achievements_weight": 5,
    "qualified_threshold": 75,
    "review_threshold": 60
  },
  "entry_level": {
    "experience_weight": 28,
    "skills_weight": 30,
    "education_weight": 18,
    "projects_weight": 14,
    "traincert_weight": 6,
    "achievements_weight": 4,
    "qualified_threshold": 78,
    "review_threshold": 65
  },
  "mid_level": {
    "experience_weight": 42,
    "skills_weight": 28,
    "education_weight": 14,
    "projects_weight": 8,
    "traincert_weight": 5,
    "achievements_weight": 3,
    "qualified_threshold": 80,
    "review_threshold": 68
  }
}'::jsonb;

-- Add baselines_by_level JSONB to store preset baselines for each job level
ALTER TABLE scoring_settings 
ADD COLUMN IF NOT EXISTS baselines_by_level JSONB DEFAULT '{
  "fresh_grad": {
    "baseline_experience": 1,
    "baseline_skills": 8,
    "baseline_education": 2,
    "baseline_projects": 2,
    "baseline_traincert": 2,
    "baseline_achievements": 1
  },
  "entry_level": {
    "baseline_experience": 2,
    "baseline_skills": 10,
    "baseline_education": 2,
    "baseline_projects": 2,
    "baseline_traincert": 2,
    "baseline_achievements": 1
  },
  "mid_level": {
    "baseline_experience": 4,
    "baseline_skills": 12,
    "baseline_education": 2,
    "baseline_projects": 2,
    "baseline_traincert": 2,
    "baseline_achievements": 1
  }
}'::jsonb;

-- Add scoring type: 'semantic' (old) or 'hybrid' (new category-based)
ALTER TABLE scoring_settings 
ADD COLUMN IF NOT EXISTS scoring_type TEXT DEFAULT 'hybrid' 
CHECK (scoring_type IN ('semantic', 'hybrid'));

-- Add component scores storage (for hybrid scoring breakdown)
ALTER TABLE scoring_settings 
ADD COLUMN IF NOT EXISTS store_component_scores BOOLEAN DEFAULT true;

-- Update comments
COMMENT ON COLUMN scoring_settings.job_level IS 'Current job level profile: fresh_grad, entry_level, or mid_level';
COMMENT ON COLUMN scoring_settings.traincert_weight IS 'Weight percentage for trainings and certifications score';
COMMENT ON COLUMN scoring_settings.achievements_weight IS 'Weight percentage for achievements score';
COMMENT ON COLUMN scoring_settings.baseline_experience IS 'Baseline count for experience to get full count score';
COMMENT ON COLUMN scoring_settings.baseline_skills IS 'Baseline count for skills to get full count score';
COMMENT ON COLUMN scoring_settings.baseline_education IS 'Baseline count for education to get full count score';
COMMENT ON COLUMN scoring_settings.baseline_projects IS 'Baseline count for projects to get full count score';
COMMENT ON COLUMN scoring_settings.baseline_traincert IS 'Baseline count for trainings/certifications to get full score';
COMMENT ON COLUMN scoring_settings.baseline_achievements IS 'Baseline count for achievements to get full count score';
COMMENT ON COLUMN scoring_settings.weights_by_level IS 'Preset weights for each job level (fresh_grad, entry_level, mid_level)';
COMMENT ON COLUMN scoring_settings.baselines_by_level IS 'Preset baselines for each job level';
COMMENT ON COLUMN scoring_settings.scoring_type IS 'Scoring algorithm type: semantic (old) or hybrid (new category-based)';
COMMENT ON COLUMN scoring_settings.store_component_scores IS 'Whether to store individual component scores in resume_scores';

-- Function to apply job level presets
CREATE OR REPLACE FUNCTION apply_job_level_presets(p_job_level TEXT)
RETURNS JSONB AS $$
DECLARE
  v_weights JSONB;
  v_baselines JSONB;
BEGIN
  -- Validate job level
  IF p_job_level NOT IN ('fresh_grad', 'entry_level', 'mid_level') THEN
    RAISE EXCEPTION 'Invalid job level: %', p_job_level;
  END IF;

  -- Get weights and baselines from the JSONB columns
  SELECT weights_by_level->p_job_level, baselines_by_level->p_job_level
  INTO v_weights, v_baselines
  FROM scoring_settings
  LIMIT 1;

  RETURN jsonb_build_object(
    'weights', v_weights,
    'baselines', v_baselines,
    'job_level', p_job_level
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update existing settings with default values for fresh_grad profile
UPDATE scoring_settings 
SET 
  job_level = COALESCE(job_level, 'entry_level'),
  traincert_weight = COALESCE(traincert_weight, 6),
  achievements_weight = COALESCE(achievements_weight, 4),
  baseline_experience = COALESCE(baseline_experience, 2),
  baseline_skills = COALESCE(baseline_skills, 8),
  baseline_education = COALESCE(baseline_education, 2),
  baseline_projects = COALESCE(baseline_projects, COALESCE(baseline_project_score, 2)),
  baseline_traincert = COALESCE(baseline_traincert, 2),
  baseline_achievements = COALESCE(baseline_achievements, 1),
  scoring_type = COALESCE(scoring_type, 'hybrid'),
  store_component_scores = COALESCE(store_component_scores, true)
WHERE settings_id IS NOT NULL;

-- Verify the columns were added
SELECT 
  column_name, 
  data_type, 
  column_default,
  is_nullable
FROM information_schema.columns 
WHERE table_name = 'scoring_settings'
ORDER BY ordinal_position;
