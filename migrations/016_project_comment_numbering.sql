-- ============================================================
-- MIGRATION 016 — Stable, project-wide comment numbering
--
-- Problem this fixes
-- ------------------
-- `display_number` was assigned as COUNT(comments in the same thread) + 1:
--   * numbering restarted at 1 on every image (thread) of a project
--   * deleting a comment made the next one REUSE a retired number
-- The clients then ignored the stored value entirely and re-derived numbers
-- from array position, so adding a comment to an earlier image renumbered
-- every later comment.
--
-- Contract established here
-- -------------------------
-- A comment's number is allocated once, at creation, from a per-project
-- counter that only ever moves forward. It is unique within the project and
-- is never recomputed — not when comments are added or deleted, and not when
-- images are reordered. Image order and comment numbering are independent.
--
-- Schema compatibility
-- --------------------
-- This runs against BOTH schema generations. Migration 011 (typed comments:
-- `type`, `parent_comment_id`) may or may not have been applied, and replies
-- may live either in `markup_comments` or in the legacy `comment_replies`
-- table. Every reference to an optional column is therefore guarded and issued
-- as dynamic SQL — a plain static reference fails to parse on databases where
-- the column is absent, which is what made the first version of this file
-- error with "column c.type does not exist".
-- ============================================================

-- Monotonic per-project allocator. `last_number` is the highest number ever
-- handed out for the project; it is never decremented, so deleting a comment
-- retires its number instead of freeing it for reuse.
CREATE TABLE IF NOT EXISTS public.project_comment_counters (
  project_id  UUID PRIMARY KEY REFERENCES public.markup_projects(id) ON DELETE CASCADE,
  last_number INTEGER NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.project_comment_counters ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'project_comment_counters'
      AND policyname = 'Allow all for authenticated users'
  ) THEN
    CREATE POLICY "Allow all for authenticated users"
      ON public.project_comment_counters FOR ALL
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Ensure `display_number` exists (added by migration 004; recreated here so
-- this file is self-sufficient on databases that skipped it).
ALTER TABLE public.markup_comments
  ADD COLUMN IF NOT EXISTS display_number INTEGER;

-- ------------------------------------------------------------
-- One-time backfill of EXISTING data.
--
-- Historical comments carry per-image numbering in the database (every image
-- restarts at 1), while the UI displayed a continuous count derived from array
-- position. This backfill persists exactly what the UI was already showing:
-- images in `image_index` order, comments in creation order within each image.
--
-- Ordering by image position rather than by pure creation time is deliberate.
-- Both produce continuous, unique numbering, but they diverge for any project
-- where a comment was added to a later image before an earlier one — on this
-- data that is 588 of 1611 pins across 53 of 150 projects. Comment numbers get
-- quoted to suppliers ("please redo comment 7"), so the backfill must preserve
-- the number already on screen rather than silently re-point those references.
--
-- Newly created comments are allocated chronologically from the counter below;
-- only this historical backfill follows display order. This is the only place
-- existing numbers ever change; after this migration they are immutable.
--
-- Rows that are replies must be excluded from allocation. How a reply is
-- identified depends on which migrations this database has:
--   * typed schema  → markup_comments.type = 'reply' / parent_comment_id
--   * legacy schema → replies live in the separate comment_replies table, so
--                     every markup_comments row is a pin and no filter applies
-- ------------------------------------------------------------
DO $$
DECLARE
  v_has_type   BOOLEAN;
  v_has_parent BOOLEAN;
  v_filter     TEXT := '';
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'markup_comments' AND column_name = 'type'
  ) INTO v_has_type;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'markup_comments' AND column_name = 'parent_comment_id'
  ) INTO v_has_parent;

  IF v_has_type THEN
    v_filter := v_filter || ' AND COALESCE(c.type, ''comment'') <> ''reply''';
  END IF;

  IF v_has_parent THEN
    v_filter := v_filter || ' AND c.parent_comment_id IS NULL';
  END IF;

  EXECUTE format($fmt$
    WITH numbered AS (
      SELECT
        c.id,
        ROW_NUMBER() OVER (
          PARTITION BY t.project_id
          -- Mirrors the old client-side ordering: images by image_index
          -- (nulls last, then thread creation), comments by creation within
          -- each image. Keeps every already-communicated number intact.
          ORDER BY t.image_index NULLS LAST, t.created_at, c.created_at, c.id
        ) AS new_number
      FROM public.markup_comments c
      JOIN public.markup_threads t ON t.id = c.thread_id
      WHERE TRUE %s
    )
    UPDATE public.markup_comments c
    SET display_number = n.new_number,
        pin_number     = n.new_number,
        comment_index  = n.new_number
    FROM numbered n
    WHERE c.id = n.id
  $fmt$, v_filter);

  -- Typed schema only: replies mirror their parent's number for display.
  IF v_has_type AND v_has_parent THEN
    EXECUTE $upd$
      UPDATE public.markup_comments r
      SET display_number = p.display_number,
          pin_number     = p.pin_number,
          comment_index  = p.comment_index
      FROM public.markup_comments p
      WHERE r.parent_comment_id = p.id
        AND COALESCE(r.type, 'comment') = 'reply'
    $upd$;
  END IF;
END $$;

-- Seed each project's counter to its highest allocated number so newly created
-- comments continue from there rather than colliding with existing ones.
INSERT INTO public.project_comment_counters (project_id, last_number)
SELECT t.project_id,
       COALESCE(MAX(GREATEST(COALESCE(c.display_number, 0), COALESCE(c.pin_number, 0))), 0)
FROM public.markup_threads t
LEFT JOIN public.markup_comments c ON c.thread_id = t.id
GROUP BY t.project_id
ON CONFLICT (project_id) DO UPDATE
  SET last_number = GREATEST(
        public.project_comment_counters.last_number,
        EXCLUDED.last_number
      );

-- ------------------------------------------------------------
-- Atomic allocator.
--
-- The INSERT ... ON CONFLICT DO UPDATE takes a row lock on the project's
-- counter, so two comments created concurrently are serialized and can never
-- receive the same number. Callers must use this rather than computing
-- MAX(display_number) + 1 in application code, which races.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.next_comment_display_number(p_project_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_number INTEGER;
BEGIN
  INSERT INTO public.project_comment_counters AS pcc (project_id, last_number, updated_at)
  VALUES (p_project_id, 1, NOW())
  ON CONFLICT (project_id) DO UPDATE
    SET last_number = pcc.last_number + 1,
        updated_at  = NOW()
  RETURNING pcc.last_number INTO v_number;

  RETURN v_number;
END;
$$ LANGUAGE plpgsql;

-- Convenience wrapper: allocate from the project that owns a given thread.
CREATE OR REPLACE FUNCTION public.next_comment_display_number_for_thread(p_thread_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_project_id UUID;
BEGIN
  SELECT project_id INTO v_project_id
  FROM public.markup_threads
  WHERE id = p_thread_id;

  IF v_project_id IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN public.next_comment_display_number(v_project_id);
END;
$$ LANGUAGE plpgsql;

-- Expose the allocators to the roles the app connects as.
GRANT EXECUTE ON FUNCTION public.next_comment_display_number(UUID)            TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.next_comment_display_number_for_thread(UUID) TO anon, authenticated, service_role;
