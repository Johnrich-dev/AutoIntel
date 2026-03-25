-- Add admin settings columns to existing admin_users table
-- This replaces the localStorage mock data in AdminSettings.tsx
-- No new table needed - reuse existing admin_users

-- Add General Settings columns
ALTER TABLE admin_users 
ADD COLUMN IF NOT EXISTS company_name VARCHAR(255) DEFAULT 'AutoIntel Recruitment',
ADD COLUMN IF NOT EXISTS timezone VARCHAR(50) DEFAULT 'Asia/Manila',
ADD COLUMN IF NOT EXISTS date_format VARCHAR(20) DEFAULT 'MM/DD/YYYY',
ADD COLUMN IF NOT EXISTS language VARCHAR(10) DEFAULT 'en';

-- Add Notification Settings columns
ALTER TABLE admin_users 
ADD COLUMN IF NOT EXISTS email_new_applicant BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS email_assessment_complete BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS email_daily_digest BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS browser_notifications BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS webhook VARCHAR(500);

-- Add Security Settings columns
ALTER TABLE admin_users 
ADD COLUMN IF NOT EXISTS two_factor_auth BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS password_expiry VARCHAR(10) DEFAULT '90',
ADD COLUMN IF NOT EXISTS session_timeout VARCHAR(10) DEFAULT '30',
ADD COLUMN IF NOT EXISTS ip_whitelist TEXT;

-- Add Scoring Weights columns (for admin settings page)
ALTER TABLE admin_users 
ADD COLUMN IF NOT EXISTS resume_weight INTEGER DEFAULT 40,
ADD COLUMN IF NOT EXISTS video_weight INTEGER DEFAULT 35,
ADD COLUMN IF NOT EXISTS profile_weight INTEGER DEFAULT 25,
ADD COLUMN IF NOT EXISTS auto_reject_threshold INTEGER DEFAULT 30,
ADD COLUMN IF NOT EXISTS auto_shortlist_threshold INTEGER DEFAULT 85;

-- Add Appearance Settings columns
ALTER TABLE admin_users 
ADD COLUMN IF NOT EXISTS theme VARCHAR(20) DEFAULT 'light',
ADD COLUMN IF NOT EXISTS sidebar_collapsed BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS compact_view BOOLEAN DEFAULT false;

-- Add Advanced Settings columns
ALTER TABLE admin_users 
ADD COLUMN IF NOT EXISTS data_retention VARCHAR(10) DEFAULT '365',
ADD COLUMN IF NOT EXISTS auto_archive BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS api_access BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS debug_mode BOOLEAN DEFAULT false;

-- Update existing admin user with default email setting (run manually if needed)
-- UPDATE admin_users SET admin_email = email WHERE admin_email IS NULL;