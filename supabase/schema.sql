-- Willow Dashboard Database Schema

-- Users table
CREATE TABLE IF NOT EXISTS willow_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'editor', 'viewer')),
    is_active BOOLEAN DEFAULT true,
    last_login_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for email lookups
CREATE INDEX IF NOT EXISTS idx_willow_users_email ON willow_users(email);

-- Create updated_at trigger function (if not exists)
CREATE OR REPLACE FUNCTION willow_update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for users table
DROP TRIGGER IF EXISTS update_willow_users_updated_at ON willow_users;
CREATE TRIGGER update_willow_users_updated_at
    BEFORE UPDATE ON willow_users
    FOR EACH ROW
    EXECUTE FUNCTION willow_update_updated_at_column();

-- Projects table
CREATE TABLE IF NOT EXISTS willow_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'completed', 'on_hold', 'cancelled')),
    owner_id UUID REFERENCES willow_users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create trigger for projects table
DROP TRIGGER IF EXISTS update_willow_projects_updated_at ON willow_projects;
CREATE TRIGGER update_willow_projects_updated_at
    BEFORE UPDATE ON willow_projects
    FOR EACH ROW
    EXECUTE FUNCTION willow_update_updated_at_column();

-- Row Level Security Policies
ALTER TABLE willow_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE willow_projects ENABLE ROW LEVEL SECURITY;
