-- ============================================================
-- MIGRATION 011 — Typed comments + drawing linkage + threaded replies
--
-- Goal:
-- 1) keep heavy drawing JSON in markup_drawings
-- 2) use markup_comments as the interaction layer
-- 3) store replies in markup_comments with parent_comment_id
-- ============================================================

ALTER TABLE markup_comments
  ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'comment';

ALTER TABLE markup_comments
  ADD COLUMN IF NOT EXISTS drawing_id UUID NULL;

ALTER TABLE markup_comments
  ADD COLUMN IF NOT EXISTS parent_comment_id TEXT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'markup_comments_type_check_v2'
      AND conrelid = 'markup_comments'::regclass
  ) THEN
    ALTER TABLE markup_comments
      ADD CONSTRAINT markup_comments_type_check_v2
      CHECK (type IN ('comment', 'reply', 'drawing'));
  END IF;
END $$;

-- ============================================================
-- Replace duplicate_project for typed comments + drawing links
-- (no dependency on legacy markup_comments.drawing_data)
-- ============================================================
CREATE OR REPLACE FUNCTION duplicate_project(
  p_source_project_id UUID,
  p_new_project_name  VARCHAR,
  p_copy_comments     BOOLEAN DEFAULT FALSE,
  p_copy_drawings     BOOLEAN DEFAULT FALSE,
  p_created_by        VARCHAR DEFAULT 'system'
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
      'copy_drawings', p_copy_drawings
    ),
    NOW(),
    NOW()
  FROM markup_projects
  WHERE id = p_source_project_id
  RETURNING id INTO v_new_project_id;

  -- 2) Clone thread rows
  FOR v_thread_record IN
    SELECT * FROM markup_threads WHERE project_id = p_source_project_id
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
      NOW(),
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
          NOW(),
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
          NOW(),
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
            NOW(),
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

  RETURN v_new_project_id;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'markup_comments_drawing_fk'
      AND conrelid = 'markup_comments'::regclass
  ) THEN
    ALTER TABLE markup_comments
      ADD CONSTRAINT markup_comments_drawing_fk
      FOREIGN KEY (drawing_id)
      REFERENCES markup_drawings(id)
      ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'markup_comments_parent_fk'
      AND conrelid = 'markup_comments'::regclass
  ) THEN
    ALTER TABLE markup_comments
      ADD CONSTRAINT markup_comments_parent_fk
      FOREIGN KEY (parent_comment_id)
      REFERENCES markup_comments(id)
      ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_markup_comments_type
  ON markup_comments(type);

CREATE INDEX IF NOT EXISTS idx_markup_comments_parent_comment_id
  ON markup_comments(parent_comment_id)
  WHERE parent_comment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_markup_comments_drawing_id
  ON markup_comments(drawing_id)
  WHERE drawing_id IS NOT NULL;

-- Backfill type for legacy rows that used drawing_data directly.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'markup_comments'
      AND column_name = 'drawing_data'
  ) THEN
    UPDATE markup_comments
    SET type = 'drawing'
    WHERE type = 'comment'
      AND drawing_data IS NOT NULL;
  END IF;
END $$;

-- Optional migration bridge:
-- move legacy comment_replies rows into markup_comments(type='reply').
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'comment_replies'
  ) THEN
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
      created_at,
      updated_at
    )
    SELECT
      cr.id,
      parent.thread_id,
      cr.user_name,
      cr.content,
      parent.pin_number,
      parent.comment_index,
      parent.display_number,
      parent.x_position,
      parent.y_position,
      'active',
      'reply',
      NULL,
      cr.comment_id,
      cr.created_at,
      COALESCE(cr.updated_at, cr.created_at)
    FROM comment_replies cr
    JOIN markup_comments parent ON parent.id = cr.comment_id
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;
