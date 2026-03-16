-- Add transcription_status column to video_assessments if not exists
-- This ensures the automatic transcription flow works

ALTER TABLE video_assessments 
ADD COLUMN IF NOT EXISTS transcription_status TEXT DEFAULT 'pending' 
CHECK (transcription_status IN ('pending', 'processing', 'completed', 'failed'));

-- Create index for faster queries on pending transcriptions
CREATE INDEX IF NOT EXISTS idx_video_assessments_transcription_status 
ON video_assessments(transcription_status) 
WHERE transcription_status = 'pending';

-- Update any existing records that have NULL transcription_status
UPDATE video_assessments 
SET transcription_status = 'pending' 
WHERE transcription_status IS NULL 
AND video_url IS NOT NULL 
AND status = 'submitted';

-- Create a trigger function to auto-set transcription_status on insert
CREATE OR REPLACE FUNCTION auto_set_transcription_status()
RETURNS TRIGGER AS $$
BEGIN
    -- Set transcription_status to 'pending' when a new video is submitted
    -- but only if it's not already set and video_url exists
    IF NEW.transcription_status IS NULL AND NEW.video_url IS NOT NULL THEN
        NEW.transcription_status := 'pending';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS trigger_auto_transcription_status ON video_assessments;
CREATE TRIGGER trigger_auto_transcription_status
    BEFORE INSERT ON video_assessments
    FOR EACH ROW
    EXECUTE FUNCTION auto_set_transcription_status();

-- Grant permissions (adjust as needed)
GRANT ALL ON video_assessments TO service_role;
GRANT ALL ON video_assessments TO authenticated;
