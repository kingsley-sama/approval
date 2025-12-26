# QUICK FIX GUIDE - Duplicate Function & Pen Tool

## ✅ Step 1: Dependencies (DONE)
The required packages have been installed:
- ✅ konva
- ✅ react-konva  
- ✅ nanoid

## ⚠️ Step 2: Fix Duplicate Function

The duplicate function requires a PostgreSQL function in Supabase. **You must run this SQL:**

### Open Supabase SQL Editor and run:

```sql
-- Create the duplicate_project function
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
    -- 1. Create new project
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
    
    IF v_new_project_id IS NULL THEN
        RAISE EXCEPTION 'Source project not found: %', p_source_project_id;
    END IF;
    
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
        
        -- 3. Copy comments if enabled
        IF p_copy_comments THEN
            FOR v_comment_record IN
                SELECT * FROM markup_comments WHERE thread_id = v_thread_record.id
            LOOP
                INSERT INTO markup_comments (
                    id,
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
                    gen_random_uuid(),
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
        
        -- 4. Copy drawings if enabled
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
```

### Verify the function was created:

```sql
SELECT routine_name, routine_type 
FROM information_schema.routines 
WHERE routine_name = 'duplicate_project'
AND routine_schema = 'public';
```

You should see one row returned. If not, check for errors in the SQL output.

## ✅ Step 3: Pen Tool (Already Implemented!)

The pen tool is already coded and ready to use. Here's how to use it:

### Basic Usage Example:

```tsx
import EnhancedImageViewer from '@/components/enhanced-image-viewer';

export default function YourPage() {
  return (
    <EnhancedImageViewer
      threadId="your-thread-id-here"
      threadName="Living Room View"
      imagePath="/path/to/your/image.jpg"
      imageWidth={1200}
      imageHeight={800}
      projectId="your-project-id"
      projectName="My Project"
      currentUser="user@example.com"
      canDraw={true}  // Enable drawing!
    />
  );
}
```

### The Pen Tool Features:
- ✏️ **Freehand drawing** - Draw smooth lines with your mouse
- 🎨 **Color picker** - 10 preset colors + custom color selector
- 📏 **Stroke width** - Choose from 2px to 12px
- ↶↷ **Undo/Redo** - Full history support
- 💾 **Auto-save** - Saves to database as JSON

### How to Use the Pen:
1. Click "🎨 Drawing Enabled" button to enable drawing mode
2. Click the **✏️ Pen** button in the toolbar
3. Choose your color and stroke width
4. Draw on the image!
5. Click "Save" to save your drawing

### Additional Drawing Tools:
- **▢ Rectangle** - Draw rectangular boxes
- **→ Arrow** - Draw arrows to point at things
- **🖍️ Highlight** - Semi-transparent highlights

## 🧪 Test Everything

### Test 1: Verify Duplicate Function
```sql
-- In Supabase SQL Editor
SELECT duplicate_project(
    'existing-project-id'::uuid,
    'Test Copy',
    true,  -- copy comments
    true,  -- copy drawings
    'test-user'
);
```

If you get a UUID back, it works! ✅

### Test 2: Test Pen Tool
1. Go to any page with `EnhancedImageViewer`
2. Enable drawing mode
3. Click pen tool
4. Draw something
5. Click Save
6. Refresh page - your drawing should still be there!

## 🐛 Common Issues

### Issue: "Function duplicate_project does not exist"
**Fix:** Run the SQL function creation code above in Supabase

### Issue: "Pen tool button doesn't appear"
**Fix:** Make sure `canDraw={true}` is set on EnhancedImageViewer

### Issue: "Drawing doesn't save"
**Fix:** 
1. Check that `markup_drawings` table exists
2. Check browser console for errors
3. Verify threadId is valid

### Issue: TypeScript errors about Konva
**Fix:** 
```bash
npm install --save-dev @types/konva
```

## 📝 What's Already Done

✅ Pen tool component created  
✅ Drawing canvas with Konva  
✅ Color and stroke width selectors  
✅ Undo/redo functionality  
✅ JSON storage system  
✅ Duplicate function server action  
✅ Required dependencies installed  

## ⏰ What You Need to Do

1. **Run the SQL function** in Supabase (Step 2 above)
2. **Add the duplication columns** to your tables (see below)
3. **Test it!**

## 📊 Add Missing Columns (If Not Already Added)

Run this in Supabase SQL Editor:

```sql
-- Add duplication tracking columns
ALTER TABLE markup_projects
ADD COLUMN IF NOT EXISTS is_duplicated BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS original_project_id UUID REFERENCES markup_projects(id),
ADD COLUMN IF NOT EXISTS duplication_metadata JSONB DEFAULT '{}'::jsonb;

ALTER TABLE markup_threads
ADD COLUMN IF NOT EXISTS is_duplicated BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS original_thread_id UUID REFERENCES markup_threads(id),
ADD COLUMN IF NOT EXISTS duplication_metadata JSONB DEFAULT '{}'::jsonb;

ALTER TABLE markup_comments
ADD COLUMN IF NOT EXISTS is_duplicated BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS original_comment_id UUID REFERENCES markup_comments(id);

-- Create drawings table if not exists
CREATE TABLE IF NOT EXISTS markup_drawings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id UUID NOT NULL REFERENCES markup_threads(id) ON DELETE CASCADE,
    drawing_data JSONB NOT NULL,
    created_by VARCHAR(150) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_duplicated BOOLEAN DEFAULT FALSE,
    original_drawing_id UUID REFERENCES markup_drawings(id),
    metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_markup_drawings_thread_id ON markup_drawings(thread_id);
```

## 🎉 You're Done!

After running the SQL above:
- ✅ Duplicate function will work
- ✅ Pen tool will save drawings
- ✅ All features are ready to use

Need help? Check the browser console and Supabase logs for error messages.
