-- 013: Panorama tab — a parallel stack to the annotation feature for delivering
-- 360° equirectangular panoramas (Pannellum viewer) with hotspot comments and
-- public share links. Separate tables; comments use spherical pitch/yaw instead
-- of x/y percentages. Run manually in the Supabase SQL Editor.

-- ─── tables ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS panorama_projects (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_name  text NOT NULL,
  preview_url   text,                      -- thumbnail = first uploaded panorama
  raw_payload   jsonb,
  total_images  int DEFAULT 0,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS panorama_images (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  panorama_project_id  uuid NOT NULL REFERENCES panorama_projects(id) ON DELETE CASCADE,
  image_path           text NOT NULL,      -- equirectangular image public URL
  image_filename       text,
  name                 text,
  image_index          int,
  created_at           timestamptz DEFAULT now(),
  updated_at           timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS panorama_comments (
  id                 text PRIMARY KEY,     -- app-supplied (nanoid), matches markup_comments convention
  panorama_image_id  uuid NOT NULL REFERENCES panorama_images(id) ON DELETE CASCADE,
  pin_number         int NOT NULL,
  display_number     int,
  content            text NOT NULL,
  user_name          text NOT NULL,
  pitch              double precision NOT NULL,  -- -90..90
  yaw                double precision NOT NULL,  -- -180..180
  status             text DEFAULT 'active',      -- 'active' | 'resolved'
  type               text DEFAULT 'comment',     -- 'comment' | 'reply'
  parent_comment_id  text REFERENCES panorama_comments(id) ON DELETE CASCADE,
  created_at         timestamptz DEFAULT now(),
  updated_at         timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS panorama_project_access (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  panorama_project_id  uuid NOT NULL REFERENCES panorama_projects(id) ON DELETE CASCADE,
  user_email           text NOT NULL,
  granted_by           text,
  granted_at           timestamptz DEFAULT now(),
  UNIQUE (panorama_project_id, user_email)
);

-- Reconcile columns in case any table was created by an earlier/partial run.
-- (CREATE TABLE IF NOT EXISTS above will not add missing columns to a pre-existing table.)
ALTER TABLE panorama_projects ADD COLUMN IF NOT EXISTS preview_url  text;
ALTER TABLE panorama_projects ADD COLUMN IF NOT EXISTS raw_payload  jsonb;
ALTER TABLE panorama_projects ADD COLUMN IF NOT EXISTS total_images int DEFAULT 0;
ALTER TABLE panorama_projects ADD COLUMN IF NOT EXISTS created_at   timestamptz DEFAULT now();
ALTER TABLE panorama_projects ADD COLUMN IF NOT EXISTS updated_at   timestamptz DEFAULT now();

ALTER TABLE panorama_images ADD COLUMN IF NOT EXISTS image_filename text;
ALTER TABLE panorama_images ADD COLUMN IF NOT EXISTS name           text;
ALTER TABLE panorama_images ADD COLUMN IF NOT EXISTS image_index    int;
ALTER TABLE panorama_images ADD COLUMN IF NOT EXISTS created_at     timestamptz DEFAULT now();
ALTER TABLE panorama_images ADD COLUMN IF NOT EXISTS updated_at     timestamptz DEFAULT now();

ALTER TABLE panorama_comments ADD COLUMN IF NOT EXISTS display_number    int;
ALTER TABLE panorama_comments ADD COLUMN IF NOT EXISTS status            text DEFAULT 'active';
ALTER TABLE panorama_comments ADD COLUMN IF NOT EXISTS type              text DEFAULT 'comment';
ALTER TABLE panorama_comments ADD COLUMN IF NOT EXISTS parent_comment_id text REFERENCES panorama_comments(id) ON DELETE CASCADE;
ALTER TABLE panorama_comments ADD COLUMN IF NOT EXISTS created_at        timestamptz DEFAULT now();
ALTER TABLE panorama_comments ADD COLUMN IF NOT EXISTS updated_at        timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS panorama_images_project_idx  ON panorama_images (panorama_project_id);
CREATE INDEX IF NOT EXISTS panorama_comments_image_idx  ON panorama_comments (panorama_image_id);
CREATE INDEX IF NOT EXISTS panorama_access_email_idx    ON panorama_project_access (user_email);

-- ─── dashboard stats (mirrors get_projects_with_stats) ──────────────────────

CREATE OR REPLACE FUNCTION get_panorama_projects_with_stats(
  p_project_ids uuid[] DEFAULT NULL,     -- NULL = all (admin); members pass accessible ids
  p_search      text   DEFAULT NULL,
  p_sort        text   DEFAULT 'newest', -- 'newest' | 'oldest' | 'name'
  p_limit       int    DEFAULT 24,
  p_offset      int    DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  project_name text,
  preview_url text,
  created_at timestamptz,
  updated_at timestamptz,
  first_image text,
  total_images bigint,
  total_comments bigint,
  total_resolved_comments bigint,
  total_commented_images bigint,
  total_count bigint
)
LANGUAGE sql STABLE
SET search_path = public
AS $$
  WITH page AS (
    SELECT p.*, count(*) OVER () AS total_count
    FROM panorama_projects p
    WHERE (p_project_ids IS NULL OR p.id = ANY (p_project_ids))
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
    pg.preview_url,
    pg.created_at,
    pg.updated_at,
    (SELECT i.image_path FROM panorama_images i
      WHERE i.panorama_project_id = pg.id
      ORDER BY i.image_index ASC NULLS LAST, i.created_at ASC LIMIT 1) AS first_image,
    COALESCE(s.total_images, 0),
    COALESCE(s.total_comments, 0),
    COALESCE(s.total_resolved_comments, 0),
    COALESCE(s.total_commented_images, 0),
    pg.total_count
  FROM page pg
  LEFT JOIN LATERAL (
    SELECT
      count(DISTINCT i.id)                                          AS total_images,
      count(c.id) FILTER (WHERE c.type <> 'reply')                 AS total_comments,
      count(c.id) FILTER (WHERE c.status = 'resolved' AND c.type <> 'reply') AS total_resolved_comments,
      count(DISTINCT i.id) FILTER (WHERE c.id IS NOT NULL)         AS total_commented_images
    FROM panorama_images i
    LEFT JOIN panorama_comments c ON c.panorama_image_id = i.id
    WHERE i.panorama_project_id = pg.id
  ) s ON true;
$$;

-- All-projects access (p_project_ids = NULL) must be service-role only; the
-- server action does its own auth + panorama_project_access check.
REVOKE EXECUTE ON FUNCTION get_panorama_projects_with_stats(uuid[], text, text, int, int) FROM anon, authenticated, public;

-- ─── sharing: reuse the existing share_links table ──────────────────────────
-- Extend the resource-type enum so panorama projects can be shared via /share/[token].
ALTER TYPE share_resource_type ADD VALUE IF NOT EXISTS 'panorama_project';
