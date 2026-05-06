-- Persisted AI token usage — one row per Gemini call.
-- Used to reconstruct the rolling hourly token count across server restarts/deploys.
-- Rows older than 2 hours are pruned automatically by the application.
CREATE TABLE IF NOT EXISTS "ai_token_usage" (
  "id" serial PRIMARY KEY NOT NULL,
  "ts" timestamp DEFAULT now() NOT NULL,
  "tokens" integer NOT NULL
);

CREATE INDEX IF NOT EXISTS "ai_token_usage_ts_idx" ON "ai_token_usage" ("ts");
