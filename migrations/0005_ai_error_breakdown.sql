-- Per-category breakdown of AI failures on tag jobs (Task #69)
-- Splits the existing aiErrors total into rateLimited / maxTokens / parseFail
-- / httpError / networkError / other so the admin dashboard can show what
-- kind of Gemini failures the bulk run hit. Default empty object keeps
-- existing rows valid; uses IF NOT EXISTS so re-running after `drizzle-kit
-- push` is a no-op.
ALTER TABLE "tag_jobs" ADD COLUMN IF NOT EXISTS "ai_error_breakdown" jsonb DEFAULT '{"rateLimited":0,"maxTokens":0,"parseFail":0,"httpError":0,"networkError":0,"other":0}'::jsonb;
UPDATE "tag_jobs" SET "ai_error_breakdown" = '{"rateLimited":0,"maxTokens":0,"parseFail":0,"httpError":0,"networkError":0,"other":0}'::jsonb WHERE "ai_error_breakdown" IS NULL;
