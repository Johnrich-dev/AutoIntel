-- Add video assessment scoring columns for transcript-only scoring
-- This enables AI scoring based on transcribed video content

-- Add scoring columns to video_assessments table
ALTER TABLE video_assessments
ADD COLUMN IF NOT EXISTS video_duration_seconds INTEGER,
ADD COLUMN IF NOT EXISTS transcript_word_count INTEGER,
ADD COLUMN IF NOT EXISTS transcript_score DECIMAL(4,2),
ADD COLUMN IF NOT EXISTS relevance_score DECIMAL(4,2),
ADD COLUMN IF NOT EXISTS experience_score DECIMAL(4,2),
ADD COLUMN IF NOT EXISTS skills_score DECIMAL(4,2),
ADD COLUMN IF NOT EXISTS completeness_score DECIMAL(4,2),
ADD COLUMN IF NOT EXISTS validation_status VARCHAR(50) DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS validation_message TEXT,
ADD COLUMN IF NOT EXISTS scored_at TIMESTAMP WITH TIME ZONE;

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_video_assessments_validation_status
ON video_assessments(validation_status);

CREATE INDEX IF NOT EXISTS idx_video_assessments_transcript_score
ON video_assessments(transcript_score);
