-- ====================================
-- FOLDER/PROJECT DUPLICATION SUPPORT
-- ====================================
-- Extends existing tables to support duplication tracking
-- Adds metadata to identify duplicated resources

-- Add duplication tracking columns to markup_projects
ALTER TABLE markup_projects
ADD COLUMN IF NOT EXISTS is_duplicated BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS original_project_id UUID REFERENCES markup_projects(id),
ADD COLUMN IF NOT EXISTS duplication_metadata JSONB DEFAULT '{}'::jsonb;

-- Add duplication tracking columns to markup_threads
ALTER TABLE markup_threads
ADD COLUMN IF NOT EXISTS is_duplicated BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS original_thread_id UUID REFERENCES markup_threads(id),
ADD COLUMN IF NOT EXISTS duplication_metadata JSONB DEFAULT '{}'::jsonb;

-- Add duplication tracking columns to markup_comments
ALTER TABLE markup_comments
ADD COLUMN IF NOT EXISTS is_duplicated BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS original_comment_id UUID REFERENCES markup_comments(id);

-- Create indexes for duplication tracking
CREATE INDEX idx_markup_projects_original ON markup_projects(original_project_id) WHERE original_project_id IS NOT NULL;
CREATE INDEX idx_markup_threads_original ON markup_threads(original_thread_id) WHERE original_thread_id IS NOT NULL;
CREATE INDEX idx_markup_comments_original ON markup_comments(original_comment_id) WHERE original_comment_id IS NOT NULL;

-- Function to duplicate a project with options
CREATE OR REPLACE FUNCTION duplicate_project(
    p_source_project_id UUID,
    p_new_project_name VARCHAR,
    p_copy_comments BOOLEAN DEFAULT FALSE,
    p_copy_drawings BOOLEAN DEFAULT FALSE,
    p_created_by VARCHAR DEFAULT 'system'
)
RETURNS UUID AS $$
DECLARE
    v_new_project_id UUID;
    v_thread_record RECORD;
    v_new_thread_id UUID;
    v_comment_record RECORD;
    v_drawing_record RECORD;
BEGIN
    -- Start transaction (caller should handle this in application code)
    
    -- 1. Create new project (deep clone)
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
    
    -- 2. Duplicate threads (images)
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
        
        -- 3. Optionally duplicate comments
        IF p_copy_comments THEN
            FOR v_comment_record IN
                SELECT * FROM markup_comments WHERE thread_id = v_thread_record.id
            LOOP
                INSERT INTO markup_comments (
                    thread_id,
                    user_name,
                    content,
                    pin_number,
                    comment_index,
                    is_duplicated,
                    original_comment_id,
                    created_at,
                    updated_at
                )
                VALUES (
                    v_new_thread_id,
                    v_comment_record.user_name,
                    v_comment_record.content,
                    v_comment_record.pin_number,
                    v_comment_record.comment_index,
                    TRUE,
                    v_comment_record.id,
                    NOW(),
                    NOW()
                );
            END LOOP;
        END IF;
        
        -- 4. Optionally duplicate drawings
        IF p_copy_drawings THEN
            FOR v_drawing_record IN
                SELECT * FROM markup_drawings WHERE thread_id = v_thread_record.id
            LOOP
                INSERT INTO markup_drawings (
                    thread_id,
                    drawing_data,
                    created_by,
                    is_duplicated,
                    original_drawing_id,
                    metadata,
                    created_at,
                    updated_at
                )
                VALUES (
                    v_new_thread_id,
                    v_drawing_record.drawing_data,
                    v_drawing_record.created_by,
                    TRUE,
                    v_drawing_record.id,
                    v_drawing_record.metadata,
                    NOW(),
                    NOW()
                );
            END LOOP;
        END IF;
    END LOOP;
    
    RETURN v_new_project_id;
END;
$$ LANGUAGE plpgsql;

-- Comments
COMMENT ON FUNCTION duplicate_project IS 'Atomically duplicates a project with optional comments and drawings';
COMMENT ON COLUMN markup_projects.duplication_metadata IS 'Stores info about duplication: when, by whom, what was copied';
