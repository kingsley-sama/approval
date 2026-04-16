-- ============================================================
-- MIGRATION 010 — Fix duplicate_project to copy drawing_data,
-- comment_attachments, and comment_replies
--
-- The original function (migration 000) predates the drawing_data
-- column (migration 006), comment_attachments table (migration 008),
-- and comment_replies table (migration 009). This replaces it with
-- a version that copies all three.
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
    v_new_project_id  UUID;
    v_thread_record   RECORD;
    v_new_thread_id   UUID;
    v_comment_record  RECORD;
    v_new_comment_id  TEXT;
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

        -- 3. Optionally clone comments (now includes drawing_data)
        IF p_copy_comments THEN
            FOR v_comment_record IN
                SELECT * FROM markup_comments WHERE thread_id = v_thread_record.id
            LOOP
                v_new_comment_id := gen_random_uuid()::text;

                INSERT INTO markup_comments (
                    id, thread_id, user_name, content,
                    pin_number, comment_index, display_number,
                    x_position, y_position, status,
                    drawing_data,
                    is_duplicated, original_comment_id,
                    created_at, updated_at
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
                    v_comment_record.drawing_data,
                    TRUE, v_comment_record.id,
                    NOW(), NOW()
                );

                -- Copy attachments for this comment
                INSERT INTO comment_attachments (
                    comment_id, project_id, storage_path,
                    original_filename, mime_type, file_size_bytes,
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

                -- Copy replies for this comment
                INSERT INTO comment_replies (
                    id, comment_id, user_name, content,
                    created_at, updated_at
                )
                SELECT
                    gen_random_uuid()::text,
                    v_new_comment_id,
                    user_name,
                    content,
                    NOW(), NOW()
                FROM comment_replies
                WHERE comment_id = v_comment_record.id;
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
