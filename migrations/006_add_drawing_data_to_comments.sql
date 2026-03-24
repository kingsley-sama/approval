-- Add drawing_data column to markup_comments
-- Stores normalized shape data (coordinates in 0-1 range) for drawing annotations
ALTER TABLE markup_comments
  ADD COLUMN IF NOT EXISTS drawing_data JSONB DEFAULT NULL;

-- Index for queries that filter to only drawing-type comments
CREATE INDEX IF NOT EXISTS idx_markup_comments_has_drawing
  ON markup_comments ((drawing_data IS NOT NULL));
