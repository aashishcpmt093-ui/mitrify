import type { Pool } from "pg";
import type {
  AuditEvent,
  CatalogSnapshot,
  ClientRecord,
  GatewayStore,
  PriceEntry,
  UsageRow,
} from "./store";

// PostgreSQL storage for the gateway. Every table is prefixed gateway_ and is separate from the
// marketplace tables; nothing here reads or changes marketplace data. The same statements are in
// migrations/0012_ai_gateway.sql (and removed by 0012_ai_gateway.down.sql).

export const GATEWAY_SCHEMA_SQL = `
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
`;

const f = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
const d = (v: unknown): Date | null => (v ? new Date(v as string) : null);

function client(r: any): ClientRecord {
  return {
    id: r.id,
    name: r.name,
    keyHash: r.key_hash,
    keyPrefix: r.key_prefix,
    scopes: r.scopes,
    dailyBudgetUsd: f(r.daily_budget_usd),
    rpm: r.rpm,
    createdAt: new Date(r.created_at),
    expiresAt: d(r.expires_at),
    revokedAt: d(r.revoked_at),
    rotatedFrom: r.rotated_from,
    lastUsedAt: d(r.last_used_at),
  };
}

function usage(r: any): UsageRow {
  return {
    requestId: r.request_id,
    clientId: r.client_id,
    provider: r.provider,
    model: r.model,
    requestedModel: r.requested_model,
    mode: r.mode,
    httpStatus: r.http_status,
    outcome: r.outcome,
    inputTokens: r.input_tokens,
    outputTokens: r.output_tokens,
    cachedTokens: r.cached_tokens,
    usageSource: r.usage_source,
    estimatedCostUsd: f(r.estimated_cost_usd),
    reconciledCostUsd: f(r.reconciled_cost_usd),
    currency: r.currency,
    billingStatus: r.billing_status,
    latencyMs: r.latency_ms,
    firstByteMs: r.first_byte_ms,
    attempts: r.attempts,
    createdAt: new Date(r.created_at),
  };
}

function price(r: any): PriceEntry {
  return {
    provider: r.provider,
    upstreamModel: r.upstream_model,
    inputPerMTokUsd: Number(r.input_per_mtok_usd),
    outputPerMTokUsd: Number(r.output_per_mtok_usd),
    cachedInputPerMTokUsd: f(r.cached_input_per_mtok_usd),
    currency: "USD",
    sourceUrl: r.source_url,
    verifiedAt: new Date(r.verified_at),
    contextLength: r.context_length,
    supportsStreaming: r.supports_streaming,
    supportsTools: r.supports_tools,
    qualityPassed: r.quality_passed,
    enabled: r.enabled,
    updatedAt: new Date(r.updated_at),
  };
}

function snapshot(r: any): CatalogSnapshot {
  return { id: r.id, createdAt: new Date(r.created_at), weights: r.weights, entries: r.entries, excluded: r.excluded };
}

const CLIENT_COLS: Record<string, string> = {
  name: "name",
  scopes: "scopes",
  dailyBudgetUsd: "daily_budget_usd",
  rpm: "rpm",
  expiresAt: "expires_at",
  revokedAt: "revoked_at",
  lastUsedAt: "last_used_at",
};

export class PgStore implements GatewayStore {
  constructor(private pool: Pool) {}

  async init() {
    await this.pool.query(GATEWAY_SCHEMA_SQL);
  }

  async createClient(c: ClientRecord) {
    await this.pool.query(
      `INSERT INTO gateway_clients (id, name, key_hash, key_prefix, scopes, daily_budget_usd, rpm, created_at, expires_at, revoked_at, rotated_from)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [c.id, c.name, c.keyHash, c.keyPrefix, c.scopes, c.dailyBudgetUsd, c.rpm, c.createdAt, c.expiresAt, c.revokedAt, c.rotatedFrom],
    );
  }
  async findClientByHash(hash: string) {
    const r = await this.pool.query("SELECT * FROM gateway_clients WHERE key_hash = $1", [hash]);
    return r.rows[0] ? client(r.rows[0]) : null;
  }
  async getClient(id: string) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const r = await this.pool.query("SELECT * FROM gateway_clients WHERE id = $1", [id]);
    return r.rows[0] ? client(r.rows[0]) : null;
  }
  async listClients() {
    const r = await this.pool.query("SELECT * FROM gateway_clients ORDER BY created_at DESC");
    return r.rows.map(client);
  }
  async updateClient(id: string, patch: Partial<ClientRecord>) {
    const sets: string[] = [];
    const vals: unknown[] = [];
    for (const [k, v] of Object.entries(patch)) {
      const col = CLIENT_COLS[k];
      if (!col) continue; // only whitelisted columns can change
      vals.push(v);
      sets.push(`${col} = $${vals.length}`);
    }
    if (!sets.length) return;
    vals.push(id);
    await this.pool.query(`UPDATE gateway_clients SET ${sets.join(", ")} WHERE id = $${vals.length}`, vals);
  }

  async insertUsage(u: UsageRow) {
    await this.pool.query(
      `INSERT INTO gateway_usage (request_id, client_id, provider, model, requested_model, mode, http_status, outcome,
         input_tokens, output_tokens, cached_tokens, usage_source, estimated_cost_usd, reconciled_cost_usd, currency,
         billing_status, latency_ms, first_byte_ms, attempts, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
      [
        u.requestId, u.clientId, u.provider, u.model, u.requestedModel, u.mode, u.httpStatus, u.outcome,
        u.inputTokens, u.outputTokens, u.cachedTokens, u.usageSource, u.estimatedCostUsd, u.reconciledCostUsd, u.currency,
        u.billingStatus, u.latencyMs, u.firstByteMs, u.attempts, u.createdAt,
      ],
    );
  }
  async spentSince(since: Date, clientId?: string) {
    const r = clientId
      ? await this.pool.query(
          "SELECT COALESCE(SUM(COALESCE(reconciled_cost_usd, estimated_cost_usd)), 0) AS s FROM gateway_usage WHERE created_at >= $1 AND client_id = $2",
          [since, clientId],
        )
      : await this.pool.query(
          "SELECT COALESCE(SUM(COALESCE(reconciled_cost_usd, estimated_cost_usd)), 0) AS s FROM gateway_usage WHERE created_at >= $1",
          [since],
        );
    return Number(r.rows[0].s);
  }
  async tokenTotalsSince(since: Date) {
    const r = await this.pool.query(
      "SELECT COALESCE(SUM(input_tokens),0) AS i, COALESCE(SUM(output_tokens),0) AS o FROM gateway_usage WHERE created_at >= $1",
      [since],
    );
    return { input: Number(r.rows[0].i), output: Number(r.rows[0].o) };
  }
  async listUsage(since: Date, limit: number) {
    const r = await this.pool.query("SELECT * FROM gateway_usage WHERE created_at >= $1 ORDER BY created_at DESC LIMIT $2", [since, limit]);
    return r.rows.map(usage);
  }
  async reconcileUsage(requestId: string, costUsd: number) {
    const r = await this.pool.query(
      "UPDATE gateway_usage SET reconciled_cost_usd = $2, billing_status = 'reconciled' WHERE request_id = $1",
      [requestId, costUsd],
    );
    return (r.rowCount ?? 0) > 0;
  }

  async upsertPrice(p: PriceEntry) {
    await this.pool.query(
      `INSERT INTO gateway_prices (provider, upstream_model, input_per_mtok_usd, output_per_mtok_usd, cached_input_per_mtok_usd,
         currency, source_url, verified_at, context_length, supports_streaming, supports_tools, quality_passed, enabled, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       ON CONFLICT (provider, upstream_model) DO UPDATE SET
         input_per_mtok_usd = EXCLUDED.input_per_mtok_usd, output_per_mtok_usd = EXCLUDED.output_per_mtok_usd,
         cached_input_per_mtok_usd = EXCLUDED.cached_input_per_mtok_usd, currency = EXCLUDED.currency,
         source_url = EXCLUDED.source_url, verified_at = EXCLUDED.verified_at, context_length = EXCLUDED.context_length,
         supports_streaming = EXCLUDED.supports_streaming, supports_tools = EXCLUDED.supports_tools,
         quality_passed = EXCLUDED.quality_passed, enabled = EXCLUDED.enabled, updated_at = EXCLUDED.updated_at`,
      [
        p.provider, p.upstreamModel, p.inputPerMTokUsd, p.outputPerMTokUsd, p.cachedInputPerMTokUsd, p.currency, p.sourceUrl,
        p.verifiedAt, p.contextLength, p.supportsStreaming, p.supportsTools, p.qualityPassed, p.enabled, p.updatedAt,
      ],
    );
  }
  async listPrices() {
    const r = await this.pool.query("SELECT * FROM gateway_prices ORDER BY provider, upstream_model");
    return r.rows.map(price);
  }
  async saveSnapshot(s: Omit<CatalogSnapshot, "id">) {
    const r = await this.pool.query(
      "INSERT INTO gateway_price_snapshots (created_at, weights, entries, excluded) VALUES ($1,$2,$3,$4) RETURNING *",
      [s.createdAt, JSON.stringify(s.weights), JSON.stringify(s.entries), JSON.stringify(s.excluded)],
    );
    return snapshot(r.rows[0]);
  }
  async latestSnapshot() {
    const r = await this.pool.query("SELECT * FROM gateway_price_snapshots ORDER BY id DESC LIMIT 1");
    return r.rows[0] ? snapshot(r.rows[0]) : null;
  }

  async getSetting<T>(key: string) {
    const r = await this.pool.query("SELECT value FROM gateway_settings WHERE key = $1", [key]);
    return r.rows[0] ? (r.rows[0].value as T) : null;
  }
  async setSetting(key: string, value: unknown) {
    await this.pool.query(
      `INSERT INTO gateway_settings (key, value, updated_at) VALUES ($1, $2, now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [key, JSON.stringify(value)],
    );
  }

  async insertAudit(e: AuditEvent) {
    await this.pool.query("INSERT INTO gateway_audit (at, actor, action, ip, detail) VALUES ($1,$2,$3,$4,$5)", [
      e.at, e.actor, e.action, e.ip, JSON.stringify(e.detail),
    ]);
  }
  async listAudit(limit: number) {
    const r = await this.pool.query("SELECT * FROM gateway_audit ORDER BY id DESC LIMIT $1", [limit]);
    return r.rows.map((x: any) => ({ at: new Date(x.at), actor: x.actor, action: x.action, ip: x.ip, detail: x.detail }));
  }
}
