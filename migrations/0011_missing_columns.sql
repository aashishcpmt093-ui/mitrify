-- Task #176: Add columns that exist in shared/schema.ts but were never
-- included in the initial migration (0000_same_loners.sql). These columns
-- were previously added via drizzle-kit push in development only, so any
-- Railway / production database set up from migration files alone is missing
-- them — causing SELECT * queries from Drizzle ORM to throw
-- "column X does not exist" and the admin /api/admin/providers endpoint to
-- return 500 "Failed to fetch providers".
--
-- ALL statements use IF NOT EXISTS / DO NOTHING so re-running on a DB that
-- already has the columns (e.g. dev) is a safe no-op.

-- ── profiles ─────────────────────────────────────────────────────────────────
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "latitude" real;
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "longitude" real;
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "accept_double_charge" boolean DEFAULT false;

-- ── providers ────────────────────────────────────────────────────────────────
ALTER TABLE "providers" ADD COLUMN IF NOT EXISTS "profile_photo" text;
ALTER TABLE "providers" ADD COLUMN IF NOT EXISTS "is_hidden" boolean DEFAULT false;
ALTER TABLE "providers" ADD COLUMN IF NOT EXISTS "state" varchar(100);
ALTER TABLE "providers" ADD COLUMN IF NOT EXISTS "district" varchar(100);
ALTER TABLE "providers" ADD COLUMN IF NOT EXISTS "pin_code" varchar(10);
ALTER TABLE "providers" ADD COLUMN IF NOT EXISTS "profile_visibility" varchar(20) DEFAULT 'public';
ALTER TABLE "providers" ADD COLUMN IF NOT EXISTS "added_by" varchar(100) DEFAULT 'self';
ALTER TABLE "providers" ADD COLUMN IF NOT EXISTS "approved_by" varchar(100);

-- ── calls ────────────────────────────────────────────────────────────────────
ALTER TABLE "calls" ADD COLUMN IF NOT EXISTS "charge_reason" varchar(30) DEFAULT 'normal';
ALTER TABLE "calls" ADD COLUMN IF NOT EXISTS "credits_charged" integer DEFAULT 1;

-- ── subscriptions ────────────────────────────────────────────────────────────
-- The initial migration used "type" for the plan column. The current schema
-- uses "plan". Rename only if the old column still exists.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'subscriptions' AND column_name = 'type'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'subscriptions' AND column_name = 'plan'
  ) THEN
    ALTER TABLE "subscriptions" RENAME COLUMN "type" TO "plan";
  END IF;
END
$$;
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "plan" varchar(20);
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "billing_cycle" varchar(20) DEFAULT 'monthly';
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "granted_by" varchar(100);
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "created_at" timestamp DEFAULT now();

-- Make amount default 0 instead of NOT NULL without default (safe backfill)
UPDATE "subscriptions" SET "amount" = 0 WHERE "amount" IS NULL;
