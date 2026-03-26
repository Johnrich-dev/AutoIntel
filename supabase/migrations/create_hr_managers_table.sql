-- Create HR Managers table for interview scheduling
-- This table stores HR managers / interviewers who can be assigned to interviews

CREATE TABLE IF NOT EXISTS hr_managers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    role VARCHAR(100) DEFAULT 'HR Manager',
    department VARCHAR(100),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE hr_managers ENABLE ROW LEVEL SECURITY;

-- Allow admin full access
CREATE POLICY "Allow full access to hr_managers for authenticated users"
    ON hr_managers FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- Insert sample HR managers (you can add more or remove these)
INSERT INTO hr_managers (name, email, role, department, is_active) VALUES
    ('Mary Car Aguinaldo', 'alayaayjohnrich@gmail.com', 'Application Developer Manager', 'MIS', true),
    ('Ricardo Ogayon', 'zackaryylloyd@gmail.com', 'Data Engineer Manager', 'MIS', true)
ON CONFLICT (email) DO NOTHING;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_hr_managers_email ON hr_managers(email);
CREATE INDEX IF NOT EXISTS idx_hr_managers_is_active ON hr_managers(is_active) WHERE is_active = true;
