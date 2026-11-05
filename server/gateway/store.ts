// Storage for the gateway: client keys (hashes only), usage ledger, prices, catalog snapshots,
// switches and the audit log. Prompts and responses are never stored.

export interface ClientRecord {
  id: string;
  name: string;
  /** sha256 of the full key. The key itself is shown once at creation and never stored. */
  keyHash: string;
  /** First characters of the key, enough to recognise it in a list. */
  keyPrefix: string;
  scopes: string[];
  dailyBudgetUsd: number | null;
  rpm: number;
  createdAt: Date;
  expiresAt: Date | null;
  revokedAt: Date | null;
  rotatedFrom: string | null;
  lastUsedAt: Date | null;
}

export type BillingStatus = "estimated" | "unknown" | "reconciled";

export interface UsageRow {
  requestId: string;
  clientId: string;
  provider: string;
  model: string;
  requestedModel: string;
  mode: "pinned" | "auto-cheap";
  httpStatus: number;
  /** completed | upstream_error | failed_midstream | cancelled | ended_without_done | rejected */
  outcome: string;
  inputTokens: number | null;
  outputTokens: number | null;
  cachedTokens: number | null;
  usageSource: "upstream" | "missing";
  estimatedCostUsd: number | null;
  reconciledCostUsd: number | null;
  currency: "USD";
  billingStatus: BillingStatus;
  latencyMs: number;
  firstByteMs: number | null;
  attempts: number;
  createdAt: Date;
}

export interface PriceEntry {
  provider: string;
  /** The model id exactly as the provider expects it in the request body. */
  upstreamModel: string;
  inputPerMTokUsd: number;
  outputPerMTokUsd: number;
  cachedInputPerMTokUsd: number | null;
  currency: "USD";
  /** Official page or API the price was read from. */
  sourceUrl: string;
  verifiedAt: Date;
  contextLength: number | null;
  supportsStreaming: boolean;
  supportsTools: boolean;
  /** Set by the owner after the model passed the chat quality check. */
  qualityPassed: boolean;
  enabled: boolean;
  updatedAt: Date;
}

export interface SnapshotEntry {
  provider: string;
  upstreamModel: string;
  blendedPerMTokUsd: number;
  inputPerMTokUsd: number;
  outputPerMTokUsd: number;
  cachedInputPerMTokUsd: number | null;
  supportsStreaming: boolean;
  contextLength: number | null;
}

export interface CatalogSnapshot {
  id: number;
  createdAt: Date;
  weights: { input: number; output: number; source: "observed" | "default" };
  entries: SnapshotEntry[];
  excluded: { provider: string; upstreamModel: string; reason: string }[];
}

export interface AuditEvent {
  at: Date;
  actor: string;
  action: string;
  ip: string | null;
  detail: Record<string, unknown>;
}

export interface GatewayStore {
  init(): Promise<void>;
  createClient(c: ClientRecord): Promise<void>;
  findClientByHash(hash: string): Promise<ClientRecord | null>;
  getClient(id: string): Promise<ClientRecord | null>;
  listClients(): Promise<ClientRecord[]>;
  updateClient(id: string, patch: Partial<ClientRecord>): Promise<void>;

  insertUsage(row: UsageRow): Promise<void>;
  /** Sum of known costs (reconciled when present, otherwise estimated) since the given time. */
  spentSince(since: Date, clientId?: string): Promise<number>;
  tokenTotalsSince(since: Date): Promise<{ input: number; output: number }>;
  listUsage(since: Date, limit: number): Promise<UsageRow[]>;
  reconcileUsage(requestId: string, costUsd: number): Promise<boolean>;

  upsertPrice(p: PriceEntry): Promise<void>;
  listPrices(): Promise<PriceEntry[]>;
  saveSnapshot(s: Omit<CatalogSnapshot, "id">): Promise<CatalogSnapshot>;
  latestSnapshot(): Promise<CatalogSnapshot | null>;

  getSetting<T>(key: string): Promise<T | null>;
  setSetting(key: string, value: unknown): Promise<void>;

  insertAudit(e: AuditEvent): Promise<void>;
  listAudit(limit: number): Promise<AuditEvent[]>;
}

const cost = (r: UsageRow) => r.reconciledCostUsd ?? r.estimatedCostUsd ?? 0;

/** In-memory store, used by the tests and as a fallback shape reference. */
export class MemoryStore implements GatewayStore {
  clients = new Map<string, ClientRecord>();
  usage: UsageRow[] = [];
  prices = new Map<string, PriceEntry>();
  snapshots: CatalogSnapshot[] = [];
  settings = new Map<string, unknown>();
  audit: AuditEvent[] = [];

  async init() {}
  async createClient(c: ClientRecord) {
    this.clients.set(c.id, { ...c });
  }
  async findClientByHash(hash: string) {
    for (const c of this.clients.values()) if (c.keyHash === hash) return { ...c };
    return null;
  }
  async getClient(id: string) {
    const c = this.clients.get(id);
    return c ? { ...c } : null;
  }
  async listClients() {
    return [...this.clients.values()].map((c) => ({ ...c }));
  }
  async updateClient(id: string, patch: Partial<ClientRecord>) {
    const c = this.clients.get(id);
    if (c) this.clients.set(id, { ...c, ...patch });
  }
  async insertUsage(row: UsageRow) {
    this.usage.push({ ...row });
  }
  async spentSince(since: Date, clientId?: string) {
    return this.usage
      .filter((r) => r.createdAt >= since && (!clientId || r.clientId === clientId))
      .reduce((s, r) => s + cost(r), 0);
  }
  async tokenTotalsSince(since: Date) {
    let input = 0;
    let output = 0;
    for (const r of this.usage) {
      if (r.createdAt < since) continue;
      input += r.inputTokens ?? 0;
      output += r.outputTokens ?? 0;
    }
    return { input, output };
  }
  async listUsage(since: Date, limit: number) {
    return this.usage.filter((r) => r.createdAt >= since).slice(-limit).reverse();
  }
  async reconcileUsage(requestId: string, costUsd: number) {
    const r = this.usage.find((u) => u.requestId === requestId);
    if (!r) return false;
    r.reconciledCostUsd = costUsd;
    r.billingStatus = "reconciled";
    return true;
  }
  async upsertPrice(p: PriceEntry) {
    this.prices.set(`${p.provider}\u0000${p.upstreamModel}`, { ...p });
  }
  async listPrices() {
    return [...this.prices.values()].map((p) => ({ ...p }));
  }
  async saveSnapshot(s: Omit<CatalogSnapshot, "id">) {
    const snap = { ...s, id: this.snapshots.length + 1 };
    this.snapshots.push(snap);
    return snap;
  }
  async latestSnapshot() {
    return this.snapshots[this.snapshots.length - 1] ?? null;
  }
  async getSetting<T>(key: string) {
    return (this.settings.has(key) ? this.settings.get(key) : null) as T | null;
  }
  async setSetting(key: string, value: unknown) {
    this.settings.set(key, value);
  }
  async insertAudit(e: AuditEvent) {
    this.audit.push(e);
  }
  async listAudit(limit: number) {
    return this.audit.slice(-limit).reverse();
  }
}
