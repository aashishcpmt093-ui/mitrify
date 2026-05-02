-- Surface silent Gemini AI failures (Task #58)
-- Narrow, additive migration: only adds two columns to tag_jobs to track
-- AI-side failures separately from generic worker failures, so admins can
-- see when Gemini is silently returning empty responses (e.g. MAX_TOKENS
-- consumed by thinking tokens, parse failures, rate-limits).
-- Uses IF NOT EXISTS so re-running on a DB that already has the columns
-- (e.g. via `drizzle-kit push` in development) is a no-op.
ALTER TABLE "tag_jobs" ADD COLUMN IF NOT EXISTS "ai_errors" integer DEFAULT 0 NOT NULL;
ALTER TABLE "tag_jobs" ADD COLUMN IF NOT EXISTS "ai_error_sample" jsonb DEFAULT '[]'::jsonb;
