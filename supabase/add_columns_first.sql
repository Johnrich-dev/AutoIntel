-- STEP 1: Add columns needed for RLS (run this FIRST)
-- Run this in Supabase SQL Editor before enabling RLS

-- Add user_id column to applicants table
ALTER TABLE public.applicants 
ADD COLUMN IF NOT EXISTS user_id uuid;

-- Add performed_by column to admin_actions table  
ALTER TABLE public.admin_actions 
ADD COLUMN IF NOT EXISTS performed_by uuid;

-- Optional: If you want to link existing records to auth.users, you'll need to update them manually
-- For new applicants, the app should set user_id when they sign up via Supabase Auth
