-- Track Apply clicks on Google Form jobs (Task #65)
-- Adds apply_clicks counter on jobs. Backfilled to 0 for existing rows.
-- Uses IF NOT EXISTS so re-running after `drizzle-kit push` is a no-op.
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "apply_clicks" integer DEFAULT 0 NOT NULL;
UPDATE "jobs" SET "apply_clicks" = 0 WHERE "apply_clicks" IS NULL;
