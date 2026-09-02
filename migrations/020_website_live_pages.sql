-- ============================================================
-- MIGRATION 020 — Website reviews are live, not captured
--
-- 019 modelled a website review as a set of screenshots: each page was
-- captured by a worker and stored as an image on the thread. Reviewing now
-- happens against the live site instead — the workspace frames the real page
-- through /api/websites/proxy, and comments are anchored to percentages of the
-- live document rather than to a stored screenshot.
--
-- Nothing is dropped here. The capture columns stay because they still carry
-- meaning for any page that *was* captured, and because a stored snapshot
-- remains useful evidence next to a resolved comment. What changes is the
-- default: a website page is a URL, and having no image is the normal state.
--
-- Run manually in the Supabase SQL Editor.
-- ============================================================


-- ─── 1. live pages are not "pending" ──────────────────────────────────────
-- Pages created under 019 sat at capture_status='pending' waiting for a worker
-- that is no longer part of the flow. A live page has no image by design, so
-- 'pending' would misreport a perfectly healthy row as unfinished work.

UPDATE markup_threads t
SET    capture_status = 'ready',
       updated_at     = NOW()
FROM   markup_projects p
WHERE  p.id = t.project_id
  AND  p.kind = 'website'
  AND  t.source_url IS NOT NULL
  AND  t.image_path IS NULL
  AND  t.capture_status = 'pending';


-- ─── 2. clear capture jobs that will never run ────────────────────────────
-- Same reasoning: a queued job with no worker behind it is noise, and its
-- thread is now perfectly usable without it.

UPDATE website_capture_jobs
SET    status      = 'failed',
       error       = COALESCE(error, 'Superseded: website reviews now open the live site instead of a capture.'),
       finished_at = COALESCE(finished_at, NOW())
WHERE  status IN ('queued', 'running');


-- ─── 3. document the new meaning of the columns ───────────────────────────

COMMENT ON COLUMN markup_threads.source_url IS
  'The page this thread reviews. For website projects this is the live URL opened through /api/websites/proxy; image_path is NULL unless a snapshot was also stored.';

COMMENT ON COLUMN markup_threads.capture_status IS
  'Only meaningful for stored snapshots (pending|ready|failed). Live website pages are always ready.';

COMMENT ON COLUMN markup_projects.capture_defaults IS
  'Retained from 019 for snapshot settings. The live viewer chooses its own device width, so it no longer drives the review.';
