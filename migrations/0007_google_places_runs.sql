-- Audit/replay log for completed Google Places admin bulk-fetch runs (Task #62).
-- Counts only — full `places` arrays are never persisted (privacy + size).
-- The admin Google Places card surfaces last-10 history with click-to-replay
-- (copies city + service back into the inputs).
CREATE TABLE IF NOT EXISTS "google_places_runs" (
  "id" serial PRIMARY KEY NOT NULL,
  "city" text NOT NULL,
  "service" text NOT NULL,
  "target" integer DEFAULT 0 NOT NULL,
  "unique_count" integer DEFAULT 0 NOT NULL,
  "dup_skipped" integer DEFAULT 0 NOT NULL,
  "api_calls" integer DEFAULT 0 NOT NULL,
  "duration_ms" integer DEFAULT 0 NOT NULL,
  "started_at" timestamp NOT NULL,
  "finished_at" timestamp NOT NULL,
  "cancelled" boolean DEFAULT false NOT NULL,
  "error" text,
  "stopped_by" text
);

CREATE INDEX IF NOT EXISTS "gp_runs_started_at_idx" ON "google_places_runs" ("started_at");
