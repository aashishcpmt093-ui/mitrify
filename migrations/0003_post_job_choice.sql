-- Post Job: Google Form ya Mitrify (Task #63)
-- Adds post_type ("mitrify" | "google_form") + google_form_url to jobs and
-- relaxes contact_phone so Google-Form posts don't require a phone. All
-- existing rows are backfilled with post_type = 'mitrify' so they continue
-- to behave exactly as before. Uses IF NOT EXISTS so re-running after a
-- `drizzle-kit push` in development is a no-op.
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "post_type" varchar(20) DEFAULT 'mitrify' NOT NULL;
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "google_form_url" text;
ALTER TABLE "jobs" ALTER COLUMN "contact_phone" DROP NOT NULL;
UPDATE "jobs" SET "post_type" = 'mitrify' WHERE "post_type" IS NULL;
