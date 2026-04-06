-- Migration: Add email tracking columns for Final Decisions workflow
-- Tracks offer and rejection email communication status per applicant

ALTER TABLE applicants
  ADD COLUMN IF NOT EXISTS offer_email_sent        BOOLEAN   DEFAULT false,
  ADD COLUMN IF NOT EXISTS offer_email_sent_at     TIMESTAMP WITH TIME ZONE NULL,
  ADD COLUMN IF NOT EXISTS offer_attachment_url    TEXT      NULL,
  ADD COLUMN IF NOT EXISTS rejection_email_sent    BOOLEAN   DEFAULT false,
  ADD COLUMN IF NOT EXISTS rejection_email_sent_at TIMESTAMP WITH TIME ZONE NULL;

-- decision_date may already exist; safe to add if missing
ALTER TABLE applicants
  ADD COLUMN IF NOT EXISTS decision_date TIMESTAMP WITH TIME ZONE NULL;
