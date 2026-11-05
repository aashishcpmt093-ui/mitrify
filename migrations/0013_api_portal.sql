-- API portal: customers, their credit ledger, and which key belongs to which customer.
-- Separate gateway_* tables again; marketplace tables are not touched. The server also applies these
-- statements on start when MITRIFY_GATEWAY_ENABLED=1 (server/gateway/pgStore.ts), so running this by hand is optional.
-- Undo: migrations/0013_api_portal.down.sql
CREATE TABLE IF NOT EXISTS gateway_customers (
  id uuid PRIMARY KEY,
  email text NOT NULL UNIQUE,
  name text NOT NULL,
  password_hash text NOT NULL,
  balance_usd numeric(18,8) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  disabled_at timestamptz
);
CREATE TABLE IF NOT EXISTS gateway_ledger (
  id bigserial PRIMARY KEY,
  customer_id uuid NOT NULL,
  kind text NOT NULL,
  amount_usd numeric(18,8) NOT NULL,
  balance_after_usd numeric(18,8) NOT NULL,
  ref text NOT NULL DEFAULT '',
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gateway_ledger_customer_idx ON gateway_ledger (customer_id, id);
ALTER TABLE gateway_clients ADD COLUMN IF NOT EXISTS customer_id uuid;
CREATE INDEX IF NOT EXISTS gateway_clients_customer_idx ON gateway_clients (customer_id);
ALTER TABLE gateway_usage ADD COLUMN IF NOT EXISTS billed_cost_usd numeric(18,8);
