-- Add transcription columns to video_assessments table
ALTER TABLE video_assessments 
ADD COLUMN IF NOT EXISTS transcription TEXT,
ADD COLUMN IF NOT EXISTS transcription_status VARCHAR(50) DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS transcription_error TEXT,
ADD COLUMN IF NOT EXISTS transcribed_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS transcription_segments JSONB DEFAULT NULL;

-- Create index for transcription status lookups
CREATE INDEX IF NOT EXISTS idx_video_assessments_transcription_status 
ON video_assessments(transcription_status);

-- Create function to auto-update transcribed_at timestamp
CREATE OR REPLACE FUNCTION update_transcribed_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.transcribed_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-update transcribed_at when transcription is completed
DROP TRIGGER IF EXISTS trigger_update_transcribed_at ON video_assessments;
CREATE TRIGGER trigger_update_transcribed_at
    BEFORE UPDATE OF transcription ON video_assessments
    FOR EACH ROW
    WHEN (OLD.transcription IS NULL AND NEW.transcription IS NOT NULL)
    EXECUTE FUNCTION update_transcribed_at();
