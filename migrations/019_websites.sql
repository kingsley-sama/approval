-- ============================================================
-- MIGRATION 019 — Websites section
--
-- A website review is an ordinary markup project with kind='website'.
-- Each "capture" (one URL at one viewport) is a markup_threads row, so the
-- entire annotation layer — pins, drawings, replies, attachments, project-wide
-- numbering, share links, duplication — applies with no changes at all.
--
-- Panorama (013) and Tours (014) got parallel tables because their comments
-- are spherical (pitch/yaw) and could not live in markup_comments. A website
-- capture is a screenshot, and a screenshot is an image, so the x/y percentage
-- model already fits. Splitting it out would fork ~7k lines of workspace code
-- for no gain.
--
-- Run manually in the Supabase SQL Editor.
-- ============================================================


-- ─── 1. project kind + site metadata ──────────────────────────────────────

ALTER TABLE markup_projects
  ADD COLUMN IF NOT EXISTS kind             text NOT NULL DEFAULT 'image',
  ADD COLUMN IF NOT EXISTS site_url         text,
  ADD COLUMN IF NOT EXISTS capture_defaults jsonb DEFAULT '{}'::jsonb;

DO $$ BEGIN
  ALTER TABLE markup_projects
    ADD CONSTRAINT markup_projects_kind_check CHECK (kind IN ('image', 'website'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS markup_projects_kind_idx ON markup_projects (kind);

COMMENT ON COLUMN markup_projects.kind             IS 'image = uploaded files (Projects tab); website = URL captures (Websites tab)';
COMMENT ON COLUMN markup_projects.site_url         IS 'Root URL under review; individual captures carry their own source_url';
COMMENT ON COLUMN markup_projects.capture_defaults IS 'Reused on re-capture so versions stay comparable: {fullPage, viewports[], hideSelectors[], waitMs}';


-- ─── 2. capture provenance on threads ─────────────────────────────────────
-- A thread with source_url IS NULL is an ordinary uploaded image, which is
-- what every pre-existing row is.

ALTER TABLE markup_threads
  ADD COLUMN IF NOT EXISTS source_url           text,
  ADD COLUMN IF NOT EXISTS page_title           text,
  ADD COLUMN IF NOT EXISTS viewport_label       text,
  ADD COLUMN IF NOT EXISTS viewport_width       int,
  ADD COLUMN IF NOT EXISTS captured_at          timestamptz,
  ADD COLUMN IF NOT EXISTS capture_status       text DEFAULT 'ready',
  ADD COLUMN IF NOT EXISTS capture_version      int  DEFAULT 1,
  ADD COLUMN IF NOT EXISTS supersedes_thread_id uuid REFERENCES markup_threads(id) ON DELETE SET NULL;

DO $$ BEGIN
  ALTER TABLE markup_threads
    ADD CONSTRAINT markup_threads_capture_status_check
    CHECK (capture_status IN ('pending', 'ready', 'failed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS markup_threads_superseded_idx
  ON markup_threads (supersedes_thread_id) WHERE supersedes_thread_id IS NOT NULL;

COMMENT ON COLUMN markup_threads.source_url           IS 'URL this screenshot was taken from; NULL for uploaded images';
COMMENT ON COLUMN markup_threads.viewport_label       IS 'desktop | tablet | mobile';
COMMENT ON COLUMN markup_threads.capture_status       IS 'pending while the worker runs, then ready or failed';
COMMENT ON COLUMN markup_threads.supersedes_thread_id IS 'Set on a re-capture; points at the version this one replaces so resolved comments keep their evidence';


-- ─── 3. capture jobs ──────────────────────────────────────────────────────
-- Async status the dashboard can poll. The thread row is created up front in
-- 'pending' so the capture has a stable place to land and the UI has a tile
-- to show.

CREATE TABLE IF NOT EXISTS website_capture_jobs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   uuid NOT NULL REFERENCES markup_projects(id) ON DELETE CASCADE,
  thread_id    uuid REFERENCES markup_threads(id) ON DELETE SET NULL,
  url          text NOT NULL,
  viewport     text NOT NULL DEFAULT 'desktop',
  status       text NOT NULL DEFAULT 'queued',
  error        text,
  requested_by text,
  created_at   timestamptz DEFAULT now(),
  finished_at  timestamptz
);

DO $$ BEGIN
  ALTER TABLE website_capture_jobs
    ADD CONSTRAINT website_capture_jobs_status_check
    CHECK (status IN ('queued', 'running', 'done', 'failed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS website_capture_jobs_project_idx ON website_capture_jobs (project_id, status);
CREATE INDEX IF NOT EXISTS website_capture_jobs_thread_idx  ON website_capture_jobs (thread_id);


-- ─── 4. access control ────────────────────────────────────────────────────
-- Mirrors project_access / panorama_project_access. Kept separate from
-- project_access so granting someone a website review does not also hand them
-- an image project, even though both live in markup_projects.

CREATE TABLE IF NOT EXISTS website_project_access (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES markup_projects(id) ON DELETE CASCADE,
  user_email text NOT NULL,
  granted_by text,
  granted_at timestamptz DEFAULT now(),
  UNIQUE (project_id, user_email)
);

CREATE INDEX IF NOT EXISTS website_project_access_email_idx ON website_project_access (user_email);

ALTER TABLE website_capture_jobs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE website_project_access  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for authenticated users" ON website_capture_jobs;
CREATE POLICY "Allow all for authenticated users"
  ON website_capture_jobs FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all for authenticated users" ON website_project_access;
CREATE POLICY "Allow all for authenticated users"
  ON website_project_access FOR ALL TO authenticated USING (true) WITH CHECK (true);


-- ─── 5. dashboard stats, now kind-aware ───────────────────────────────────
--
-- IMPORTANT: this adds a parameter, which CREATE OR REPLACE cannot do — it
-- would create a second overload and leave PostgREST unable to choose. The old
-- signature must be dropped first.
--
-- p_kind defaults to 'image' so an un-migrated caller keeps seeing exactly the
-- projects it saw before. Without this filter every website project would
-- appear in the Projects tab the moment section 1 ran.

DROP FUNCTION IF EXISTS get_projects_with_stats(uuid[], text, text, int, int);

CREATE OR REPLACE FUNCTION get_projects_with_stats(
  p_project_ids uuid[] DEFAULT NULL,
  p_search      text   DEFAULT NULL,
  p_sort        text   DEFAULT 'newest',
  p_limit       int    DEFAULT 24,
  p_offset      int    DEFAULT 0,
  p_kind        text   DEFAULT 'image'
)
RETURNS TABLE (
  id uuid,
  project_name varchar,
  markup_url text,
  kind text,
  site_url text,
  created_at timestamptz,
  updated_at timestamptz,
  first_image text,
  total_images bigint,
  total_comments bigint,
  total_resolved_comments bigint,
  total_commented_threads bigint,
  total_pending_captures bigint,
  total_count bigint
)
LANGUAGE sql STABLE
SET search_path = public
AS $$
  WITH page AS (
    SELECT p.*, count(*) OVER () AS total_count
    FROM markup_projects p
    WHERE (p_project_ids IS NULL OR p.id = ANY (p_project_ids))
      AND (p_kind IS NULL OR p.kind = p_kind)
      AND (p_search IS NULL OR p_search = '' OR p.project_name ILIKE '%' || p_search || '%')
    ORDER BY
      CASE WHEN p_sort = 'name'   THEN p.project_name END ASC,
      CASE WHEN p_sort = 'oldest' THEN p.updated_at   END ASC,
      CASE WHEN p_sort NOT IN ('name','oldest') THEN p.updated_at END DESC
    LIMIT p_limit OFFSET p_offset
  )
  SELECT
    pg.id,
    pg.project_name,
    pg.markup_url,
    pg.kind,
    pg.site_url,
    pg.created_at,
    pg.updated_at,
    -- Ordering is 012's, unchanged. The only addition is the NOT NULL guard:
    -- a website capture has no image until the worker delivers it, and a NULL
    -- cover would render as a broken tile on the dashboard.
    (SELECT t.image_path FROM markup_threads t
      WHERE t.project_id = pg.id AND t.image_path IS NOT NULL
      ORDER BY t.created_at ASC LIMIT 1) AS first_image,
    COALESCE(s.total_images, 0),
    COALESCE(s.total_comments, 0),
    COALESCE(s.total_resolved_comments, 0),
    COALESCE(s.total_commented_threads, 0),
    COALESCE(s.total_pending_captures, 0),
    pg.total_count
  FROM page pg
  LEFT JOIN LATERAL (
    SELECT
      count(DISTINCT t.id)                                 AS total_images,
      count(c.id)                                          AS total_comments,
      count(c.id) FILTER (WHERE c.status = 'resolved')     AS total_resolved_comments,
      count(DISTINCT t.id) FILTER (WHERE c.id IS NOT NULL) AS total_commented_threads,
      -- New. Zero for image projects, which have no pending captures.
      count(DISTINCT t.id) FILTER (WHERE t.capture_status = 'pending') AS total_pending_captures
    FROM markup_threads t
    LEFT JOIN markup_comments c ON c.thread_id = t.id
    WHERE t.project_id = pg.id
  ) s ON true;
$$;

-- With p_project_ids = NULL this returns every project, so it stays
-- service-role only; the server action does its own auth + access check.
REVOKE EXECUTE ON FUNCTION get_projects_with_stats(uuid[], text, text, int, int, text) FROM anon, authenticated, public;


-- ─── 6. duplication carries the capture columns ───────────────────────────
-- duplicate_project() copies threads column by column, so a duplicated website
-- review would otherwise lose every URL and come back as a set of nameless
-- images.
--
-- This is migration 017's function verbatim, with only the new columns added
-- to the two INSERTs. Everything 017 established is preserved deliberately:
-- the p_selected_thread_ids parameter (a different signature would create a
-- second overload rather than replace this one, breaking duplication), the
-- source created_at timestamps that keep comment order stable, the reply
-- parent remapping, and the project_comment_counters seed that stops a
-- duplicate's first new comment from colliding with a copied pin number.
--
-- If 017 is ever revised, re-apply that revision here too.

CREATE OR REPLACE FUNCTION duplicate_project(
  p_source_project_id UUID,
  p_new_project_name  VARCHAR,
  p_copy_comments     BOOLEAN DEFAULT FALSE,
  p_copy_drawings     BOOLEAN DEFAULT FALSE,
  p_created_by        VARCHAR DEFAULT 'system',
  p_selected_thread_ids UUID[] DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_new_project_id         UUID;
  v_thread_record          RECORD;
  v_new_thread_id          UUID;
  v_drawing_record         RECORD;
  v_new_drawing_id         UUID;
  v_comment_record         RECORD;
  v_legacy_reply_record    RECORD;
  v_new_comment_id         TEXT;
  v_new_parent_comment_id  TEXT;
  v_effective_type         TEXT;
  v_drawing_map            JSONB;
  v_comment_map            JSONB;
BEGIN
  -- 1) Clone project row
  INSERT INTO markup_projects (
    project_name,
    markup_url,
    kind,
    site_url,
    capture_defaults,
    is_duplicated,
    original_project_id,
    duplication_metadata,
    created_at,
    updated_at
  )
  SELECT
    p_new_project_name,
    markup_url,
    kind,
    site_url,
    capture_defaults,
    TRUE,
    id,
    jsonb_build_object(
      'duplicated_at', NOW(),
      'duplicated_by', p_created_by,
      'copy_comments', p_copy_comments,
      'copy_drawings', p_copy_drawings,
      'selective_threads', p_selected_thread_ids IS NOT NULL
    ),
    NOW(),
    NOW()
  FROM markup_projects
  WHERE id = p_source_project_id
  RETURNING id INTO v_new_project_id;

  -- 2) Clone thread rows (filtering if p_selected_thread_ids is provided)
  FOR v_thread_record IN
    SELECT * FROM markup_threads 
    WHERE project_id = p_source_project_id
      AND (p_selected_thread_ids IS NULL OR id = ANY(p_selected_thread_ids))
  LOOP
    INSERT INTO markup_threads (
      project_id,
      thread_name,
      image_path,
      image_filename,
      image_index,
      local_image_path,
      source_url,
      page_title,
      viewport_label,
      viewport_width,
      captured_at,
      capture_status,
      capture_version,
      is_duplicated,
      original_thread_id,
      created_at,
      updated_at
    )
    VALUES (
      v_new_project_id,
      v_thread_record.thread_name,
      v_thread_record.image_path,
      v_thread_record.image_filename,
      v_thread_record.image_index,
      v_thread_record.local_image_path,
      v_thread_record.source_url,
      v_thread_record.page_title,
      v_thread_record.viewport_label,
      v_thread_record.viewport_width,
      v_thread_record.captured_at,
      v_thread_record.capture_status,
      v_thread_record.capture_version,
      TRUE,
      v_thread_record.id,
      -- Order fidelity: keep the source timestamp (see header).
      v_thread_record.created_at,
      NOW()
    )
    RETURNING id INTO v_new_thread_id;

    -- Fresh maps per thread
    v_drawing_map := '{}'::jsonb;
    v_comment_map := '{}'::jsonb;

    -- 3) Build drawing id map for reference-based duplication.
    -- We keep references to existing drawings instead of cloning drawing_data.
    IF p_copy_drawings THEN
      FOR v_drawing_record IN
        SELECT id
        FROM markup_drawings
        WHERE thread_id = v_thread_record.id
        ORDER BY id
      LOOP
        v_drawing_map := v_drawing_map || jsonb_build_object(
          v_drawing_record.id::text,
          v_drawing_record.id::text
        );
      END LOOP;
    END IF;

    -- 4) Optionally copy top-level comments (non-replies)
    IF p_copy_comments THEN
      FOR v_comment_record IN
        SELECT *
        FROM markup_comments
        WHERE thread_id = v_thread_record.id
          AND parent_comment_id IS NULL
          AND COALESCE(type, 'comment') <> 'reply'
        ORDER BY created_at, id
      LOOP
        v_new_comment_id := gen_random_uuid()::text;
        v_effective_type := COALESCE(v_comment_record.type, 'comment');

        -- If drawings weren't copied, degrade drawing comments to plain comments.
        IF v_effective_type = 'drawing' AND (
          NOT p_copy_drawings OR
          v_comment_record.drawing_id IS NULL OR
          NOT (v_drawing_map ? v_comment_record.drawing_id::text)
        ) THEN
          v_effective_type := 'comment';
        END IF;

        INSERT INTO markup_comments (
          id,
          thread_id,
          user_name,
          content,
          pin_number,
          comment_index,
          display_number,
          x_position,
          y_position,
          status,
          type,
          drawing_id,
          parent_comment_id,
          is_duplicated,
          original_comment_id,
          created_at,
          updated_at
        )
        VALUES (
          v_new_comment_id,
          v_new_thread_id,
          v_comment_record.user_name,
          v_comment_record.content,
          v_comment_record.pin_number,
          v_comment_record.comment_index,
          v_comment_record.display_number,
          v_comment_record.x_position,
          v_comment_record.y_position,
          v_comment_record.status,
          v_effective_type,
          CASE
            WHEN p_copy_drawings
             AND v_comment_record.drawing_id IS NOT NULL
             AND (v_drawing_map ? v_comment_record.drawing_id::text)
            THEN (v_drawing_map ->> v_comment_record.drawing_id::text)::uuid
            ELSE NULL
          END,
          NULL,
          TRUE,
          v_comment_record.id,
          -- Order fidelity: keep the source timestamp (see header).
          v_comment_record.created_at,
          NOW()
        );

        v_comment_map := v_comment_map || jsonb_build_object(
          v_comment_record.id,
          v_new_comment_id
        );

        -- Copy attachments tied to this comment
        INSERT INTO comment_attachments (
          comment_id,
          project_id,
          storage_path,
          original_filename,
          mime_type,
          file_size_bytes,
          created_at
        )
        SELECT
          v_new_comment_id,
          v_new_project_id,
          storage_path,
          original_filename,
          mime_type,
          file_size_bytes,
          NOW()
        FROM comment_attachments
        WHERE comment_id = v_comment_record.id;
      END LOOP;

      -- 5) Copy typed replies from markup_comments with remapped parent ids
      FOR v_comment_record IN
        SELECT *
        FROM markup_comments
        WHERE thread_id = v_thread_record.id
          AND (
          COALESCE(type, 'comment') = 'reply'
          OR parent_comment_id IS NOT NULL
          )
        ORDER BY created_at, id
      LOOP
        IF v_comment_record.parent_comment_id IS NULL THEN
          CONTINUE;
        END IF;

        IF NOT (v_comment_map ? v_comment_record.parent_comment_id) THEN
          CONTINUE;
        END IF;

        v_new_parent_comment_id := v_comment_map ->> v_comment_record.parent_comment_id;
        v_new_comment_id := gen_random_uuid()::text;

        INSERT INTO markup_comments (
          id,
          thread_id,
          user_name,
          content,
          pin_number,
          comment_index,
          display_number,
          x_position,
          y_position,
          status,
          type,
          drawing_id,
          parent_comment_id,
          is_duplicated,
          original_comment_id,
          created_at,
          updated_at
        )
        VALUES (
          v_new_comment_id,
          v_new_thread_id,
          v_comment_record.user_name,
          v_comment_record.content,
          v_comment_record.pin_number,
          v_comment_record.comment_index,
          v_comment_record.display_number,
          v_comment_record.x_position,
          v_comment_record.y_position,
          v_comment_record.status,
          'reply',
          CASE
            WHEN p_copy_drawings
             AND v_comment_record.drawing_id IS NOT NULL
             AND (v_drawing_map ? v_comment_record.drawing_id::text)
            THEN (v_drawing_map ->> v_comment_record.drawing_id::text)::uuid
            ELSE NULL
          END,
          v_new_parent_comment_id,
          TRUE,
          v_comment_record.id,
          -- Order fidelity: keep the source timestamp (see header).
          v_comment_record.created_at,
          NOW()
        );

        v_comment_map := v_comment_map || jsonb_build_object(
          v_comment_record.id,
          v_new_comment_id
        );

        INSERT INTO comment_attachments (
          comment_id,
          project_id,
          storage_path,
          original_filename,
          mime_type,
          file_size_bytes,
          created_at
        )
        SELECT
          v_new_comment_id,
          v_new_project_id,
          storage_path,
          original_filename,
          mime_type,
          file_size_bytes,
          NOW()
        FROM comment_attachments
        WHERE comment_id = v_comment_record.id;
      END LOOP;

      -- 6) Legacy bridge: copy old comment_replies rows that are not yet in markup_comments
      IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'comment_replies'
      ) THEN
        FOR v_legacy_reply_record IN
          SELECT cr.*
          FROM comment_replies cr
          JOIN markup_comments parent ON parent.id = cr.comment_id
          WHERE parent.thread_id = v_thread_record.id
            AND NOT EXISTS (
            SELECT 1
            FROM markup_comments typed_reply
            WHERE typed_reply.id = cr.id
              AND typed_reply.thread_id = parent.thread_id
              AND (
              COALESCE(typed_reply.type, 'comment') = 'reply'
              OR typed_reply.parent_comment_id IS NOT NULL
              )
            )
          ORDER BY cr.created_at, cr.id
        LOOP
          IF NOT (v_comment_map ? v_legacy_reply_record.comment_id) THEN
            CONTINUE;
          END IF;

          v_new_parent_comment_id := v_comment_map ->> v_legacy_reply_record.comment_id;
          v_new_comment_id := gen_random_uuid()::text;

          INSERT INTO markup_comments (
            id,
            thread_id,
            user_name,
            content,
            pin_number,
            comment_index,
            display_number,
            x_position,
            y_position,
            status,
            type,
            drawing_id,
            parent_comment_id,
            is_duplicated,
            original_comment_id,
            created_at,
            updated_at
          )
          SELECT
            v_new_comment_id,
            v_new_thread_id,
            v_legacy_reply_record.user_name,
            v_legacy_reply_record.content,
            parent_new.pin_number,
            parent_new.comment_index,
            parent_new.display_number,
            parent_new.x_position,
            parent_new.y_position,
            'active',
            'reply',
            NULL,
            v_new_parent_comment_id,
            TRUE,
            v_legacy_reply_record.id,
            -- Order fidelity: keep the source timestamp (see header).
            v_legacy_reply_record.created_at,
            NOW()
          FROM markup_comments parent_new
          WHERE parent_new.id = v_new_parent_comment_id;

          INSERT INTO comment_attachments (
            comment_id,
            project_id,
            storage_path,
            original_filename,
            mime_type,
            file_size_bytes,
            created_at
          )
          SELECT
            v_new_comment_id,
            v_new_project_id,
            storage_path,
            original_filename,
            mime_type,
            file_size_bytes,
            NOW()
          FROM comment_attachments
          WHERE comment_id = v_legacy_reply_record.id;
        END LOOP;
      END IF;
    END IF;
  END LOOP;

  -- Seed the clone's number allocator past every copied number, so the next
  -- comment created in the duplicate continues the sequence instead of
  -- restarting at 1 and colliding with a copied comment.
  -- Guarded: the counter table arrives with migration 016. On a database that
  -- has not run it yet, duplication must still succeed.
  IF to_regclass('public.project_comment_counters') IS NOT NULL THEN
    INSERT INTO public.project_comment_counters (project_id, last_number, updated_at)
    SELECT
      v_new_project_id,
      COALESCE(MAX(GREATEST(COALESCE(c.display_number, 0), COALESCE(c.pin_number, 0))), 0),
      NOW()
    FROM markup_threads t
    LEFT JOIN markup_comments c ON c.thread_id = t.id
    WHERE t.project_id = v_new_project_id
    ON CONFLICT (project_id) DO UPDATE
      SET last_number = GREATEST(
            public.project_comment_counters.last_number,
            EXCLUDED.last_number
          ),
          updated_at  = NOW();
  END IF;

  -- Update total_threads on the cloned project
  UPDATE markup_projects
  SET total_threads = (
    SELECT COUNT(*) FROM markup_threads WHERE project_id = v_new_project_id
  )
  WHERE id = v_new_project_id;

  RETURN v_new_project_id;
END;
$$ LANGUAGE plpgsql;


-- ─── 6b. unique review names, scoped to websites only ─────────────────────
-- 015 intended a global unique index on lower(trim(project_name)), but it is
-- NOT present on this database and four existing project names are duplicated,
-- so any table-wide unique index would fail outright.
--
-- Rather than rename live projects to satisfy a constraint that was never in
-- force, this indexes website reviews only. Image projects keep exactly the
-- behaviour they have today, and the new section still gets a race-proof
-- backstop behind createWebsiteProject's own name disambiguation.
--
-- A partial index also means a website review and an image project may share a
-- name, which is what we want: they live in different tabs.

DROP INDEX IF EXISTS markup_projects_name_unique;

CREATE UNIQUE INDEX IF NOT EXISTS markup_projects_website_name_unique
  ON markup_projects (lower(trim(project_name)))
  WHERE kind = 'website';


-- ─── 7. share links ───────────────────────────────────────────────────────
-- MUST be the last statement and must run on its own. Postgres refuses to use
-- a newly added enum label inside the transaction that added it, so anything
-- referencing 'website_project' below this line would fail. 013 and 014 do the
-- same thing for the same reason.

ALTER TYPE share_resource_type ADD VALUE IF NOT EXISTS 'website_project';
