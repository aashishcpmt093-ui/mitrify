CREATE TABLE IF NOT EXISTS "ai_report_log" (
  "id" serial PRIMARY KEY NOT NULL,
  "sent_at" timestamp NOT NULL DEFAULT now(),
  "recipient" text NOT NULL,
  "success" boolean NOT NULL,
  "total_tokens" integer NOT NULL DEFAULT 0,
  "estimated_cost" text NOT NULL DEFAULT '',
  "peak_tokens" integer NOT NULL DEFAULT 0,
  "exceeded_hours" integer NOT NULL DEFAULT 0,
  "error_msg" text
);
CREATE INDEX IF NOT EXISTS "ai_report_log_sent_at_idx" ON "ai_report_log" ("sent_at");
