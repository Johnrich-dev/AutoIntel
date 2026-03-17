-- Add columns for duplicate detection tracking to applicants table

-- Add rejection_reason column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'applicants' AND column_name = 'rejection_reason') THEN
        ALTER TABLE applicants ADD COLUMN rejection_reason TEXT;
    END IF;
END $$;

-- Add duplicate_matches JSON column to store duplicate detection results
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'applicants' AND column_name = 'duplicate_matches') THEN
        ALTER TABLE applicants ADD COLUMN duplicate_matches JSONB;
    END IF;
END $$;

-- Add duplicate_detected_at timestamp
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'applicants' AND column_name = 'duplicate_detected_at') THEN
        ALTER TABLE applicants ADD COLUMN duplicate_detected_at TIMESTAMPTZ;
    END IF;
END $$;

-- Add duplicate_layer column to track which layer detected the duplicate
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'applicants' AND column_name = 'duplicate_layer') THEN
        ALTER TABLE applicants ADD COLUMN duplicate_layer INTEGER;
    END IF;
END $$;

-- Add index on email for faster duplicate lookups
CREATE INDEX IF NOT EXISTS idx_applicants_email_lower ON applicants ((lower(email)));

-- Add index on status for filtering
CREATE INDEX IF NOT EXISTS idx_applicants_status ON applicants (status);
