-- Mitrify AI Gateway tables (all prefixed gateway_). Separate from the marketplace tables.
-- The server also creates them on start when MITRIFY_GATEWAY_ENABLED=1 (server/gateway/pgStore.ts).
-- Undo: migrations/0012_ai_gateway.down.sql
CREATE TABLE IF NOT EXISTS gateway_clients (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  key_hash char(64) NOT NULL UNIQUE,
  key_prefix text NOT NULL,
  scopes text[] NOT NULL,
  daily_budget_usd numeric(14,6),
  rpm integer NOT NULL DEFAULT 600,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  rotated_from uuid,
  last_used_at timestamptz
);

CREATE TABLE IF NOT EXISTS gateway_usage (
  id bigserial PRIMARY KEY,
  request_id text NOT NULL UNIQUE,
  client_id uuid NOT NULL,
  provider text NOT NULL,
  model text NOT NULL,
  requested_model text NOT NULL,
  mode text NOT NULL,
  http_status integer NOT NULL,
  outcome text NOT NULL,
  input_tokens integer,
  output_tokens integer,
  cached_tokens integer,
  usage_source text NOT NULL,
  estimated_cost_usd numeric(18,8),
  reconciled_cost_usd numeric(18,8),
  currency text NOT NULL DEFAULT 'USD',
  billing_status text NOT NULL,
  latency_ms integer NOT NULL,
  first_byte_ms integer,
  attempts integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gateway_usage_created_idx ON gateway_usage (created_at);
CREATE INDEX IF NOT EXISTS gateway_usage_client_created_idx ON gateway_usage (client_id, created_at);

CREATE TABLE IF NOT EXISTS gateway_prices (
  provider text NOT NULL,
  upstream_model text NOT NULL,
  input_per_mtok_usd numeric(14,6) NOT NULL,
  output_per_mtok_usd numeric(14,6) NOT NULL,
  cached_input_per_mtok_usd numeric(14,6),
  currency text NOT NULL DEFAULT 'USD',
  source_url text NOT NULL,
  verified_at timestamptz NOT NULL,
  context_length integer,
  supports_streaming boolean NOT NULL DEFAULT true,
  supports_tools boolean NOT NULL DEFAULT false,
  quality_passed boolean NOT NULL DEFAULT false,
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, upstream_model)
);

CREATE TABLE IF NOT EXISTS gateway_price_snapshots (
  id serial PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  weights jsonb NOT NULL,
  entries jsonb NOT NULL,
  excluded jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS gateway_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gateway_audit (
  id bigserial PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  actor text NOT NULL,
  action text NOT NULL,
  ip text,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS gateway_audit_at_idx ON gateway_audit (at);
