import { pool } from "./db";

/**
 * Idempotent schema repair — runs at server startup.
 *
 * 1. Creates any missing tables (IF NOT EXISTS — safe no-op if already present)
 * 2. Adds any missing columns (IF NOT EXISTS — safe no-op if already present)
 *
 * This is the single safety net that keeps Railway / external production
 * databases in sync without requiring manual `drizzle-kit migrate` runs.
 */
export async function ensureSchema(): Promise<void> {
  const client = await pool.connect();
  try {

    // ── STEP 1: Create missing tables ─────────────────────────────────────────
    await client.query(`
      -- tag_jobs: persistent tag-generation job tracking (migration 0001)
      CREATE TABLE IF NOT EXISTS "tag_jobs" (
        "job_id"               varchar(32) PRIMARY KEY NOT NULL,
        "total"                integer     DEFAULT 0   NOT NULL,
        "processed"            integer     DEFAULT 0   NOT NULL,
        "from_dict"            integer     DEFAULT 0   NOT NULL,
        "from_ai"              integer     DEFAULT 0   NOT NULL,
        "from_hybrid"          integer     DEFAULT 0   NOT NULL,
        "skipped"              integer     DEFAULT 0   NOT NULL,
        "failed"               integer     DEFAULT 0   NOT NULL,
        "done"                 boolean     DEFAULT false NOT NULL,
        "dry_run"              boolean     DEFAULT false NOT NULL,
        "gemini_available"     boolean     DEFAULT false NOT NULL,
        "error_sample"         jsonb       DEFAULT '[]'::jsonb,
        "started_at"           timestamp   DEFAULT now() NOT NULL,
        "finished_at"          timestamp,
        "updated_at"           timestamp   DEFAULT now() NOT NULL,
        "ai_errors"            integer     DEFAULT 0   NOT NULL,
        "ai_error_sample"      jsonb       DEFAULT '[]'::jsonb,
        "ai_error_breakdown"   jsonb       DEFAULT '{"rateLimited":0,"maxTokens":0,"parseFail":0,"httpError":0,"networkError":0,"other":0}'::jsonb,
        "ai_failed_user_ids"   jsonb       DEFAULT '[]'::jsonb,
        "worker_failed_user_ids" jsonb     DEFAULT '[]'::jsonb
      );

      -- google_places_runs: audit log for Google Places admin bulk-fetch (migration 0007)
      CREATE TABLE IF NOT EXISTS "google_places_runs" (
        "id"           serial    PRIMARY KEY NOT NULL,
        "city"         text      NOT NULL,
        "service"      text      NOT NULL,
        "target"       integer   DEFAULT 0   NOT NULL,
        "unique_count" integer   DEFAULT 0   NOT NULL,
        "dup_skipped"  integer   DEFAULT 0   NOT NULL,
        "api_calls"    integer   DEFAULT 0   NOT NULL,
        "duration_ms"  integer   DEFAULT 0   NOT NULL,
        "started_at"   timestamp NOT NULL,
        "finished_at"  timestamp NOT NULL,
        "cancelled"    boolean   DEFAULT false NOT NULL,
        "error"        text,
        "stopped_by"   text
      );
      CREATE INDEX IF NOT EXISTS "gp_runs_started_at_idx" ON "google_places_runs" ("started_at");

      -- ai_token_usage: rolling Gemini token usage (migration 0009)
      CREATE TABLE IF NOT EXISTS "ai_token_usage" (
        "id"     serial    PRIMARY KEY NOT NULL,
        "ts"     timestamp DEFAULT now() NOT NULL,
        "tokens" integer   NOT NULL
      );
      CREATE INDEX IF NOT EXISTS "ai_token_usage_ts_idx" ON "ai_token_usage" ("ts");

      -- ai_report_log: AI usage report delivery log (migration 0010)
      CREATE TABLE IF NOT EXISTS "ai_report_log" (
        "id"              serial    PRIMARY KEY NOT NULL,
        "sent_at"         timestamp NOT NULL DEFAULT now(),
        "recipient"       text      NOT NULL,
        "success"         boolean   NOT NULL,
        "total_tokens"    integer   NOT NULL DEFAULT 0,
        "estimated_cost"  text      NOT NULL DEFAULT '',
        "peak_tokens"     integer   NOT NULL DEFAULT 0,
        "exceeded_hours"  integer   NOT NULL DEFAULT 0,
        "error_msg"       text
      );
      CREATE INDEX IF NOT EXISTS "ai_report_log_sent_at_idx" ON "ai_report_log" ("sent_at");
    `);

    // ── STEP 2: Add missing indexes on existing tables ────────────────────────
    await client.query(`
      CREATE INDEX IF NOT EXISTS "pending_providers_norm_phone_idx"
        ON "pending_providers"
        ((right(regexp_replace(coalesce("mobile", ''), '[^0-9]', '', 'g'), 10)));

      CREATE INDEX IF NOT EXISTS "local_users_norm_phone_idx"
        ON "local_users"
        ((right(regexp_replace(coalesce("phone", ''), '[^0-9]', '', 'g'), 10)));
    `);

    // ── STEP 3: Add missing columns to existing tables ────────────────────────
    await client.query(`
      -- profiles
      ALTER TABLE profiles ADD COLUMN IF NOT EXISTS latitude real;
      ALTER TABLE profiles ADD COLUMN IF NOT EXISTS longitude real;
      ALTER TABLE profiles ADD COLUMN IF NOT EXISTS accept_double_charge boolean DEFAULT false;
      ALTER TABLE profiles ADD COLUMN IF NOT EXISTS profile_completed boolean DEFAULT false;

      -- providers
      ALTER TABLE providers ADD COLUMN IF NOT EXISTS profile_photo text;
      ALTER TABLE providers ADD COLUMN IF NOT EXISTS is_hidden boolean DEFAULT false;
      ALTER TABLE providers ADD COLUMN IF NOT EXISTS state varchar(100);
      ALTER TABLE providers ADD COLUMN IF NOT EXISTS district varchar(100);
      ALTER TABLE providers ADD COLUMN IF NOT EXISTS pin_code varchar(10);
      ALTER TABLE providers ADD COLUMN IF NOT EXISTS profile_visibility varchar(20) DEFAULT 'public';
      ALTER TABLE providers ADD COLUMN IF NOT EXISTS added_by varchar(100) DEFAULT 'self';
      ALTER TABLE providers ADD COLUMN IF NOT EXISTS approved_by varchar(100);
      ALTER TABLE providers ADD COLUMN IF NOT EXISTS profile_completed boolean DEFAULT false;
      ALTER TABLE providers ADD COLUMN IF NOT EXISTS mobile_numbers text[] DEFAULT '{}';
      ALTER TABLE providers ADD COLUMN IF NOT EXISTS hashtags text[] DEFAULT '{}';
      ALTER TABLE providers ADD COLUMN IF NOT EXISTS service_name varchar(255);
      ALTER TABLE providers ALTER COLUMN mobile_numbers SET DEFAULT '{}';
      ALTER TABLE providers ALTER COLUMN hashtags SET DEFAULT '{}';

      -- calls
      ALTER TABLE calls ADD COLUMN IF NOT EXISTS charge_reason varchar(30) DEFAULT 'normal';
      ALTER TABLE calls ADD COLUMN IF NOT EXISTS credits_charged integer DEFAULT 1;

      -- subscriptions
      ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS billing_cycle varchar(20) DEFAULT 'monthly';
      ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS granted_by varchar(100);
      ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS created_at timestamp DEFAULT now();

      -- jobs
      ALTER TABLE jobs ADD COLUMN IF NOT EXISTS post_type varchar(20) DEFAULT 'mitrify';
      ALTER TABLE jobs ADD COLUMN IF NOT EXISTS google_form_url text;
      ALTER TABLE jobs ADD COLUMN IF NOT EXISTS apply_clicks integer DEFAULT 0;
    `);

    // ── STEP 4: Rename subscriptions.type → plan if needed ───────────────────
    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'subscriptions' AND column_name = 'type'
        ) AND NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'subscriptions' AND column_name = 'plan'
        ) THEN
          ALTER TABLE subscriptions RENAME COLUMN "type" TO plan;
        END IF;
      END
      $$;
      ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS plan varchar(20);
    `);

    console.log("[ensureSchema] schema is up to date");
  } catch (err) {
    console.error("[ensureSchema] WARNING: schema repair failed:", err);
  } finally {
    client.release();
  }
}
