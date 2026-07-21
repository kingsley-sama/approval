-- 014: Virtual Tours tab — Biganto-style walkable 360° tours built on the
-- panorama (Pannellum) stack. A tour is a set of equirectangular scenes linked
-- by navigation hotspots; viewers "walk" between rooms by clicking arrows
-- inside the panorama. Run manually in the Supabase SQL Editor.

-- ─── tables ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tour_projects (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_name   text NOT NULL,
  description    text,
  preview_url    text,                     -- thumbnail = first uploaded scene
  start_scene_id uuid,                     -- FK added below (tour_scenes doesn't exist yet)
  total_scenes   int DEFAULT 0,
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tour_scenes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tour_project_id  uuid NOT NULL REFERENCES tour_projects(id) ON DELETE CASCADE,
  name             text,
  image_path       text NOT NULL,          -- equirectangular image public URL
  image_filename   text,
  scene_index      int,
  initial_pitch    double precision DEFAULT 0,   -- camera start view: -90..90
  initial_yaw      double precision DEFAULT 0,   -- -180..180
  initial_hfov     double precision DEFAULT 110, -- zoom level on entry
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);

-- Navigation link placed inside a scene; clicking it walks to target_scene.
CREATE TABLE IF NOT EXISTS tour_hotspots (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scene_id         uuid NOT NULL REFERENCES tour_scenes(id) ON DELETE CASCADE,
  target_scene_id  uuid NOT NULL REFERENCES tour_scenes(id) ON DELETE CASCADE,
  pitch            double precision NOT NULL,  -- position on the sphere: -90..90
  yaw              double precision NOT NULL,  -- -180..180
  label            text,                       -- e.g. "Living room" (defaults to target scene name)
  target_pitch     double precision,           -- NULL = use target scene's initial view
  target_yaw       double precision,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tour_project_access (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tour_project_id  uuid NOT NULL REFERENCES tour_projects(id) ON DELETE CASCADE,
  user_email       text NOT NULL,
  granted_by       text,
  granted_at       timestamptz DEFAULT now(),
  UNIQUE (tour_project_id, user_email)
);

-- start_scene_id → tour_scenes, added after both tables exist (circular reference).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tour_projects_start_scene_fkey'
  ) THEN
    ALTER TABLE tour_projects
      ADD CONSTRAINT tour_projects_start_scene_fkey
      FOREIGN KEY (start_scene_id) REFERENCES tour_scenes(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS tour_scenes_project_idx    ON tour_scenes (tour_project_id);
CREATE INDEX IF NOT EXISTS tour_hotspots_scene_idx    ON tour_hotspots (scene_id);
CREATE INDEX IF NOT EXISTS tour_hotspots_target_idx   ON tour_hotspots (target_scene_id);
CREATE INDEX IF NOT EXISTS tour_access_email_idx      ON tour_project_access (user_email);

-- ─── dashboard stats (mirrors get_panorama_projects_with_stats) ─────────────

CREATE OR REPLACE FUNCTION get_tour_projects_with_stats(
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
  total_scenes bigint,
  total_hotspots bigint,
  total_linked_scenes bigint,
  total_count bigint
)
LANGUAGE sql STABLE
SET search_path = public
AS $$
  WITH page AS (
    SELECT p.*, count(*) OVER () AS total_count
    FROM tour_projects p
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
    (SELECT s.image_path FROM tour_scenes s
      WHERE s.tour_project_id = pg.id
      ORDER BY s.scene_index ASC NULLS LAST, s.created_at ASC LIMIT 1) AS first_image,
    COALESCE(st.total_scenes, 0),
    COALESCE(st.total_hotspots, 0),
    COALESCE(st.total_linked_scenes, 0),
    pg.total_count
  FROM page pg
  LEFT JOIN LATERAL (
    SELECT
      count(DISTINCT s.id)                                   AS total_scenes,
      count(h.id)                                            AS total_hotspots,
      count(DISTINCT s.id) FILTER (WHERE h.id IS NOT NULL)   AS total_linked_scenes
    FROM tour_scenes s
    LEFT JOIN tour_hotspots h ON h.scene_id = s.id
    WHERE s.tour_project_id = pg.id
  ) st ON true;
$$;

-- All-projects access (p_project_ids = NULL) must be service-role only; the
-- server action does its own auth + tour_project_access check.
REVOKE EXECUTE ON FUNCTION get_tour_projects_with_stats(uuid[], text, text, int, int) FROM anon, authenticated, public;

-- ─── sharing: reuse the existing share_links table ──────────────────────────
-- Extend the resource-type enum so tours can be shared via /share/[token]
-- and embedded via /tours/embed/[token].
ALTER TYPE share_resource_type ADD VALUE IF NOT EXISTS 'tour_project';
