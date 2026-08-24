-- ============================================================
-- MIGRATION 018 — Record who uploaded each comment attachment
--
-- Requirement
-- -----------
-- "Make it impossible to delete an attachment which was uploaded by the
-- customer." Customer attachments are evidence in a revision conversation —
-- a photo of a defect, a marked-up brochure — and losing one silently
-- destroys the record of what was asked for.
--
-- `comment_attachments` previously stored no notion of authorship, so the
-- delete paths had nothing to check. This adds it.
--
-- Roles
-- -----
--   'team'     — uploaded by a signed-in user (app/actions/storage.ts)
--   'customer' — uploaded by a guest through a share link
--                (app/api/share/attachment/route.ts)
--
-- Enforcement lives in BOTH delete paths and is re-asserted by the trigger at
-- the bottom, so a customer attachment survives even a direct SQL delete or a
-- future code path that forgets to check.
-- ============================================================

ALTER TABLE public.comment_attachments
  ADD COLUMN IF NOT EXISTS uploader_role TEXT NOT NULL DEFAULT 'team',
  ADD COLUMN IF NOT EXISTS uploader_name TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'comment_attachments_uploader_role_check'
  ) THEN
    ALTER TABLE public.comment_attachments
      ADD CONSTRAINT comment_attachments_uploader_role_check
      CHECK (uploader_role IN ('team', 'customer'));
  END IF;
END $$;

-- ------------------------------------------------------------
-- Backfill of existing rows.
--
-- Authorship was never recorded, so it is inferred from the owning comment's
-- `user_name`: guests type a free-form name when commenting through a share
-- link, while team members' comments carry the name on their `users` row.
-- A comment whose author matches no registered user is therefore a customer.
--
-- The comparison is case- and whitespace-insensitive because guest names are
-- typed by hand. Soft-deleted users still count as team — their old uploads
-- were made while they were staff.
--
-- This heuristic is deliberately biased toward 'customer': the cost of
-- mislabelling a team upload is a delete button that no longer appears, while
-- the cost of mislabelling a customer upload is permanent data loss. Rows
-- whose comment is missing entirely also fall to 'customer' for that reason.
-- ------------------------------------------------------------
UPDATE public.comment_attachments a
SET uploader_role = CASE
      WHEN c.id IS NULL THEN 'customer'
      WHEN EXISTS (
        SELECT 1 FROM public.users u
        WHERE LOWER(TRIM(u.name)) = LOWER(TRIM(c.user_name))
      ) THEN 'team'
      ELSE 'customer'
    END,
    uploader_name = COALESCE(a.uploader_name, c.user_name)
FROM (SELECT id, user_name FROM public.markup_comments) c
WHERE c.id = a.comment_id;

-- Attachments with no surviving parent comment: treat as customer (see above).
UPDATE public.comment_attachments a
SET uploader_role = 'customer'
WHERE NOT EXISTS (
  SELECT 1 FROM public.markup_comments c WHERE c.id = a.comment_id
);

CREATE INDEX IF NOT EXISTS idx_comment_attachments_uploader_role
  ON public.comment_attachments (uploader_role);

-- ------------------------------------------------------------
-- Database-level guard.
--
-- The application checks this too, but the trigger is what makes the rule
-- actually hold: it covers direct SQL, the service-role client (which bypasses
-- RLS), and any future delete path that forgets the check.
--
-- Deliberately NOT covered: ON DELETE CASCADE from the parent comment or
-- project. Removing a whole comment or project is an explicit, confirmed
-- action, and blocking the cascade would make those rows undeletable forever.
-- The rule protects an attachment from being picked off individually while the
-- conversation around it still stands.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prevent_customer_attachment_delete()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.uploader_role = 'customer'
     AND EXISTS (SELECT 1 FROM public.markup_comments WHERE id = OLD.comment_id)
  THEN
    RAISE EXCEPTION
      'Attachment % was uploaded by the customer and cannot be deleted', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_customer_attachment_delete ON public.comment_attachments;
CREATE TRIGGER trg_prevent_customer_attachment_delete
  BEFORE DELETE ON public.comment_attachments
  FOR EACH ROW EXECUTE FUNCTION public.prevent_customer_attachment_delete();
