-- Fix: Update scoring_settings to use proper unified scoring defaults
-- The previous migration set job_level to 'unified' but the weights are still from fresh_grad profile

-- Update weights to unified defaults (sum = 100)
UPDATE scoring_settings
SET 
    experience_weight = 28,
    skills_weight = 30,
    education_weight = 18,
    projects_weight = 14,
    traincert_weight = 6,
    achievements_weight = 4,
    -- Update thresholds to unified defaults
    qualified_threshold = 78,
    review_threshold = 65,
    -- Update baselines to unified defaults
    baseline_experience = 2,
    baseline_skills = 10,
    baseline_education = 2,
    baseline_projects = 2,
    baseline_traincert = 2,
    baseline_achievements = 1,
    -- Update scoring type
    scoring_type = 'hybrid'
WHERE job_level = 'unified';

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
    (experience_weight + skills_weight + education_weight + projects_weight + traincert_weight + achievements_weight) as weight_sum,
    qualified_threshold,
    review_threshold,
    baseline_experience,
    baseline_skills,
    baseline_education,
    baseline_projects,
    baseline_traincert,
    baseline_achievements
FROM scoring_settings;
