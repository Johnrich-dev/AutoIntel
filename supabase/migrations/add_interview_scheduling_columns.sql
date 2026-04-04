-- Migration: Extend scheduled_interviews table for full calendar-invite workflow
-- Backward-compatible: all new columns are nullable or have defaults
-- Run this against your Supabase project

-- Create the table if it doesn't exist yet
CREATE TABLE IF NOT EXISTS scheduled_interviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    applicant_id UUID REFERENCES applicants(id) ON DELETE CASCADE,
    interviewer_id UUID REFERENCES hr_managers(id) ON DELETE SET NULL,
    job_id TEXT REFERENCES job_postings(job_id) ON DELETE SET NULL,
    interview_date DATE,
    interview_time TIME,
    interview_type TEXT CHECK (interview_type IN ('online', 'in-person', 'hybrid')),
    meeting_link TEXT,
    meeting_id TEXT,
    meeting_passcode TEXT,
    location TEXT,
    status TEXT DEFAULT 'scheduled' CHECK (status IN ('pending', 'scheduled', 'completed', 'cancelled')),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add new columns (safe to run even if table already exists)
ALTER TABLE scheduled_interviews
    ADD COLUMN IF NOT EXISTS duration_minutes INTEGER DEFAULT 60,
    ADD COLUMN IF NOT EXISTS time_zone TEXT DEFAULT 'Asia/Manila',
    -- primary_interviewer_email stored separately for ICS/email use
    ADD COLUMN IF NOT EXISTS primary_interviewer_email TEXT,
    -- additional_attendees stored as JSON array of email strings
    -- e.g. ["hr@company.com", "panel@company.com"]
    -- NOTE: Use JSONB for efficient querying; cast to text[] when needed
    ADD COLUMN IF NOT EXISTS additional_attendees JSONB DEFAULT '[]'::jsonb,
    -- applicant_instructions: shown in applicant-facing email and ICS description
    ADD COLUMN IF NOT EXISTS applicant_instructions TEXT,
    -- internal_notes: NEVER sent to applicant; only visible to HR panel
    ADD COLUMN IF NOT EXISTS internal_notes TEXT,
    -- calendar_event_id: Google Calendar event ID if created
    ADD COLUMN IF NOT EXISTS calendar_event_id TEXT,
    -- ics_uid: stable UID for the ICS event (for updates/cancellations)
    ADD COLUMN IF NOT EXISTS ics_uid TEXT;

-- Index for common queries
CREATE INDEX IF NOT EXISTS idx_scheduled_interviews_applicant ON scheduled_interviews(applicant_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_interviews_date ON scheduled_interviews(interview_date);
CREATE INDEX IF NOT EXISTS idx_scheduled_interviews_status ON scheduled_interviews(status);

-- Enable RLS
ALTER TABLE scheduled_interviews ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (drop first to make this re-runnable)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'scheduled_interviews'
      AND policyname = 'Service role full access on scheduled_interviews'
  ) THEN
    EXECUTE 'CREATE POLICY "Service role full access on scheduled_interviews"
      ON scheduled_interviews FOR ALL
      USING (true)
      WITH CHECK (true)';
  END IF;
END $$;
