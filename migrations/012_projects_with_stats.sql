-- 012: Paginated project list with aggregated stats for the dashboard.
-- Replaces the client-side aggregation that fetched every comment row per project.
-- Run manually in the Supabase SQL Editor.

CREATE OR REPLACE FUNCTION get_projects_with_stats(
  p_project_ids uuid[] DEFAULT NULL,     -- NULL = all projects (admin); members pass their accessible ids
  p_search      text   DEFAULT NULL,     -- ilike filter on project_name
  p_sort        text   DEFAULT 'newest', -- 'newest' | 'oldest' | 'name'
  p_limit       int    DEFAULT 24,
  p_offset      int    DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  project_name varchar,
  markup_url text,
  created_at timestamptz,
  updated_at timestamptz,
  first_image text,
  total_images bigint,
  total_comments bigint,
  total_resolved_comments bigint,
  total_commented_threads bigint,
  total_count bigint -- full filtered count (same on every row), drives hasMore on the client
)
LANGUAGE sql STABLE
SET search_path = public
AS $$
  WITH page AS (
    SELECT p.*, count(*) OVER () AS total_count
    FROM markup_projects p
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
    pg.markup_url,
    pg.created_at,
    pg.updated_at,
    (SELECT t.image_path FROM markup_threads t
      WHERE t.project_id = pg.id ORDER BY t.created_at ASC LIMIT 1) AS first_image,
    COALESCE(s.total_images, 0),
    COALESCE(s.total_comments, 0),
    COALESCE(s.total_resolved_comments, 0),
    COALESCE(s.total_commented_threads, 0),
    pg.total_count
  FROM page pg
  LEFT JOIN LATERAL (
    SELECT
      count(DISTINCT t.id)                                 AS total_images,
      count(c.id)                                          AS total_comments,
      count(c.id) FILTER (WHERE c.status = 'resolved')     AS total_resolved_comments,
      count(DISTINCT t.id) FILTER (WHERE c.id IS NOT NULL) AS total_commented_threads
    FROM markup_threads t
    LEFT JOIN markup_comments c ON c.thread_id = t.id
    WHERE t.project_id = pg.id
  ) s ON true;
$$;

-- With p_project_ids = NULL this returns every project, so it must only be callable
-- by the service role (the server action does its own auth + project_access check).
REVOKE EXECUTE ON FUNCTION get_projects_with_stats(uuid[], text, text, int, int) FROM anon, authenticated, public;

-- Realtime: use-realtime-comments.ts subscribes to INSERT/UPDATE/DELETE on
-- markup_comments. Make sure the table is in the realtime publication and that
-- all three events are published. DELETE payloads only need the primary key,
-- which the default REPLICA IDENTITY already provides.
ALTER PUBLICATION supabase_realtime SET (publish = 'insert, update, delete, truncate');

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE markup_comments;
EXCEPTION
  WHEN duplicate_object THEN NULL; -- already in the publication
END $$;
