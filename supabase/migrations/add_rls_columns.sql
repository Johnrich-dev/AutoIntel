-- STEP 1: Add columns needed for RLS (run this FIRST)
-- Run this in Supabase SQL Editor before enabling RLS

-- Add user_id column to applicants table (don't add FK constraint yet to avoid errors)
ALTER TABLE public.applicants 
ADD COLUMN IF NOT EXISTS user_id uuid;

-- Add performed_by column to admin_actions table
ALTER TABLE public.admin_actions 
ADD COLUMN IF NOT EXISTS performed_by uuid;

-- Create indexes for RLS performance
CREATE INDEX IF NOT EXISTS idx_applicants_user_id ON public.applicants(user_id);
CREATE INDEX IF NOT EXISTS idx_admin_actions_performed_by ON public.admin_actions(performed_by);
