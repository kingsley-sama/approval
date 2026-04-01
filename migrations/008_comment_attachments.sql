-- ============================================================
-- MIGRATION 008 — Comment Attachments
-- Stores metadata for files attached to comments.
-- Actual files live in Supabase Storage under:
--   attachments/{project_id}/{uuid}-{filename}
-- Files are served via signed URLs, never exposed raw.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.comment_attachments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id       TEXT NOT NULL REFERENCES public.markup_comments(id) ON DELETE CASCADE,
  project_id       UUID NOT NULL REFERENCES public.markup_projects(id) ON DELETE CASCADE,
  storage_path     TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  mime_type        TEXT NOT NULL,
  file_size_bytes  BIGINT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comment_attachments_comment_id  ON public.comment_attachments(comment_id);
CREATE INDEX IF NOT EXISTS idx_comment_attachments_project_id  ON public.comment_attachments(project_id);

ALTER TABLE public.comment_attachments ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users full access (app layer enforces project-level auth)
CREATE POLICY "Allow all for authenticated users"
  ON public.comment_attachments FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
