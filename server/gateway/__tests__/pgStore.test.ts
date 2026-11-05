import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import pg from "pg";
import { PgStore } from "../pgStore";
import type { ClientRecord, CustomerRecord, UsageRow } from "../store";

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
    await pool.query("TRUNCATE gateway_clients, gateway_usage, gateway_prices, gateway_price_snapshots, gateway_settings, gateway_audit, gateway_customers, gateway_ledger");
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
      customerId: null,
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
      usageSource: "upstream", estimatedCostUsd: 0.25, reconciledCostUsd: null, billedCostUsd: null, currency: "USD", billingStatus: "estimated",
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

  it("customers: unique e-mail, atomic balance changes with a ledger, keys and usage by customer", async () => {
    const c: CustomerRecord = {
      id: "7a2d4c1e-2b3a-4d5c-8e9f-0123456789ab", email: "a@x.io", name: "A", passwordHash: "$2a$10$x", balanceUsd: 0,
      createdAt: new Date(), disabledAt: null,
    };
    assert.equal(await store.createCustomer(c), true);
    assert.equal(await store.createCustomer({ ...c, id: "8b3e5d2f-3c4b-4e6d-9fa0-123456789abc" }), false, "same e-mail twice");
    assert.equal((await store.getCustomerByEmail("a@x.io"))!.id, c.id);
    assert.equal(await store.getCustomer("'; drop table x; --"), null);

    assert.equal(await store.adjustBalance(c.id, 10, "credit", "", "top-up"), 10);
    // Fifty charges at the same moment must all be counted, none lost.
    await Promise.all(Array.from({ length: 50 }, (_, i) => store.adjustBalance(c.id, -0.01, "debit", "req-" + i, "")));
    assert.equal((await store.getCustomer(c.id))!.balanceUsd, 9.5);
    assert.equal((await store.listLedger(c.id, 100)).length, 51);
    assert.equal((await store.listLedger(c.id, 1))[0].kind, "debit");
    assert.equal(await store.adjustBalance("9c4f6e30-4d5c-4f7e-8ab1-23456789abcd", 1, "credit", "", ""), null);

    await store.updateCustomer(c.id, { disabledAt: new Date(), passwordHash: "new-hash" });
    const got = (await store.getCustomer(c.id))!;
    assert.ok(got.disabledAt);
    assert.equal(got.passwordHash, "new-hash");
    assert.equal(got.email, "a@x.io");

    const key: ClientRecord = {
      id: "1b2c3d4e-5f60-4718-8293-a4b5c6d7e8f9", name: "k", keyHash: "c".repeat(64), keyPrefix: "mtf_live_zzz", scopes: ["chat:write"],
      dailyBudgetUsd: null, rpm: 60, createdAt: new Date(), expiresAt: null, revokedAt: null, rotatedFrom: null, lastUsedAt: null, customerId: c.id,
    };
    await store.createClient(key);
    assert.deepEqual((await store.listClientsForCustomer(c.id)).map((k) => k.id), [key.id]);
    assert.deepEqual(await store.listClientsForCustomer("7a2d4c1e-2b3a-4d5c-8e9f-ffffffffffff"), []);
    const row: UsageRow = {
      requestId: "bill-1", clientId: key.id, provider: "p", model: "m", requestedModel: "m", mode: "pinned", httpStatus: 200,
      outcome: "completed", inputTokens: 1, outputTokens: 1, cachedTokens: 0, usageSource: "upstream", estimatedCostUsd: 0.002,
      reconciledCostUsd: null, billedCostUsd: 0.003, currency: "USD", billingStatus: "estimated", latencyMs: 1, firstByteMs: 1,
      attempts: 1, createdAt: new Date(),
    };
    await store.insertUsage(row);
    const rows = await store.listUsageForClients([key.id], new Date(0), 10);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].billedCostUsd, 0.003);
    assert.deepEqual(await store.listUsageForClients(["1b2c3d4e-5f60-4718-8293-ffffffffffff"], new Date(0), 10), []);
    assert.deepEqual(await store.listUsageForClients([], new Date(0), 10), []);

    // Deleting removes the account but keeps the ledger.
    assert.equal(await store.deleteCustomer(c.id), true);
    assert.equal(await store.getCustomer(c.id), null);
    assert.equal(await store.deleteCustomer(c.id), false);
    assert.equal(await store.deleteCustomer("'; drop table x; --"), false);
    assert.equal((await store.listLedger(c.id, 100)).length, 51);
    assert.equal(await store.createCustomer({ ...c, id: "8b3e5d2f-3c4b-4e6d-9fa0-123456789abc" }), true, "the e-mail is free again");
  });
});
