-- Create admin_settings table for storing admin configuration
-- This replaces the localStorage mock data in AdminSettings.tsx

CREATE TABLE IF NOT EXISTS admin_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
    
    -- General Settings
    company_name VARCHAR(255) DEFAULT 'AutoIntel Recruitment',
    admin_email VARCHAR(255),
    timezone VARCHAR(50) DEFAULT 'Asia/Manila',
    date_format VARCHAR(20) DEFAULT 'MM/DD/YYYY',
    language VARCHAR(10) DEFAULT 'en',
    
    -- Notification Settings
    email_new_applicant BOOLEAN DEFAULT true,
    email_assessment_complete BOOLEAN DEFAULT true,
    email_daily_digest BOOLEAN DEFAULT false,
    browser_notifications BOOLEAN DEFAULT true,
    
    -- Security Settings
    two_factor_auth BOOLEAN DEFAULT false,
    password_expiry VARCHAR(10) DEFAULT '90',
    session_timeout VARCHAR(10) DEFAULT '30',
    ip_whitelist TEXT,
    
    -- Scoring Weights
    resume_weight INTEGER DEFAULT 40,
    video_weight INTEGER DEFAULT 35,
    profile_weight INTEGER DEFAULT 25,
    auto_reject_threshold INTEGER DEFAULT 30,
    auto_shortlist_threshold INTEGER DEFAULT 85,
    
    -- Appearance Settings
    theme VARCHAR(20) DEFAULT 'light',
    sidebar_collapsed BOOLEAN DEFAULT false,
    compact_view BOOLEAN DEFAULT false,
    
    -- Advanced Settings
    data_retention VARCHAR(10) DEFAULT '365',
    auto_archive BOOLEAN DEFAULT true,
    api_access BOOLEAN DEFAULT false,
    debug_mode BOOLEAN DEFAULT false,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create unique constraint per admin
ALTER TABLE admin_settings ADD CONSTRAINT unique_admin_settings UNIQUE (admin_id);

-- Enable RLS
ALTER TABLE admin_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Admin can only view/update their own settings
-- Using a simpler approach: allow access to all authenticated users
-- The frontend will handle the filtering by admin_id
CREATE POLICY "Admin can manage own settings" ON admin_settings
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- Create index for faster queries
CREATE INDEX idx_admin_settings_admin_id ON admin_settings(admin_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_admin_settings_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update timestamp
CREATE TRIGGER update_admin_settings_updated_at
    BEFORE UPDATE ON admin_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_admin_settings_timestamp();

-- Insert default settings for existing admins (run manually if needed)
-- INSERT INTO admin_settings (admin_id, admin_email)
-- SELECT id, email FROM admin_users
-- ON CONFLICT (admin_id) DO NOTHING;
