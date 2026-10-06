-- ============================================================
-- 023 — Explicit, atomic image ordering for markup_threads
--
-- Run manually in the Supabase SQL Editor.
--
-- Before this, uploads from the workspace left image_index NULL and the
-- sidebar fell back to created_at — i.e. the order uploads happened to
-- *finish*, not the order of the files in the folder. Reordering wrote one
-- UPDATE per image with no transaction, so a partial failure could leave a
-- project half-reordered.
--
-- This migration:
--   1. reorder_threads(project, ids[])  — writes a full ordering in one statement
--   2. normalize_thread_order(project)  — renumbers a project's images 0..n-1
--   3. backfills every existing project so no image_index is left NULL
--   4. indexes (project_id, image_index) for the ordered reads
-- ============================================================


-- ─── 1. atomic reorder ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION reorder_threads(p_project_id UUID, p_thread_ids UUID[])
RETURNS VOID
LANGUAGE sql
AS $$
  UPDATE markup_threads t
     SET image_index = o.position - 1,
         updated_at  = NOW()
    FROM unnest(p_thread_ids) WITH ORDINALITY AS o(id, position)
   WHERE t.id = o.id
     AND t.project_id = p_project_id;
$$;

COMMENT ON FUNCTION reorder_threads IS
  'Sets image_index for the given threads to their position in p_thread_ids (0-based), in a single statement.';


-- ─── 2. renumber to a dense 0..n-1 sequence ────────────────────────────────
-- Uploads reserve sparse slots (so PDFs can slot their pages in without
-- knowing the page count up front); this compacts them afterwards. Images
-- without an index keep their relative created_at order at the end.

CREATE OR REPLACE FUNCTION normalize_thread_order(p_project_id UUID)
RETURNS VOID
LANGUAGE sql
AS $$
  UPDATE markup_threads t
     SET image_index = r.new_index
    FROM (
      SELECT id,
             (ROW_NUMBER() OVER (ORDER BY image_index ASC NULLS LAST, created_at ASC, id ASC)) - 1 AS new_index
        FROM markup_threads
       WHERE project_id = p_project_id
    ) r
   WHERE t.id = r.id
     AND t.image_index IS DISTINCT FROM r.new_index;
$$;

COMMENT ON FUNCTION normalize_thread_order IS
  'Renumbers a project''s threads to image_index 0..n-1, preserving the current display order.';


-- ─── 3. backfill existing projects ─────────────────────────────────────────

UPDATE markup_threads t
   SET image_index = r.new_index
  FROM (
    SELECT id,
           (ROW_NUMBER() OVER (
              PARTITION BY project_id
              ORDER BY image_index ASC NULLS LAST, created_at ASC, id ASC
           )) - 1 AS new_index
      FROM markup_threads
  ) r
 WHERE t.id = r.id
   AND t.image_index IS DISTINCT FROM r.new_index;


-- ─── 4. index for ordered reads ────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_markup_threads_project_order
  ON markup_threads(project_id, image_index);
