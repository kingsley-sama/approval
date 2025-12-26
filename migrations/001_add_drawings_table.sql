-- ====================================
-- DRAWING SYSTEM SCHEMA
-- ====================================
-- Stores drawing/markup data as JSON for each image thread
-- Supports freehand, rectangles, arrows, highlights

CREATE TABLE IF NOT EXISTS markup_drawings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id UUID NOT NULL REFERENCES markup_threads(id) ON DELETE CASCADE,
    drawing_data JSONB NOT NULL, -- Stores the drawing objects (shapes, strokes, etc.)
    created_by VARCHAR(150) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_duplicated BOOLEAN DEFAULT FALSE, -- Flag for duplicated drawings
    original_drawing_id UUID REFERENCES markup_drawings(id), -- Link to original if duplicated
    metadata JSONB DEFAULT '{}'::jsonb -- Additional metadata like tool version, etc.
);

-- Index for faster queries by thread
CREATE INDEX idx_markup_drawings_thread_id ON markup_drawings(thread_id);
CREATE INDEX idx_markup_drawings_created_at ON markup_drawings(created_at DESC);
CREATE INDEX idx_markup_drawings_original_id ON markup_drawings(original_drawing_id) WHERE original_drawing_id IS NOT NULL;

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_markup_drawings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_markup_drawings_updated_at
    BEFORE UPDATE ON markup_drawings
    FOR EACH ROW
    EXECUTE FUNCTION update_markup_drawings_updated_at();

-- Comments on table and columns
COMMENT ON TABLE markup_drawings IS 'Stores drawing/markup data for images as JSON objects';
COMMENT ON COLUMN markup_drawings.drawing_data IS 'JSONB containing drawing objects: {shapes: [{type, points, color, ...}], version: "1.0"}';
COMMENT ON COLUMN markup_drawings.is_duplicated IS 'Marks if this drawing was created through duplication';
COMMENT ON COLUMN markup_drawings.original_drawing_id IS 'References the original drawing if this is a duplicate';
