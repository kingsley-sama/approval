-- ============================================================
-- MIGRATION 022 — Captured website snapshots
--
-- The proxy fetches a site live on every view, which means the thing a comment
-- refers to can change or vanish underneath it. A snapshot is the opposite: the
-- page is rendered once with a real browser, its DOM and assets are copied into
-- our own storage, and that copy is what everybody annotates from then on.
--
-- The reviewed site needs no script and no cooperation — capture is entirely
-- server-side.
--
-- Two durability rules this schema exists to enforce:
--
--   1. Every comment stores an immutable screenshot taken when it was written.
--      That image is the record. Anchors are only a convenience for putting
--      the pin back in the right place on a later visit.
--   2. An anchor that cannot be resolved confidently must never drag a comment
--      onto the wrong element — the UI falls back to the stored screenshot.
--      `anchor_confidence` is what the client checks to make that call.
--
-- Run manually in the Supabase SQL Editor.
-- ============================================================


-- ─── 1. snapshots ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS website_snapshots (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid NOT NULL REFERENCES markup_projects(id) ON DELETE CASCADE,
  -- The page this snapshot belongs to. Comments live on the thread, so a new
  -- snapshot version does not orphan them.
  thread_id       uuid REFERENCES markup_threads(id) ON DELETE CASCADE,
  url             text NOT NULL,
  status          text NOT NULL DEFAULT 'pending',
  error           text,

  -- Storage paths, all under snapshots/<id>/ in the screenshots bucket.
  html_path       text,
  screenshot_path text,

  -- Geometry of the captured document, so the viewer can size the frame and
  -- crop per-comment screenshots without re-measuring.
  viewport_width  int  NOT NULL DEFAULT 1440,
  doc_width       int,
  doc_height      int,

  asset_count     int  DEFAULT 0,
  bytes_stored    bigint DEFAULT 0,

  -- Bumped per re-capture of the same page; anchors record the version they
  -- were created against so cross-version resolution can be treated warily.
  version         int  NOT NULL DEFAULT 1,
  captured_at     timestamptz,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE website_snapshots
    ADD CONSTRAINT website_snapshots_status_check
    CHECK (status IN ('pending', 'capturing', 'ready', 'failed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS website_snapshots_project_idx ON website_snapshots (project_id, status);
CREATE INDEX IF NOT EXISTS website_snapshots_thread_idx  ON website_snapshots (thread_id);

COMMENT ON TABLE website_snapshots IS
  'One rendered copy of one page: serialized DOM plus its assets in Storage. Annotated in place of the live site.';


-- ─── 2. which snapshot a page currently shows ─────────────────────────────

ALTER TABLE markup_threads
  ADD COLUMN IF NOT EXISTS current_snapshot_id uuid REFERENCES website_snapshots(id) ON DELETE SET NULL;

COMMENT ON COLUMN markup_threads.current_snapshot_id IS
  'The snapshot the viewer opens for this page. Older snapshots are kept so a comment can still be shown against the page as it was.';


-- ─── 3. the immutable per-comment record ──────────────────────────────────

ALTER TABLE markup_comments
  ADD COLUMN IF NOT EXISTS comment_screenshot_path text,
  ADD COLUMN IF NOT EXISTS snapshot_id             uuid REFERENCES website_snapshots(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS anchor_confidence       real;

COMMENT ON COLUMN markup_comments.comment_screenshot_path IS
  'Immutable image of what the reviewer was looking at when the comment was written. Never overwritten — this is the evidence, the anchor is not.';
COMMENT ON COLUMN markup_comments.snapshot_id IS
  'Snapshot version the comment was made against, so a stale anchor can be recognised as cross-version rather than simply broken.';
COMMENT ON COLUMN markup_comments.anchor_confidence IS
  '0..1 from the last resolution attempt. Below the client threshold the pin is not placed and the stored screenshot is shown instead.';


-- ─── 4. updated_at trigger, matching the other tables ─────────────────────

DROP TRIGGER IF EXISTS trg_website_snapshots_set_updated_at ON website_snapshots;
CREATE TRIGGER trg_website_snapshots_set_updated_at
  BEFORE UPDATE ON website_snapshots
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ─── 5. RLS, consistent with the rest of the schema ───────────────────────

ALTER TABLE website_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON website_snapshots;
CREATE POLICY "Allow all for authenticated users"
  ON website_snapshots FOR ALL TO authenticated USING (true) WITH CHECK (true);
