import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import pg from "pg";
import { PgStore } from "../pgStore";
import type { ClientRecord, UsageRow } from "../store";

// Runs only when GATEWAY_TEST_DATABASE_URL points at a throwaway database, e.g.
//   GATEWAY_TEST_DATABASE_URL=postgres://test@127.0.0.1:5433/gw npm run test:gateway
// Never point it at the production database.
const url = process.env.GATEWAY_TEST_DATABASE_URL;

describe("PgStore", { skip: !url && "set GATEWAY_TEST_DATABASE_URL to run" }, () => {
  let pool: pg.Pool;
  let store: PgStore;

  before(async () => {
    pool = new pg.Pool({ connectionString: url });
    store = new PgStore(pool);
    await store.init();
    await store.init(); // idempotent
    await pool.query("TRUNCATE gateway_clients, gateway_usage, gateway_prices, gateway_price_snapshots, gateway_settings, gateway_audit");
  });
  after(async () => pool?.end());

  it("stores clients by hash and updates only allowed columns", async () => {
    const c: ClientRecord = {
      id: "6f1c3b9e-1d2a-4c3b-9a8e-123456789abc",
      name: "nb",
      keyHash: "a".repeat(64),
      keyPrefix: "mtf_live_abc",
      scopes: ["chat:write"],
      dailyBudgetUsd: 1.5,
      rpm: 60,
      createdAt: new Date(),
      expiresAt: null,
      revokedAt: null,
      rotatedFrom: null,
      lastUsedAt: null,
    };
    await store.createClient(c);
    assert.equal((await store.findClientByHash("a".repeat(64)))!.dailyBudgetUsd, 1.5);
    await store.updateClient(c.id, { revokedAt: new Date(), keyHash: "b".repeat(64) } as Partial<ClientRecord>);
    const got = await store.getClient(c.id);
    assert.ok(got!.revokedAt);
    assert.equal(got!.keyHash, "a".repeat(64), "the key hash can never be changed by an update");
    assert.equal(await store.getClient("'; drop table x; --"), null);
  });

  it("keeps estimated and reconciled cost apart and sums the known cost", async () => {
    const base: UsageRow = {
      requestId: "r1", clientId: "6f1c3b9e-1d2a-4c3b-9a8e-123456789abc", provider: "surplus", model: "m", requestedModel: "m",
      mode: "pinned", httpStatus: 200, outcome: "completed", inputTokens: 10, outputTokens: 20, cachedTokens: 0,
      usageSource: "upstream", estimatedCostUsd: 0.25, reconciledCostUsd: null, currency: "USD", billingStatus: "estimated",
      latencyMs: 5, firstByteMs: 2, attempts: 1, createdAt: new Date(),
    };
    await store.insertUsage(base);
    await store.insertUsage({ ...base, requestId: "r2", estimatedCostUsd: null, billingStatus: "unknown", inputTokens: null, outputTokens: null });
    assert.equal(await store.spentSince(new Date(Date.now() - 60_000)), 0.25);
    assert.ok(await store.reconcileUsage("r1", 0.3));
    assert.equal(await store.spentSince(new Date(Date.now() - 60_000), base.clientId), 0.3);
    const rows = await store.listUsage(new Date(0), 10);
    const r1 = rows.find((r) => r.requestId === "r1")!;
    assert.equal(r1.estimatedCostUsd, 0.25);
    assert.equal(r1.reconciledCostUsd, 0.3);
    assert.deepEqual(await store.tokenTotalsSince(new Date(0)), { input: 10, output: 20 });
  });

  it("prices, snapshots, settings and audit round-trip", async () => {
    const now = new Date();
    const p = {
      provider: "surplus", upstreamModel: "m", inputPerMTokUsd: 0.1, outputPerMTokUsd: 0.2, cachedInputPerMTokUsd: 0.01,
      currency: "USD" as const, sourceUrl: "https://x", verifiedAt: now, contextLength: 1000, supportsStreaming: true,
      supportsTools: false, qualityPassed: true, enabled: true, updatedAt: now,
    };
    await store.upsertPrice(p);
    await store.upsertPrice({ ...p, outputPerMTokUsd: 0.3 });
    const prices = await store.listPrices();
    assert.equal(prices.length, 1);
    assert.equal(prices[0].outputPerMTokUsd, 0.3);
    const s = await store.saveSnapshot({ createdAt: now, weights: { input: 0.5, output: 0.5, source: "default" }, entries: [], excluded: [] });
    assert.equal((await store.latestSnapshot())!.id, s.id);
    await store.setSetting("kill.global", true);
    assert.equal(await store.getSetting<boolean>("kill.global"), true);
    await store.setSetting("kill.global", false);
    assert.equal(await store.getSetting<boolean>("kill.global"), false);
    await store.insertAudit({ at: now, actor: "owner", action: "x", ip: "1.1.1.1", detail: { a: 1 } });
    assert.equal((await store.listAudit(5))[0].action, "x");
  });
});
