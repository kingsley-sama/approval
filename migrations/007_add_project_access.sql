-- ============================================================
-- MIGRATION 007 — Project Access Control
-- Tracks which member-role users have been explicitly granted
-- access to specific projects by an admin.
-- ============================================================

CREATE TABLE IF NOT EXISTS project_access (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES markup_projects(id) ON DELETE CASCADE,
    user_email VARCHAR(255) NOT NULL,
    granted_by VARCHAR(255),
    granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(project_id, user_email)
);

CREATE INDEX IF NOT EXISTS idx_project_access_user_email ON project_access(user_email);
CREATE INDEX IF NOT EXISTS idx_project_access_project_id ON project_access(project_id);

ALTER TABLE project_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for authenticated users"
    ON project_access FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);
