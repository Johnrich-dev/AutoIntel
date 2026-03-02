-- Migration: Add user_id column to applicants table
-- This column is required by the RLS policies in enable_rls.sql
-- Run this in Supabase SQL Editor

-- Add user_id column to applicants table
ALTER TABLE applicants ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_applicants_user_id ON applicants(user_id);

-- Note: You'll need to populate the user_id column for existing applicants
-- This requires linking each applicant to their auth.users record
