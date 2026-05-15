import { pool } from "./db";

/**
 * Idempotent schema repair — runs at server startup BEFORE any routes register.
 *
 * The base migration (0000_same_loners.sql) only created 8 tables.
 * The app uses 22 tables. This function creates ALL missing tables and adds
 * ALL missing columns so Railway / any fresh PostgreSQL DB works without
 * manual migration runs.
 *
 * Every statement uses IF NOT EXISTS / IF NOT EXISTS so re-running on a
 * database that already has everything is a safe no-op.
 */
export async function ensureSchema(): Promise<void> {
  const client = await pool.connect();
  try {

    // ── STEP 1: Create ALL tables that the app needs ──────────────────────────
    // The 0000 migration only created: calls, local_users, profiles, promo_codes,
    // providers, sessions, subscriptions, users.
    // Everything else must be created here.

    await client.query(`
      -- credits (missing from 0000)
      CREATE TABLE IF NOT EXISTS "credits" (
        "id"                 serial      PRIMARY KEY NOT NULL,
        "user_id"            varchar     NOT NULL,
        "role"               varchar(20) NOT NULL,
        "free_credits"       integer     DEFAULT 5,
        "purchased_credits"  integer     DEFAULT 0,
        "last_free_reset"    timestamp   DEFAULT now(),
        "credits_frozen"     boolean     DEFAULT false
      );
      CREATE UNIQUE INDEX IF NOT EXISTS "credits_user_role_idx" ON "credits" ("user_id", "role");

      -- site_content (missing from 0000)
      CREATE TABLE IF NOT EXISTS "site_content" (
        "id"         serial      PRIMARY KEY NOT NULL,
        "key"        varchar(50) NOT NULL,
        "value"      jsonb       NOT NULL,
        "updated_at" timestamp   DEFAULT now(),
        CONSTRAINT "site_content_key_unique" UNIQUE ("key")
      );

      -- app_notifications (missing from 0000)
      CREATE TABLE IF NOT EXISTS "app_notifications" (
        "id"         serial       PRIMARY KEY NOT NULL,
        "user_id"    varchar(255) NOT NULL,
        "title"      varchar(255) NOT NULL,
        "message"    text         NOT NULL,
        "type"       varchar(50)  NOT NULL DEFAULT 'info',
        "is_read"    boolean      NOT NULL DEFAULT false,
        "created_at" timestamp    DEFAULT now()
      );

      -- co_admins (missing from 0000)
      CREATE TABLE IF NOT EXISTS "co_admins" (
        "id"                   serial       PRIMARY KEY NOT NULL,
        "username"             varchar(100) NOT NULL,
        "password"             varchar(255) NOT NULL,
        "role"                 varchar(20)  NOT NULL DEFAULT 'coadmin',
        "is_active"            boolean      DEFAULT true,
        "call_count"           integer      NOT NULL DEFAULT 0,
        "cycle_entry_count"    integer      NOT NULL DEFAULT 0,
        "cycle_approve_count"  integer      NOT NULL DEFAULT 0,
        "cycle_reject_count"   integer      NOT NULL DEFAULT 0,
        "cycle_call_count"     integer      NOT NULL DEFAULT 0,
        "cycle_start_at"       timestamp    DEFAULT now(),
        "created_at"           timestamp    DEFAULT now(),
        CONSTRAINT "co_admins_username_unique" UNIQUE ("username")
      );

      -- salary_payments (missing from 0000)
      CREATE TABLE IF NOT EXISTS "salary_payments" (
        "id"              serial       PRIMARY KEY NOT NULL,
        "username"        varchar(100) NOT NULL,
        "entry_count"     integer      NOT NULL DEFAULT 0,
        "approve_count"   integer      NOT NULL DEFAULT 0,
        "reject_count"    integer      NOT NULL DEFAULT 0,
        "call_count"      integer      NOT NULL DEFAULT 0,
        "total_actions"   integer      NOT NULL DEFAULT 0,
        "rate_per_action" integer      NOT NULL DEFAULT 3,
        "total_amount"    integer      NOT NULL DEFAULT 0,
        "cycle_start"     timestamp,
        "cycle_end"       timestamp    DEFAULT now(),
        "paid_by_admin"   varchar(100),
        "created_at"      timestamp    DEFAULT now()
      );

      -- credit_payments (missing from 0000)
      CREATE TABLE IF NOT EXISTS "credit_payments" (
        "id"         serial       PRIMARY KEY NOT NULL,
        "user_id"    varchar(255) NOT NULL,
        "order_id"   varchar(255) NOT NULL,
        "credits"    integer      NOT NULL,
        "amount"     integer      NOT NULL,
        "status"     varchar(20)  NOT NULL DEFAULT 'pending',
        "paid_at"    timestamp,
        "created_at" timestamp    DEFAULT now(),
        CONSTRAINT "credit_payments_order_id_unique" UNIQUE ("order_id")
      );

      -- pending_providers (missing from 0000)
      CREATE TABLE IF NOT EXISTS "pending_providers" (
        "id"              serial       PRIMARY KEY NOT NULL,
        "name"            varchar(255) NOT NULL,
        "service_name"    varchar(255) NOT NULL,
        "description"     text,
        "mobile"          varchar(20),
        "mobile_numbers"  jsonb        DEFAULT '[]'::jsonb,
        "hashtags"        jsonb        DEFAULT '[]'::jsonb,
        "address"         text,
        "state"           varchar(100),
        "district"        varchar(100),
        "latitude"        real,
        "longitude"       real,
        "radius_km"       integer      DEFAULT 10,
        "approx_charge"   varchar(100),
        "profile_photo"   text,
        "is_hidden"       boolean      DEFAULT false,
        "status"          varchar(20)  NOT NULL DEFAULT 'pending',
        "added_by"        varchar(100) NOT NULL,
        "verified_by"     varchar(100),
        "group_label"     varchar(5),
        "source"          varchar(20),
        "notes"           text,
        "created_at"      timestamp    DEFAULT now()
      );

      -- promo_usage_log (missing from 0000)
      CREATE TABLE IF NOT EXISTS "promo_usage_log" (
        "id"         serial      PRIMARY KEY NOT NULL,
        "promo_code" varchar(50) NOT NULL,
        "phone"      varchar(20) NOT NULL,
        "used_at"    timestamp   DEFAULT now()
      );

      -- visitor_stats (missing from 0000)
      CREATE TABLE IF NOT EXISTS "visitor_stats" (
        "id"    serial      PRIMARY KEY NOT NULL,
        "date"  varchar(10) NOT NULL,
        "count" integer     NOT NULL DEFAULT 0,
        CONSTRAINT "visitor_stats_date_unique" UNIQUE ("date")
      );

      -- jobs (missing from 0000)
      CREATE TABLE IF NOT EXISTS "jobs" (
        "id"              serial       PRIMARY KEY NOT NULL,
        "user_id"         varchar(255) NOT NULL,
        "job_name"        varchar(200) NOT NULL,
        "description"     text         NOT NULL,
        "location"        varchar(300) NOT NULL,
        "state"           varchar(100),
        "district"        varchar(100),
        "work_type"       varchar(50)  DEFAULT 'field',
        "salary"          varchar(100),
        "work_hours"      varchar(100),
        "num_employees"   varchar(50),
        "contact_phone"   varchar(20),
        "post_type"       varchar(20)  NOT NULL DEFAULT 'mitrify',
        "google_form_url" text,
        "is_active"       boolean      NOT NULL DEFAULT true,
        "low_credit"      boolean      NOT NULL DEFAULT false,
        "apply_clicks"    integer      NOT NULL DEFAULT 0,
        "created_at"      timestamp    DEFAULT now()
      );

      -- employees (missing from 0000)
      CREATE TABLE IF NOT EXISTS "employees" (
        "id"            serial       PRIMARY KEY NOT NULL,
        "co_admin_id"   integer      NOT NULL,
        "name"          varchar(255) NOT NULL,
        "post"          varchar(255) NOT NULL,
        "education"     varchar(255),
        "description"   text,
        "profile_photo" text,
        "created_at"    timestamp    DEFAULT now(),
        "updated_at"    timestamp    DEFAULT now()
      );

      -- search_log (missing from 0000)
      CREATE TABLE IF NOT EXISTS "search_log" (
        "id"            serial       PRIMARY KEY NOT NULL,
        "query"         varchar(255) NOT NULL,
        "count"         integer      NOT NULL DEFAULT 1,
        "last_searched" timestamp    DEFAULT now()
      );

      -- tag_jobs (migration 0001)
      CREATE TABLE IF NOT EXISTS "tag_jobs" (
        "job_id"                  varchar(32) PRIMARY KEY NOT NULL,
        "total"                   integer     DEFAULT 0   NOT NULL,
        "processed"               integer     DEFAULT 0   NOT NULL,
        "from_dict"               integer     DEFAULT 0   NOT NULL,
        "from_ai"                 integer     DEFAULT 0   NOT NULL,
        "from_hybrid"             integer     DEFAULT 0   NOT NULL,
        "skipped"                 integer     DEFAULT 0   NOT NULL,
        "failed"                  integer     DEFAULT 0   NOT NULL,
        "done"                    boolean     DEFAULT false NOT NULL,
        "dry_run"                 boolean     DEFAULT false NOT NULL,
        "gemini_available"        boolean     DEFAULT false NOT NULL,
        "error_sample"            jsonb       DEFAULT '[]'::jsonb,
        "started_at"              timestamp   DEFAULT now() NOT NULL,
        "finished_at"             timestamp,
        "updated_at"              timestamp   DEFAULT now() NOT NULL,
        "ai_errors"               integer     DEFAULT 0   NOT NULL,
        "ai_error_sample"         jsonb       DEFAULT '[]'::jsonb,
        "ai_error_breakdown"      jsonb       DEFAULT '{"rateLimited":0,"maxTokens":0,"parseFail":0,"httpError":0,"networkError":0,"other":0}'::jsonb,
        "ai_failed_user_ids"      jsonb       DEFAULT '[]'::jsonb,
        "worker_failed_user_ids"  jsonb       DEFAULT '[]'::jsonb
      );

      -- google_places_runs (migration 0007)
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

      -- ai_token_usage (migration 0009)
      CREATE TABLE IF NOT EXISTS "ai_token_usage" (
        "id"     serial    PRIMARY KEY NOT NULL,
        "ts"     timestamp DEFAULT now() NOT NULL,
        "tokens" integer   NOT NULL
      );
      CREATE INDEX IF NOT EXISTS "ai_token_usage_ts_idx" ON "ai_token_usage" ("ts");

      -- ai_report_log (migration 0010)
      CREATE TABLE IF NOT EXISTS "ai_report_log" (
        "id"             serial    PRIMARY KEY NOT NULL,
        "sent_at"        timestamp NOT NULL DEFAULT now(),
        "recipient"      text      NOT NULL,
        "success"        boolean   NOT NULL,
        "total_tokens"   integer   NOT NULL DEFAULT 0,
        "estimated_cost" text      NOT NULL DEFAULT '',
        "peak_tokens"    integer   NOT NULL DEFAULT 0,
        "exceeded_hours" integer   NOT NULL DEFAULT 0,
        "error_msg"      text
      );
      CREATE INDEX IF NOT EXISTS "ai_report_log_sent_at_idx" ON "ai_report_log" ("sent_at");
    `);

    // ── STEP 2: Indexes on existing tables ────────────────────────────────────
    await client.query(`
      CREATE INDEX IF NOT EXISTS "profiles_user_role_idx"
        ON "profiles" ("user_id", "role");

      CREATE INDEX IF NOT EXISTS "subs_user_idx"
        ON "subscriptions" ("user_id");

      CREATE INDEX IF NOT EXISTS "subs_active_idx"
        ON "subscriptions" ("user_id", "status", "end_date");

      CREATE UNIQUE INDEX IF NOT EXISTS "subs_payment_id_unique"
        ON "subscriptions" ("payment_id")
        WHERE "payment_id" IS NOT NULL;

      CREATE INDEX IF NOT EXISTS "pending_providers_norm_phone_idx"
        ON "pending_providers"
        ((right(regexp_replace(coalesce("mobile", ''), '[^0-9]', '', 'g'), 10)));

      CREATE INDEX IF NOT EXISTS "local_users_norm_phone_idx"
        ON "local_users"
        ((right(regexp_replace(coalesce("phone", ''), '[^0-9]', '', 'g'), 10)));
    `);

    // ── STEP 3: Add missing columns to tables that DO exist from 0000 ─────────
    await client.query(`
      -- local_users: is_blocked missing from 0000
      ALTER TABLE "local_users" ADD COLUMN IF NOT EXISTS "is_blocked" boolean DEFAULT false;

      -- profiles: extra columns not in 0000
      ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "latitude"              real;
      ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "longitude"             real;
      ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "accept_double_charge"  boolean DEFAULT false;
      ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "profile_completed"     boolean DEFAULT false;

      -- providers: extra columns not in 0000
      ALTER TABLE "providers" ADD COLUMN IF NOT EXISTS "profile_photo"        text;
      ALTER TABLE "providers" ADD COLUMN IF NOT EXISTS "is_hidden"            boolean DEFAULT false;
      ALTER TABLE "providers" ADD COLUMN IF NOT EXISTS "state"                varchar(100);
      ALTER TABLE "providers" ADD COLUMN IF NOT EXISTS "district"             varchar(100);
      ALTER TABLE "providers" ADD COLUMN IF NOT EXISTS "pin_code"             varchar(10);
      ALTER TABLE "providers" ADD COLUMN IF NOT EXISTS "profile_visibility"   varchar(20) DEFAULT 'public';
      ALTER TABLE "providers" ADD COLUMN IF NOT EXISTS "added_by"             varchar(100) DEFAULT 'self';
      ALTER TABLE "providers" ADD COLUMN IF NOT EXISTS "approved_by"          varchar(100);
      ALTER TABLE "providers" ADD COLUMN IF NOT EXISTS "profile_completed"    boolean DEFAULT false;
      ALTER TABLE "providers" ADD COLUMN IF NOT EXISTS "mobile_numbers"       text[] DEFAULT '{}';
      ALTER TABLE "providers" ADD COLUMN IF NOT EXISTS "hashtags"             text[] DEFAULT '{}';
      ALTER TABLE "providers" ADD COLUMN IF NOT EXISTS "service_name"         varchar(255);
      ALTER TABLE "providers" ALTER COLUMN "mobile_numbers" SET DEFAULT '{}';
      ALTER TABLE "providers" ALTER COLUMN "hashtags"       SET DEFAULT '{}';

      -- calls: extra columns not in 0000
      ALTER TABLE "calls" ADD COLUMN IF NOT EXISTS "charge_reason"    varchar(30) DEFAULT 'normal';
      ALTER TABLE "calls" ADD COLUMN IF NOT EXISTS "credits_charged"  integer     DEFAULT 1;

      -- promo_codes: credit_amount missing from 0000; widen code to varchar(50)
      ALTER TABLE "promo_codes" ADD COLUMN IF NOT EXISTS "credit_amount" integer DEFAULT 25;
      ALTER TABLE "promo_codes" ALTER COLUMN "code" TYPE varchar(50);

      -- subscriptions: extra columns not in 0000
      ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "billing_cycle" varchar(20) DEFAULT 'monthly';
      ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "granted_by"    varchar(100);
      ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "created_at"    timestamp DEFAULT now();
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
          ALTER TABLE "subscriptions" RENAME COLUMN "type" TO "plan";
        END IF;
      END
      $$;
      ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "plan" varchar(20);
    `);

    console.log("[ensureSchema] all 22 tables verified — schema is up to date");
  } catch (err) {
    console.error("[ensureSchema] WARNING: schema repair failed:", err);
  } finally {
    client.release();
  }
}
