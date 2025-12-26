-- ====================================
-- SHAREABLE LINKS SCHEMA
-- ====================================
-- Secure token-based sharing system for images and projects
-- Supports view-only, comment, and draw+comment permissions

CREATE TYPE share_permission_type AS ENUM ('view', 'comment', 'draw_and_comment');
CREATE TYPE share_resource_type AS ENUM ('thread', 'project');

CREATE TABLE IF NOT EXISTS share_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token VARCHAR(64) UNIQUE NOT NULL, -- Unguessable random token
    resource_type share_resource_type NOT NULL,
    resource_id UUID NOT NULL, -- Can be thread_id or project_id
    permissions share_permission_type NOT NULL DEFAULT 'view',
    created_by VARCHAR(150) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ, -- NULL means never expires
    is_active BOOLEAN DEFAULT TRUE,
    access_count INTEGER DEFAULT 0, -- Track how many times link was accessed
    last_accessed_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}'::jsonb -- Additional settings like password protection, etc.
);

-- Indexes for performance
CREATE UNIQUE INDEX idx_share_links_token ON share_links(token);
CREATE INDEX idx_share_links_resource ON share_links(resource_type, resource_id);
CREATE INDEX idx_share_links_expires_at ON share_links(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX idx_share_links_active ON share_links(is_active) WHERE is_active = TRUE;

-- Function to check if a share link is valid
CREATE OR REPLACE FUNCTION is_share_link_valid(p_token VARCHAR)
RETURNS BOOLEAN AS $$
DECLARE
    v_link share_links%ROWTYPE;
BEGIN
    SELECT * INTO v_link
    FROM share_links
    WHERE token = p_token
    AND is_active = TRUE
    AND (expires_at IS NULL OR expires_at > NOW());
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Function to increment access count
CREATE OR REPLACE FUNCTION increment_share_link_access(p_token VARCHAR)
RETURNS VOID AS $$
BEGIN
    UPDATE share_links
    SET access_count = access_count + 1,
        last_accessed_at = NOW()
    WHERE token = p_token;
END;
$$ LANGUAGE plpgsql;

-- Comments
COMMENT ON TABLE share_links IS 'Secure shareable links for external client access to images and projects';
COMMENT ON COLUMN share_links.token IS 'Unique, unguessable token for sharing (e.g., nanoid or crypto random)';
COMMENT ON COLUMN share_links.permissions IS 'Defines what clients can do: view, comment, or draw_and_comment';
COMMENT ON COLUMN share_links.expires_at IS 'Optional expiration date for time-limited sharing';
