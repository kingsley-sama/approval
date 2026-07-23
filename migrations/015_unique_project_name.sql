-- 015: Enforce unique project names (case-insensitive, whitespace-trimmed).
--
-- App-level checks in createProject (app/actions/projects.ts) and
-- POST /api/v1/projects gate duplicates with a friendly error; this index is
-- the race-proof backstop so two concurrent creates can't both slip through.
--
-- NOTE: fails if existing rows already collide. Find collisions first with:
--   SELECT lower(trim(project_name)), count(*), array_agg(id)
--   FROM markup_projects
--   GROUP BY 1 HAVING count(*) > 1;
-- and rename the extras before running.

CREATE UNIQUE INDEX IF NOT EXISTS markup_projects_name_unique
  ON markup_projects (lower(trim(project_name)));
