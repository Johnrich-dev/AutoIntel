-- Add semantic scoring columns to work_style_assessments table
-- This migration adds support for the new hybrid semantic scoring system

-- Add semantic score column (0-100 overall alignment)
ALTER TABLE work_style_assessments 
ADD COLUMN IF NOT EXISTS semantic_score DECIMAL(5,2);

-- Add dimension scores as JSONB for detailed per-dimension scoring
ALTER TABLE work_style_assessments 
ADD COLUMN IF NOT EXISTS dimension_scores JSONB;

-- Add detected role family
ALTER TABLE work_style_assessments 
ADD COLUMN IF NOT EXISTS role_family VARCHAR(50);

-- Add strong/moderate/development areas as JSONB
ALTER TABLE work_style_assessments 
ADD COLUMN IF NOT EXISTS strong_areas JSONB;
ALTER TABLE work_style_assessments 
ADD COLUMN IF NOT EXISTS moderate_areas JSONB;
ALTER TABLE work_style_assessments 
ADD COLUMN IF NOT EXISTS development_areas JSONB;

-- Add essay insights from GPT analysis
ALTER TABLE work_style_assessments 
ADD COLUMN IF NOT EXISTS essay_insights TEXT;

-- Add scoring method indicator (semantic/hybrid)
ALTER TABLE work_style_assessments 
ADD COLUMN IF NOT EXISTS scoring_method VARCHAR(20) DEFAULT 'semantic';

-- Add timestamp for when scoring was completed
ALTER TABLE work_style_assessments 
ADD COLUMN IF NOT EXISTS scored_at TIMESTAMPTZ;

-- Add essay column if it doesn't exist
ALTER TABLE work_style_assessments 
ADD COLUMN IF NOT EXISTS essay TEXT;

-- Create index for faster queries on semantic score
CREATE INDEX IF NOT EXISTS idx_workstyle_semantic_score 
ON work_style_assessments(semantic_score);

-- Create index for role family filtering
CREATE INDEX IF NOT EXISTS idx_workstyle_role_family 
ON work_style_assessments(role_family);

-- Create index for scored_at
CREATE INDEX IF NOT EXISTS idx_workstyle_scored_at 
ON work_style_assessments(scored_at);

-- Add comment
COMMENT ON COLUMN work_style_assessments.semantic_score IS 'Overall alignment score (0-100) calculated using semantic embeddings + optional GPT evaluation';
COMMENT ON COLUMN work_style_assessments.dimension_scores IS 'Detailed scores for each of 15 dimensions from hybrid scoring';
COMMENT ON COLUMN work_style_assessments.role_family IS 'Auto-detected role family from job title (development, data, design, security, network, cloud, marketing, business, qa, default)';
COMMENT ON COLUMN work_style_assessments.scoring_method IS 'Method used: semantic (embeddings only) or hybrid (embeddings + GPT essay analysis)';
