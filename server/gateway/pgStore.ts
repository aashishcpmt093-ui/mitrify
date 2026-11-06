import type { Pool } from "pg";
import type {
  AuditEvent,
  CatalogSnapshot,
  ClientRecord,
  CustomerRecord,
  GatewayStore,
  LedgerEntry,
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

-- API portal customers (added after the first gateway version; all statements are safe to repeat).
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

-- Automatic model choice (added later; safe to repeat).
ALTER TABLE gateway_prices ADD COLUMN IF NOT EXISTS auto boolean NOT NULL DEFAULT false;
ALTER TABLE gateway_prices ADD COLUMN IF NOT EXISTS chat_capable boolean;
ALTER TABLE gateway_prices ADD COLUMN IF NOT EXISTS blocked boolean NOT NULL DEFAULT false;
`;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
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
    customerId: r.customer_id ?? null,
  };
}

function customer(r: any): CustomerRecord {
  return {
    id: r.id,
    email: r.email,
    name: r.name,
    passwordHash: r.password_hash,
    balanceUsd: Number(r.balance_usd),
    createdAt: new Date(r.created_at),
    disabledAt: d(r.disabled_at),
  };
}

function ledger(r: any): LedgerEntry {
  return {
    id: Number(r.id),
    customerId: r.customer_id,
    kind: r.kind,
    amountUsd: Number(r.amount_usd),
    balanceAfterUsd: Number(r.balance_after_usd),
    ref: r.ref,
    note: r.note,
    createdAt: new Date(r.created_at),
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
    billedCostUsd: f(r.billed_cost_usd),
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
    auto: r.auto === true,
    chatCapable: r.chat_capable === null || r.chat_capable === undefined ? null : r.chat_capable === true,
    blocked: r.blocked === true,
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
      `INSERT INTO gateway_clients (id, name, key_hash, key_prefix, scopes, daily_budget_usd, rpm, created_at, expires_at, revoked_at, rotated_from, customer_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [c.id, c.name, c.keyHash, c.keyPrefix, c.scopes, c.dailyBudgetUsd, c.rpm, c.createdAt, c.expiresAt, c.revokedAt, c.rotatedFrom, c.customerId],
    );
  }
  async findClientByHash(hash: string) {
    const r = await this.pool.query("SELECT * FROM gateway_clients WHERE key_hash = $1", [hash]);
    return r.rows[0] ? client(r.rows[0]) : null;
  }
  async getClient(id: string) {
    if (!UUID.test(id)) return null;
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

  async listClientsForCustomer(customerId: string) {
    if (!UUID.test(customerId)) return [];
    const r = await this.pool.query("SELECT * FROM gateway_clients WHERE customer_id = $1 ORDER BY created_at DESC", [customerId]);
    return r.rows.map(client);
  }

  async createCustomer(c: CustomerRecord) {
    const r = await this.pool.query(
      `INSERT INTO gateway_customers (id, email, name, password_hash, balance_usd, created_at, disabled_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (email) DO NOTHING`,
      [c.id, c.email, c.name, c.passwordHash, c.balanceUsd, c.createdAt, c.disabledAt],
    );
    return (r.rowCount ?? 0) > 0;
  }
  async getCustomer(id: string) {
    if (!UUID.test(id)) return null;
    const r = await this.pool.query("SELECT * FROM gateway_customers WHERE id = $1", [id]);
    return r.rows[0] ? customer(r.rows[0]) : null;
  }
  async getCustomerByEmail(email: string) {
    const r = await this.pool.query("SELECT * FROM gateway_customers WHERE email = $1", [email]);
    return r.rows[0] ? customer(r.rows[0]) : null;
  }
  async listCustomers() {
    const r = await this.pool.query("SELECT * FROM gateway_customers ORDER BY created_at DESC");
    return r.rows.map(customer);
  }
  async updateCustomer(id: string, patch: Partial<Pick<CustomerRecord, "name" | "passwordHash" | "disabledAt">>) {
    const cols: Record<string, string> = { name: "name", passwordHash: "password_hash", disabledAt: "disabled_at" };
    const sets: string[] = [];
    const vals: unknown[] = [];
    for (const [k, v] of Object.entries(patch)) {
      if (!cols[k]) continue;
      vals.push(v);
      sets.push(`${cols[k]} = $${vals.length}`);
    }
    if (!sets.length || !UUID.test(id)) return;
    vals.push(id);
    await this.pool.query(`UPDATE gateway_customers SET ${sets.join(", ")} WHERE id = $${vals.length}`, vals);
  }
  async deleteCustomer(id: string) {
    if (!UUID.test(id)) return false;
    const r = await this.pool.query("DELETE FROM gateway_customers WHERE id = $1", [id]);
    return (r.rowCount ?? 0) > 0;
  }
  async adjustBalance(customerId: string, deltaUsd: number, kind: LedgerEntry["kind"], ref: string, note: string) {
    if (!UUID.test(customerId)) return null;
    const db = await this.pool.connect();
    try {
      await db.query("BEGIN");
      const u = await db.query("UPDATE gateway_customers SET balance_usd = balance_usd + $2 WHERE id = $1 RETURNING balance_usd", [customerId, deltaUsd]);
      if (!u.rows[0]) {
        await db.query("ROLLBACK");
        return null;
      }
      const after = Number(u.rows[0].balance_usd);
      await db.query(
        "INSERT INTO gateway_ledger (customer_id, kind, amount_usd, balance_after_usd, ref, note) VALUES ($1,$2,$3,$4,$5,$6)",
        [customerId, kind, Math.abs(deltaUsd), after, ref, note],
      );
      await db.query("COMMIT");
      return after;
    } catch (e) {
      await db.query("ROLLBACK").catch(() => {});
      throw e;
    } finally {
      db.release();
    }
  }
  async listLedger(customerId: string, limit: number) {
    if (!UUID.test(customerId)) return [];
    const r = await this.pool.query("SELECT * FROM gateway_ledger WHERE customer_id = $1 ORDER BY id DESC LIMIT $2", [customerId, limit]);
    return r.rows.map(ledger);
  }
  async listUsageForClients(clientIds: string[], since: Date, limit: number) {
    const ids = clientIds.filter((x) => UUID.test(x));
    if (!ids.length) return [];
    const r = await this.pool.query(
      "SELECT * FROM gateway_usage WHERE client_id = ANY($1::uuid[]) AND created_at >= $2 ORDER BY created_at DESC LIMIT $3",
      [ids, since, limit],
    );
    return r.rows.map(usage);
  }

  async insertUsage(u: UsageRow) {
    await this.pool.query(
      `INSERT INTO gateway_usage (request_id, client_id, provider, model, requested_model, mode, http_status, outcome,
         input_tokens, output_tokens, cached_tokens, usage_source, estimated_cost_usd, reconciled_cost_usd, currency,
         billing_status, latency_ms, first_byte_ms, attempts, created_at, billed_cost_usd)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`,
      [
        u.requestId, u.clientId, u.provider, u.model, u.requestedModel, u.mode, u.httpStatus, u.outcome,
        u.inputTokens, u.outputTokens, u.cachedTokens, u.usageSource, u.estimatedCostUsd, u.reconciledCostUsd, u.currency,
        u.billingStatus, u.latencyMs, u.firstByteMs, u.attempts, u.createdAt, u.billedCostUsd,
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
         currency, source_url, verified_at, context_length, supports_streaming, supports_tools, quality_passed, enabled, updated_at,
         auto, chat_capable, blocked)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       ON CONFLICT (provider, upstream_model) DO UPDATE SET
         input_per_mtok_usd = EXCLUDED.input_per_mtok_usd, output_per_mtok_usd = EXCLUDED.output_per_mtok_usd,
         cached_input_per_mtok_usd = EXCLUDED.cached_input_per_mtok_usd, currency = EXCLUDED.currency,
         source_url = EXCLUDED.source_url, verified_at = EXCLUDED.verified_at, context_length = EXCLUDED.context_length,
         supports_streaming = EXCLUDED.supports_streaming, supports_tools = EXCLUDED.supports_tools,
         quality_passed = EXCLUDED.quality_passed, enabled = EXCLUDED.enabled, updated_at = EXCLUDED.updated_at,
         auto = EXCLUDED.auto, chat_capable = EXCLUDED.chat_capable, blocked = EXCLUDED.blocked`,
      [
        p.provider, p.upstreamModel, p.inputPerMTokUsd, p.outputPerMTokUsd, p.cachedInputPerMTokUsd, p.currency, p.sourceUrl,
        p.verifiedAt, p.contextLength, p.supportsStreaming, p.supportsTools, p.qualityPassed, p.enabled, p.updatedAt,
        p.auto, p.chatCapable, p.blocked,
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
