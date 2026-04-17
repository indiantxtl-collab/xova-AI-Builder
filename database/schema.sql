-- XOVA AI ENGINE - Database Schema
-- Production-ready PostgreSQL schema with proper indexing and constraints

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ===== USERS =====
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  username VARCHAR(100) UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  display_name VARCHAR(100),
  avatar_url TEXT,
  role VARCHAR(20) DEFAULT 'user' CHECK (role IN ('user', 'admin', 'enterprise')),
  email_verified BOOLEAN DEFAULT FALSE,
  two_factor_enabled BOOLEAN DEFAULT FALSE,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_login_at TIMESTAMP WITH TIME ZONE,
  
  -- Preferences
  preferences JSONB DEFAULT '{}'::jsonb,
  
  -- Soft delete
  deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_users_email ON users(email) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_username ON users(username) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_created ON users(created_at) WHERE deleted_at IS NULL;

-- ===== SESSIONS =====
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_sessions_token ON sessions(token_hash);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at) WHERE expires_at > NOW();

-- ===== PROJECTS =====
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  
  -- Architecture metadata
  app_type VARCHAR(50) NOT NULL,
  complexity VARCHAR(20) CHECK (complexity IN ('low', 'medium', 'high', 'enterprise')),
  estimated_files INTEGER,
  
  -- Generation state
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'generating', 'generated', 'published', 'archived')),
  prompt_text TEXT NOT NULL,
  architecture_plan JSONB NOT NULL,
  
  -- Deployment
  published_url VARCHAR(255),
  deployed_platform VARCHAR(50),
  deployed_at TIMESTAMP WITH TIME ZONE,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  generated_at TIMESTAMP WITH TIME ZONE,
  
  -- Soft delete
  deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_projects_user ON projects(user_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_projects_status ON projects(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_projects_created ON projects(created_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_projects_complexity ON projects(complexity) WHERE deleted_at IS NULL;

-- ===== FILES =====
CREATE TABLE IF NOT EXISTS project_files (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  file_path VARCHAR(500) NOT NULL,
  file_content TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  language VARCHAR(50) NOT NULL,
  
  -- Versioning
  version INTEGER DEFAULT 1,
  is_current BOOLEAN DEFAULT TRUE,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(project_id, file_path, version)
);

CREATE INDEX idx_files_project ON project_files(project_id, is_current);
CREATE INDEX idx_files_path ON project_files(file_path);
CREATE INDEX idx_files_language ON project_files(language);

-- ===== DEPLOYMENTS =====
CREATE TABLE IF NOT EXISTS deployments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  platform VARCHAR(50) NOT NULL CHECK (platform IN ('vercel', 'github', 'netlify', 'aws', 'custom')),
  environment VARCHAR(20) DEFAULT 'production' CHECK (environment IN ('development', 'staging', 'production')),
  
  -- Deployment details
  deploy_url VARCHAR(255),
  build_id VARCHAR(100),
  commit_hash VARCHAR(40),
  
  -- Status
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'building', 'deploying', 'success', 'failed')),
  error_message TEXT,
  
  -- Timing
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  
  -- Logs
  logs JSONB DEFAULT '[]'::jsonb
);

CREATE INDEX idx_deployments_project ON deployments(project_id);
CREATE INDEX idx_deployments_status ON deployments(status);
CREATE INDEX idx_deployments_platform ON deployments(platform);

-- ===== API KEYS =====
CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  key_hash VARCHAR(255) NOT NULL,
  prefix VARCHAR(10) NOT NULL, -- For display: xova_abc123...
  
  -- Permissions
  scopes TEXT[] DEFAULT ARRAY['read', 'write'],
  rate_limit INTEGER DEFAULT 1000, -- requests per hour
  
  -- Status
  active BOOLEAN DEFAULT TRUE,
  expires_at TIMESTAMP WITH TIME ZONE,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_used_at TIMESTAMP WITH TIME ZONE,
  used_count INTEGER DEFAULT 0
);

CREATE INDEX idx_api_keys_user ON api_keys(user_id, active);
CREATE INDEX idx_api_keys_prefix ON api_keys(prefix);

-- ===== ANALYTICS =====
CREATE TABLE IF NOT EXISTS analytics_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  
  -- Event details
  event_type VARCHAR(100) NOT NULL,
  event_data JSONB NOT NULL,
  
  -- Context
  ip_address INET,
  user_agent TEXT,
  referrer TEXT,
  
  -- Timing
  occurred_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_analytics_user ON analytics_events(user_id, occurred_at);
CREATE INDEX idx_analytics_project ON analytics_events(project_id, occurred_at);
CREATE INDEX idx_analytics_type ON analytics_events(event_type, occurred_at);
CREATE INDEX idx_analytics_time ON analytics_events(occurred_at);

-- ===== TRIGGERS =====
-- Auto-update updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_project_files_updated_at BEFORE UPDATE ON project_files
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ===== VIEWS =====
-- Project summary view
CREATE OR REPLACE VIEW project_summaries AS
SELECT 
  p.id,
  p.name,
  p.app_type,
  p.complexity,
  p.status,
  p.created_at,
  p.published_url,
  COUNT(DISTINCT pf.id) as file_count,
  SUM(pf.file_size) as total_size_bytes,
  d.platform as last_deploy_platform,
  d.status as last_deploy_status
FROM projects p
LEFT JOIN project_files pf ON p.id = pf.project_id AND pf.is_current = TRUE
LEFT JOIN deployments d ON p.id = d.project_id 
  AND d.id = (SELECT id FROM deployments WHERE project_id = p.id ORDER BY created_at DESC LIMIT 1)
WHERE p.deleted_at IS NULL
GROUP BY p.id, d.platform, d.status;

-- ===== SECURITY =====
-- Row Level Security (enable if using RLS)
-- ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY user_projects_policy ON projects
--   FOR SELECT USING (user_id = current_setting('app.current_user_id')::UUID OR role = 'admin');

-- ===== MAINTENANCE =====
-- Vacuum and analyze schedule (configure via pg_cron or external scheduler)
-- VACUUM ANALYZE users;
-- VACUUM ANALYZE projects;
-- VACUUM ANALYZE project_files;

-- ===== COMMENTS =====
COMMENT ON TABLE users IS 'Application users with authentication';
COMMENT ON TABLE projects IS 'Generated application projects';
COMMENT ON TABLE project_files IS 'Individual files within generated projects';
COMMENT ON TABLE deployments IS 'Deployment records for projects';
COMMENT ON TABLE analytics_events IS 'User interaction and system events';
