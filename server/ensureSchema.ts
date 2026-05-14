import { pool } from "./db";

/**
 * Idempotent schema repair — runs at server startup.
 *
 * Adds any columns that exist in shared/schema.ts but were never captured
 * in a formal Drizzle migration file.  Every statement uses
 * "ADD COLUMN IF NOT EXISTS" so running on a database that already has the
 * column is a safe no-op.
 *
 * This is the safety net that keeps Railway / external production databases
 * in sync even when drizzle-kit migrate has not been run manually.
 */
export async function ensureSchema(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      -- profiles: extra columns not in migration 0000
      ALTER TABLE profiles ADD COLUMN IF NOT EXISTS latitude real;
      ALTER TABLE profiles ADD COLUMN IF NOT EXISTS longitude real;
      ALTER TABLE profiles ADD COLUMN IF NOT EXISTS accept_double_charge boolean DEFAULT false;
      ALTER TABLE profiles ADD COLUMN IF NOT EXISTS profile_completed boolean DEFAULT false;

      -- providers: extra columns not in migration 0000
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

      -- calls: extra columns not in migration 0000
      ALTER TABLE calls ADD COLUMN IF NOT EXISTS charge_reason varchar(30) DEFAULT 'normal';
      ALTER TABLE calls ADD COLUMN IF NOT EXISTS credits_charged integer DEFAULT 1;

      -- subscriptions: billing_cycle, granted_by, created_at
      ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS billing_cycle varchar(20) DEFAULT 'monthly';
      ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS granted_by varchar(100);
      ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS created_at timestamp DEFAULT now();
    `);

    // Handle subscriptions "type" → "plan" rename separately (needs PL/pgSQL)
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
    // Log but never crash the server — a missing column will surface as a
    // proper 500 on the affected route, not a startup failure.
    console.error("[ensureSchema] WARNING: schema repair failed:", err);
  } finally {
    client.release();
  }
}
