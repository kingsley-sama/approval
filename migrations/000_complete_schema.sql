-- ============================================================
-- COMPLETE SUPABASE SCHEMA — Annotation / Markup Tool
-- Run this in the Supabase SQL Editor on a fresh database.
-- Tables are created in dependency order (no forward refs).
-- ============================================================


-- ============================================================
-- SECTION 0 — EXTENSIONS
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";  -- uuid_generate_v4() (fallback)


-- ============================================================
-- SECTION 1 — ENUM TYPES
-- ============================================================
DO $$ BEGIN
    CREATE TYPE share_permission_type AS ENUM ('view', 'comment', 'draw_and_comment');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE share_resource_type AS ENUM ('thread', 'project');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ============================================================
-- SECTION 2 — LEGACY TABLES (kept for backward compatibility)
-- ============================================================

-- Original simple projects table
CREATE TABLE IF NOT EXISTS projects (
    id          SERIAL PRIMARY KEY,
    name        TEXT NOT NULL,
    description TEXT,
    date_created TIMESTAMPTZ DEFAULT NOW()
);

-- Original simple threads table
CREATE TABLE IF NOT EXISTS threads (
    id         SERIAL PRIMARY KEY,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    image_url  TEXT NOT NULL,
    markup_id  INTEGER
);

-- Original pin table
CREATE TABLE IF NOT EXISTS pin (
    id                  SERIAL PRIMARY KEY,
    x_cord              INTEGER NOT NULL,
    y_cord              INTEGER NOT NULL,
    comment_attatchment TEXT,
    date_added          TIMESTAMPTZ DEFAULT NOW(),
    thread_id           INTEGER REFERENCES threads(id) ON DELETE CASCADE
);


-- ============================================================
-- SECTION 3 — MARKUP PROJECTS
-- ============================================================
CREATE TABLE IF NOT EXISTS markup_projects (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_name          VARCHAR(300) NOT NULL,
    markup_url            TEXT,
    raw_payload           JSONB,
    total_screenshots     INTEGER DEFAULT 0,
    total_threads         INTEGER DEFAULT 0,
    extraction_timestamp  TIMESTAMPTZ,
    -- Duplication tracking (migration 003)
    is_duplicated         BOOLEAN DEFAULT FALSE,
    original_project_id   UUID    REFERENCES markup_projects(id) ON DELETE SET NULL,
    duplication_metadata  JSONB   DEFAULT '{}'::jsonb,
    created_at            TIMESTAMPTZ DEFAULT NOW(),
    updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_markup_projects_created_at ON markup_projects(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_markup_projects_original   ON markup_projects(original_project_id) WHERE original_project_id IS NOT NULL;

COMMENT ON TABLE  markup_projects                          IS 'Top-level project folders; each project groups a set of annotated image threads';
COMMENT ON COLUMN markup_projects.duplication_metadata     IS 'Stores info about duplication: when, by whom, what was copied';


-- ============================================================
-- SECTION 4 — MARKUP THREADS (images inside a project)
-- ============================================================
CREATE TABLE IF NOT EXISTS markup_threads (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id       UUID NOT NULL REFERENCES markup_projects(id) ON DELETE CASCADE,
    thread_name      VARCHAR(300) NOT NULL,
    image_path       TEXT,
    image_filename   TEXT,
    image_index      INTEGER,
    local_image_path TEXT,
    -- Duplication tracking (migration 003)
    is_duplicated       BOOLEAN DEFAULT FALSE,
    original_thread_id  UUID  REFERENCES markup_threads(id) ON DELETE SET NULL,
    duplication_metadata JSONB DEFAULT '{}'::jsonb,
    created_at       TIMESTAMPTZ DEFAULT NOW(),
    updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_markup_threads_project_id  ON markup_threads(project_id);
CREATE INDEX IF NOT EXISTS idx_markup_threads_created_at  ON markup_threads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_markup_threads_original    ON markup_threads(original_thread_id) WHERE original_thread_id IS NOT NULL;

COMMENT ON TABLE markup_threads IS 'Each row is one image belonging to a project; comments and drawings attach to a thread';


-- ============================================================
-- SECTION 5 — MARKUP COMMENTS (pins on an image)
-- ============================================================
CREATE TABLE IF NOT EXISTS markup_comments (
    id            TEXT PRIMARY KEY,           -- nanoid from app layer
    thread_id     UUID NOT NULL REFERENCES markup_threads(id) ON DELETE CASCADE,
    user_name     VARCHAR(200) NOT NULL,
    content       TEXT NOT NULL,
    pin_number    INTEGER NOT NULL,
    comment_index INTEGER NOT NULL,
    display_number INTEGER,
    -- Pin position as percentage of image dimensions (migration 004)
    x_position    FLOAT  NOT NULL DEFAULT 0,
    y_position    FLOAT  NOT NULL DEFAULT 0,
    status        TEXT   DEFAULT 'active' CHECK (status IN ('active', 'resolved', 'deleted')),
    -- Duplication tracking (migration 003)
    is_duplicated       BOOLEAN DEFAULT FALSE,
    original_comment_id TEXT REFERENCES markup_comments(id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_markup_comments_thread_id   ON markup_comments(thread_id);
CREATE INDEX IF NOT EXISTS idx_markup_comments_status      ON markup_comments(status);
CREATE INDEX IF NOT EXISTS idx_markup_comments_created_at  ON markup_comments(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_markup_comments_original    ON markup_comments(original_comment_id) WHERE original_comment_id IS NOT NULL;

COMMENT ON TABLE  markup_comments              IS 'Annotation pins placed on an image; each pin carries a comment and (x, y) position';
COMMENT ON COLUMN markup_comments.x_position  IS 'Horizontal position as a percentage (0–100) of the image width';
COMMENT ON COLUMN markup_comments.y_position  IS 'Vertical position as a percentage (0–100) of the image height';
COMMENT ON COLUMN markup_comments.status      IS 'Lifecycle state: active | resolved | deleted';


-- ============================================================
-- SECTION 6 — MARKUP DRAWINGS (freehand / shape overlays)
-- ============================================================
CREATE TABLE IF NOT EXISTS markup_drawings (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id           UUID NOT NULL REFERENCES markup_threads(id) ON DELETE CASCADE,
    drawing_data        JSONB NOT NULL,
    created_by          VARCHAR(150) NOT NULL,
    -- Duplication tracking (migration 001 + 003)
    is_duplicated       BOOLEAN DEFAULT FALSE,
    original_drawing_id UUID REFERENCES markup_drawings(id) ON DELETE SET NULL,
    metadata            JSONB DEFAULT '{}'::jsonb,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_markup_drawings_thread_id   ON markup_drawings(thread_id);
CREATE INDEX IF NOT EXISTS idx_markup_drawings_created_at  ON markup_drawings(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_markup_drawings_original_id ON markup_drawings(original_drawing_id) WHERE original_drawing_id IS NOT NULL;

COMMENT ON TABLE  markup_drawings             IS 'Stores drawing / markup data for images as JSON objects';
COMMENT ON COLUMN markup_drawings.drawing_data IS 'JSONB {shapes:[{type,points,color,...}], version:"1.0"}';
COMMENT ON COLUMN markup_drawings.is_duplicated IS 'TRUE when this drawing was created through project/thread duplication';


-- ============================================================
-- SECTION 7 — SHARE LINKS
-- ============================================================
CREATE TABLE IF NOT EXISTS share_links (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token            VARCHAR(64) UNIQUE NOT NULL,
    resource_type    share_resource_type NOT NULL,
    resource_id      UUID NOT NULL,
    permissions      share_permission_type NOT NULL DEFAULT 'view',
    created_by       VARCHAR(150) NOT NULL,
    expires_at       TIMESTAMPTZ,
    is_active        BOOLEAN DEFAULT TRUE,
    access_count     INTEGER DEFAULT 0,
    last_accessed_at TIMESTAMPTZ,
    metadata         JSONB DEFAULT '{}'::jsonb,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_share_links_token    ON share_links(token);
CREATE INDEX        IF NOT EXISTS idx_share_links_resource ON share_links(resource_type, resource_id);
CREATE INDEX        IF NOT EXISTS idx_share_links_expires  ON share_links(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX        IF NOT EXISTS idx_share_links_active   ON share_links(is_active)  WHERE is_active = TRUE;

COMMENT ON TABLE  share_links             IS 'Secure token-based links for external client access to images and projects';
COMMENT ON COLUMN share_links.token       IS 'Unique, unguessable URL-safe token (e.g. nanoid 32 chars)';
COMMENT ON COLUMN share_links.permissions IS 'view | comment | draw_and_comment';
COMMENT ON COLUMN share_links.expires_at  IS 'NULL = never expires';


-- ============================================================
-- SECTION 8 — TRIGGER: auto-update updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to every table that has updated_at
DO $$ 
DECLARE
    tbl TEXT;
BEGIN
    FOREACH tbl IN ARRAY ARRAY[
        'markup_projects',
        'markup_threads',
        'markup_comments',
        'markup_drawings'
    ]
    LOOP
        EXECUTE format(
            'DROP TRIGGER IF EXISTS trg_%1$s_set_updated_at ON %1$I;
             CREATE TRIGGER trg_%1$s_set_updated_at
                 BEFORE UPDATE ON %1$I
                 FOR EACH ROW EXECUTE FUNCTION set_updated_at();',
            tbl
        );
    END LOOP;
END $$;


-- ============================================================
-- SECTION 9 — UTILITY FUNCTIONS
-- ============================================================

-- Check if a share link token is currently valid
CREATE OR REPLACE FUNCTION is_share_link_valid(p_token VARCHAR)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM   share_links
        WHERE  token      = p_token
        AND    is_active  = TRUE
        AND    (expires_at IS NULL OR expires_at > NOW())
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Increment access count on a share link
CREATE OR REPLACE FUNCTION increment_share_link_access(p_token VARCHAR)
RETURNS VOID AS $$
BEGIN
    UPDATE share_links
    SET    access_count     = access_count + 1,
           last_accessed_at = NOW()
    WHERE  token = p_token;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Atomically duplicate a project with optional comments and drawings
CREATE OR REPLACE FUNCTION duplicate_project(
    p_source_project_id UUID,
    p_new_project_name  VARCHAR,
    p_copy_comments     BOOLEAN DEFAULT FALSE,
    p_copy_drawings     BOOLEAN DEFAULT FALSE,
    p_created_by        VARCHAR DEFAULT 'system'
)
RETURNS UUID AS $$
DECLARE
    v_new_project_id  UUID;
    v_thread_record   RECORD;
    v_new_thread_id   UUID;
    v_comment_record  RECORD;
    v_drawing_record  RECORD;
BEGIN
    -- 1. Clone the project row
    INSERT INTO markup_projects (
        project_name, markup_url,
        is_duplicated, original_project_id, duplication_metadata,
        created_at, updated_at
    )
    SELECT
        p_new_project_name,
        markup_url,
        TRUE,
        id,
        jsonb_build_object(
            'duplicated_at',      NOW(),
            'duplicated_by',      p_created_by,
            'copy_comments',      p_copy_comments,
            'copy_drawings',      p_copy_drawings
        ),
        NOW(), NOW()
    FROM  markup_projects
    WHERE id = p_source_project_id
    RETURNING id INTO v_new_project_id;

    -- 2. Clone threads (images)
    FOR v_thread_record IN
        SELECT * FROM markup_threads WHERE project_id = p_source_project_id
    LOOP
        INSERT INTO markup_threads (
            project_id, thread_name, image_path, image_filename,
            image_index, local_image_path,
            is_duplicated, original_thread_id,
            created_at, updated_at
        )
        VALUES (
            v_new_project_id,
            v_thread_record.thread_name,
            v_thread_record.image_path,
            v_thread_record.image_filename,
            v_thread_record.image_index,
            v_thread_record.local_image_path,
            TRUE, v_thread_record.id,
            NOW(), NOW()
        )
        RETURNING id INTO v_new_thread_id;

        -- 3. Optionally clone comments
        IF p_copy_comments THEN
            FOR v_comment_record IN
                SELECT * FROM markup_comments WHERE thread_id = v_thread_record.id
            LOOP
                INSERT INTO markup_comments (
                    id, thread_id, user_name, content,
                    pin_number, comment_index, display_number,
                    x_position, y_position, status,
                    is_duplicated, original_comment_id,
                    created_at, updated_at
                )
                VALUES (
                    gen_random_uuid()::text,
                    v_new_thread_id,
                    v_comment_record.user_name,
                    v_comment_record.content,
                    v_comment_record.pin_number,
                    v_comment_record.comment_index,
                    v_comment_record.display_number,
                    v_comment_record.x_position,
                    v_comment_record.y_position,
                    v_comment_record.status,
                    TRUE, v_comment_record.id,
                    NOW(), NOW()
                );
            END LOOP;
        END IF;

        -- 4. Optionally clone drawings
        IF p_copy_drawings THEN
            FOR v_drawing_record IN
                SELECT * FROM markup_drawings WHERE thread_id = v_thread_record.id
            LOOP
                INSERT INTO markup_drawings (
                    thread_id, drawing_data, created_by,
                    is_duplicated, original_drawing_id, metadata,
                    created_at, updated_at
                )
                VALUES (
                    v_new_thread_id,
                    v_drawing_record.drawing_data,
                    v_drawing_record.created_by,
                    TRUE, v_drawing_record.id,
                    v_drawing_record.metadata,
                    NOW(), NOW()
                );
            END LOOP;
        END IF;
    END LOOP;

    RETURN v_new_project_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION duplicate_project IS 'Atomically duplicates a project with optional comments and drawings. Returns the new project UUID.';


-- ============================================================
-- SECTION 10 — ROW LEVEL SECURITY (Supabase)
-- Enable RLS on every user-facing table and add permissive
-- policies. Tighten these per your auth requirements.
-- ============================================================

ALTER TABLE markup_projects  ENABLE ROW LEVEL SECURITY;
ALTER TABLE markup_threads   ENABLE ROW LEVEL SECURITY;
ALTER TABLE markup_comments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE markup_drawings  ENABLE ROW LEVEL SECURITY;
ALTER TABLE share_links      ENABLE ROW LEVEL SECURITY;

-- Drop any stale policies first (idempotent re-run safety)
DROP POLICY IF EXISTS "Allow all for authenticated users" ON markup_projects;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON markup_threads;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON markup_comments;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON markup_drawings;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON share_links;

-- markup_projects: authenticated users have full access
CREATE POLICY "Allow all for authenticated users"
    ON markup_projects FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- markup_threads: authenticated users have full access
CREATE POLICY "Allow all for authenticated users"
    ON markup_threads FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- markup_comments: authenticated users have full access
CREATE POLICY "Allow all for authenticated users"
    ON markup_comments FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- markup_drawings: authenticated users have full access
CREATE POLICY "Allow all for authenticated users"
    ON markup_drawings FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- share_links: authenticated users have full access
CREATE POLICY "Allow all for authenticated users"
    ON share_links FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- share_links: anonymous users can read valid (active, non-expired) links
DROP POLICY IF EXISTS "Public can read valid share links" ON share_links;
CREATE POLICY "Public can read valid share links"
    ON share_links FOR SELECT
    TO anon
    USING (is_active = TRUE AND (expires_at IS NULL OR expires_at > NOW()));


-- ============================================================
-- SECTION 11 — STORAGE BUCKET (run via Supabase Dashboard or
-- execute the helper below which uses the storage schema)
-- ============================================================
-- NOTE: Supabase does not expose storage.buckets to the SQL
-- editor by default.  Create the bucket manually in the
-- Dashboard → Storage → New Bucket:
--   Name:   screenshots
--   Public: true
--
-- Then run these storage policies:
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('screenshots', 'screenshots', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Storage policies
DROP POLICY IF EXISTS "Public can upload screenshots"  ON storage.objects;
DROP POLICY IF EXISTS "Public can read screenshots"    ON storage.objects;
DROP POLICY IF EXISTS "Public can delete screenshots"  ON storage.objects;

CREATE POLICY "Public can upload screenshots"
    ON storage.objects FOR INSERT
    TO public
    WITH CHECK (bucket_id = 'screenshots');

CREATE POLICY "Public can read screenshots"
    ON storage.objects FOR SELECT
    TO public
    USING (bucket_id = 'screenshots');

CREATE POLICY "Public can delete screenshots"
    ON storage.objects FOR DELETE
    TO public
    USING (bucket_id = 'screenshots');


-- ============================================================
-- DONE — all tables, indexes, triggers, functions, RLS
-- policies, and storage bucket are set up.
-- ============================================================
