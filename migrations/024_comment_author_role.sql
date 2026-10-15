-- ============================================================
-- MIGRATION 024 — Record who wrote each comment; lock customer comments
--
-- Requirement
-- -----------
-- "Make it impossible to delete/edit an attachment or a comment which was
-- uploaded by the customer." Attachments were handled in migration 018; this
-- does the same for comments (pins and replies in `markup_comments`, and
-- `panorama_comments`).
--
-- Roles
-- -----
--   'team'     — written by a signed-in user (server actions)
--   'customer' — written by a guest through a share link or the website embed
--                (app/api/share/comment, app/api/share/comment/reply,
--                 app/api/embed/comments, app/api/share/panorama/comment)
--
-- The application tags customer rows right after inserting them and refuses
-- to edit or delete them; the triggers below make the rule hold for every
-- other path too (direct SQL, the service-role client, future code).
-- ============================================================

ALTER TABLE public.markup_comments
  ADD COLUMN IF NOT EXISTS author_role TEXT NOT NULL DEFAULT 'team';

ALTER TABLE public.panorama_comments
  ADD COLUMN IF NOT EXISTS author_role TEXT NOT NULL DEFAULT 'team';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'markup_comments_author_role_check') THEN
    ALTER TABLE public.markup_comments
      ADD CONSTRAINT markup_comments_author_role_check CHECK (author_role IN ('team', 'customer'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'panorama_comments_author_role_check') THEN
    ALTER TABLE public.panorama_comments
      ADD CONSTRAINT panorama_comments_author_role_check CHECK (author_role IN ('team', 'customer'));
  END IF;
END $$;

-- ------------------------------------------------------------
-- Backfill, using the same heuristic as migration 018: guests type a
-- free-form name, team members' comments carry the name on their `users`
-- row. A comment whose author matches no registered user is a customer's.
-- Biased toward 'customer' — a lost edit button is cheap, a lost customer
-- comment is not.
-- ------------------------------------------------------------
UPDATE public.markup_comments c
SET author_role = 'customer'
WHERE NOT EXISTS (
  SELECT 1 FROM public.users u
  WHERE LOWER(TRIM(u.name)) = LOWER(TRIM(c.user_name))
);

UPDATE public.panorama_comments c
SET author_role = 'customer'
WHERE NOT EXISTS (
  SELECT 1 FROM public.users u
  WHERE LOWER(TRIM(u.name)) = LOWER(TRIM(c.user_name))
);

-- ------------------------------------------------------------
-- Database-level guard.
--
-- UPDATE: a customer comment's text, drawing, and authorship are frozen.
-- Status (resolve), position (dragging the pin aside), numbering and
-- screenshot metadata stay writable — those are the team working on the
-- request, not rewriting it.
--
-- DELETE: blocked while the comment's parent still exists. As in 018, the
-- cascade from deleting the whole image/project (or a parent pin) is left
-- alone, otherwise those rows could never be removed.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prevent_customer_comment_update()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.author_role = 'customer' AND (
       NEW.content IS DISTINCT FROM OLD.content
    OR NEW.author_role IS DISTINCT FROM OLD.author_role
    OR (TG_TABLE_NAME = 'markup_comments'
        AND to_jsonb(NEW)->'drawing_data' IS DISTINCT FROM to_jsonb(OLD)->'drawing_data')
  ) THEN
    RAISE EXCEPTION 'Comment % was written by the customer and cannot be edited', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.prevent_customer_markup_comment_delete()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.author_role = 'customer'
     AND EXISTS (SELECT 1 FROM public.markup_threads WHERE id = OLD.thread_id)
     AND (OLD.parent_comment_id IS NULL
          OR EXISTS (SELECT 1 FROM public.markup_comments WHERE id = OLD.parent_comment_id))
  THEN
    RAISE EXCEPTION 'Comment % was written by the customer and cannot be deleted', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.prevent_customer_panorama_comment_delete()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.author_role = 'customer'
     AND EXISTS (SELECT 1 FROM public.panorama_images WHERE id = OLD.panorama_image_id)
     AND (OLD.parent_comment_id IS NULL
          OR EXISTS (SELECT 1 FROM public.panorama_comments WHERE id = OLD.parent_comment_id))
  THEN
    RAISE EXCEPTION 'Comment % was written by the customer and cannot be deleted', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_customer_comment_update ON public.markup_comments;
CREATE TRIGGER trg_prevent_customer_comment_update
  BEFORE UPDATE ON public.markup_comments
  FOR EACH ROW EXECUTE FUNCTION public.prevent_customer_comment_update();

DROP TRIGGER IF EXISTS trg_prevent_customer_comment_delete ON public.markup_comments;
CREATE TRIGGER trg_prevent_customer_comment_delete
  BEFORE DELETE ON public.markup_comments
  FOR EACH ROW EXECUTE FUNCTION public.prevent_customer_markup_comment_delete();

DROP TRIGGER IF EXISTS trg_prevent_customer_panorama_comment_update ON public.panorama_comments;
CREATE TRIGGER trg_prevent_customer_panorama_comment_update
  BEFORE UPDATE ON public.panorama_comments
  FOR EACH ROW EXECUTE FUNCTION public.prevent_customer_comment_update();

DROP TRIGGER IF EXISTS trg_prevent_customer_panorama_comment_delete ON public.panorama_comments;
CREATE TRIGGER trg_prevent_customer_panorama_comment_delete
  BEFORE DELETE ON public.panorama_comments
  FOR EACH ROW EXECUTE FUNCTION public.prevent_customer_panorama_comment_delete();
