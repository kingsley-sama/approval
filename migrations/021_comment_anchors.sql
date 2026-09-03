-- ============================================================
-- MIGRATION 021 — Element anchors for embedded website comments
--
-- The embed script runs inside the reviewed page, so unlike the proxy it can
-- see the real DOM. That makes a much better anchor available than "63% down
-- the document": the element the reviewer actually clicked, plus where inside
-- it they clicked.
--
-- Why it matters: percentage-of-document anchoring drifts the moment content
-- is added above a pin — every comment below it slides out of place, which is
-- exactly when a client says "the feedback is wrong". An element anchor holds
-- as long as that element still exists.
--
-- x_position / y_position keep their meaning as a document-percentage
-- fallback, so a comment still renders sensibly when the anchor element has
-- been removed, and so every existing reader of those columns (the workspace,
-- the share viewer, the PDF report) keeps working untouched.
--
-- Run manually in the Supabase SQL Editor.
-- ============================================================

ALTER TABLE markup_comments
  ADD COLUMN IF NOT EXISTS anchor jsonb;

COMMENT ON COLUMN markup_comments.anchor IS
  'Embed script only. {selector, xPct, yPct, elementText, viewportWidth, pageUrl} — xPct/yPct are the offset *within* the anchored element, not the page. NULL for pins placed on an image or a proxied page.';

-- Comments are read per-thread and the anchor is only needed once a thread is
-- open, so no index is warranted; this is a payload column, not a filter.
