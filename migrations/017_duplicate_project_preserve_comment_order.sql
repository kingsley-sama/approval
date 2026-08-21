-- ============================================================
-- MIGRATION 017 — Preserve comment order when duplicating a project
--
-- Problem this fixes
-- ------------------
-- duplicate_project (migration 012) wrote NOW() into `created_at` on every
-- cloned thread and comment. Inside a plpgsql function NOW() is the
-- transaction timestamp, so EVERY copied row received the exact same value.
--
-- Clients read comments with `ORDER BY created_at ASC` and nothing else
-- (app/actions/comments.ts, app/api/v1/projects/[id]/comments/route.ts,
-- app/actions/panorama-comments.ts), and threads with
-- `ORDER BY image_index, created_at`. With every timestamp identical the sort
-- key is fully tied, Postgres is free to return the rows in any order, and the
-- duplicated project showed its comments shuffled relative to the original.
--
-- Fix
-- ---
-- Copy `created_at` from the source row instead of stamping NOW(). The clone
-- then sorts exactly like the original under the existing queries.
-- `updated_at` still gets NOW() — that is when the copy was written.
--
-- Also seeded here: `project_comment_counters` for the new project. Copied
-- comments keep their original `display_number`, but the clone had no counter
-- row, so the first comment created inside a duplicate was allocated number 1
-- and collided with a copied pin.
--
-- Existing duplicates keep their tied timestamps; the ordering queries were
-- given a `display_number` tiebreaker in the same change so those projects
-- render in a stable, correct order too.
-- ============================================================

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
    is_duplicated,
    original_project_id,
    duplication_metadata,
    created_at,
    updated_at
  )
  SELECT
    p_new_project_name,
    markup_url,
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
