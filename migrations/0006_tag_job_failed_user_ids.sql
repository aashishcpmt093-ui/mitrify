-- Failed-provider lists on tag jobs (Task #70)
-- Captures the userIds that failed during a bulk auto-tag run, split by
-- failure source (Gemini AI vs generic worker/DB exception). The admin
-- "Retry failed only" button reads these to start a new scoped tag job
-- without re-hitting Gemini quota for providers that already succeeded.
-- Default empty array keeps existing rows valid; uses IF NOT EXISTS so
-- re-running after `drizzle-kit push` is a no-op.
ALTER TABLE "tag_jobs" ADD COLUMN IF NOT EXISTS "ai_failed_user_ids" jsonb DEFAULT '[]'::jsonb;
ALTER TABLE "tag_jobs" ADD COLUMN IF NOT EXISTS "worker_failed_user_ids" jsonb DEFAULT '[]'::jsonb;
UPDATE "tag_jobs" SET "ai_failed_user_ids" = '[]'::jsonb WHERE "ai_failed_user_ids" IS NULL;
UPDATE "tag_jobs" SET "worker_failed_user_ids" = '[]'::jsonb WHERE "worker_failed_user_ids" IS NULL;
