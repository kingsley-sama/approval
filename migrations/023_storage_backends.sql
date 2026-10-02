-- ============================================================
-- MIGRATION 023 — Per-project storage account
--
-- Files can live in two Supabase accounts (see lib/storage/backends.ts):
--   'default'   — the account that holds this database
--   'secondary' — a separate account used only for file storage
--
-- storage_backend decides where a project's NEW uploads go. Every project
-- that exists when this runs keeps 'default', so nothing has to move; every
-- project created afterwards — by any path, including duplicate_project and
-- the /api/v1 API — gets 'secondary' from the column default.
--
-- Reads and deletes do not use this column: each stored file reference
-- carries its own account (URL host, or a 'secondary:' path prefix), because
-- duplication copies references across projects.
--
-- Until STORAGE_SECONDARY_SUPABASE_URL / STORAGE_SECONDARY_SERVICE_ROLE_KEY
-- are set, 'secondary' projects fall back to writing to the default account.
--
-- Run manually in the Supabase SQL Editor.
-- ============================================================

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['markup_projects', 'panorama_projects', 'tour_projects'] LOOP
    -- Adding with DEFAULT 'default' backfills existing rows...
    EXECUTE format(
      'ALTER TABLE %I ADD COLUMN IF NOT EXISTS storage_backend text NOT NULL DEFAULT %L',
      t, 'default'
    );
    -- ...then new rows default to the secondary account.
    EXECUTE format('ALTER TABLE %I ALTER COLUMN storage_backend SET DEFAULT %L', t, 'secondary');

    BEGIN
      EXECUTE format(
        'ALTER TABLE %I ADD CONSTRAINT %I CHECK (storage_backend IN (%L, %L))',
        t, t || '_storage_backend_check', 'default', 'secondary'
      );
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    EXECUTE format(
      'COMMENT ON COLUMN %I.storage_backend IS %L',
      t, 'Supabase account that receives this project''s new uploads: default | secondary'
    );
  END LOOP;
END $$;
