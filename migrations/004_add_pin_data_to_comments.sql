-- Migration 004: Add pin position and status to markup_comments
-- Run this in the Supabase SQL editor

ALTER TABLE markup_comments
  ADD COLUMN IF NOT EXISTS x_position FLOAT DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS y_position FLOAT DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active' CHECK (status IN ('active', 'resolved'));

-- Add a display number column (what user sees on the pin badge)
ALTER TABLE markup_comments
  ADD COLUMN IF NOT EXISTS display_number INT;

-- Backfill display_number from pin_number for existing data
UPDATE markup_comments SET display_number = pin_number WHERE display_number IS NULL;
