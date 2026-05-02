-- Persistent tag-generation jobs (Task #55)
-- Narrow, additive migration: only creates the new tag_jobs table.
-- Uses IF NOT EXISTS so re-running on a DB that already has the table
-- (e.g. via `drizzle-kit push` in development) is a no-op.
CREATE TABLE IF NOT EXISTS "tag_jobs" (
        "job_id" varchar(32) PRIMARY KEY NOT NULL,
        "total" integer DEFAULT 0 NOT NULL,
        "processed" integer DEFAULT 0 NOT NULL,
        "from_dict" integer DEFAULT 0 NOT NULL,
        "from_ai" integer DEFAULT 0 NOT NULL,
        "from_hybrid" integer DEFAULT 0 NOT NULL,
        "skipped" integer DEFAULT 0 NOT NULL,
        "failed" integer DEFAULT 0 NOT NULL,
        "done" boolean DEFAULT false NOT NULL,
        "dry_run" boolean DEFAULT false NOT NULL,
        "gemini_available" boolean DEFAULT false NOT NULL,
        "error_sample" jsonb DEFAULT '[]'::jsonb,
        "started_at" timestamp DEFAULT now() NOT NULL,
        "finished_at" timestamp,
        "updated_at" timestamp DEFAULT now() NOT NULL
);
