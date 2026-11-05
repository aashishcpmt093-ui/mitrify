import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import express from "express";
import { createServer } from "http";
import { loadConfig } from "../config";
import { createGatewayMiddleware } from "../index";
import { MemoryStore } from "../store";
import { signToken } from "../token";
import { UPSTREAM_KEY, UPSTREAM_KEY_B, admin, baseEnv, chat, listen, mockUpstream, price, sleep, startGateway } from "./helpers";

const SECRET = "portal-secret-0123456789-abcdefghijklmnopqrstuv";
const USAGE = '{"choices":[{"message":{"content":"ok"},"finish_reason":"stop"}],"usage":{"prompt_tokens":1000,"completion_tokens":1000}}';
// 1000 input at $1/M + 1000 output at $2/M
const COST = 0.003;

const portal = (url: string, path: string, init: { token?: string; method?: string; body?: unknown } = {}) =>
  fetch(url + "/portal-api" + path, {
    method: init.method ?? (init.body === undefined ? "GET" : "POST"),
    headers: { "content-type": "application/json", ...(init.token ? { authorization: `Bearer ${init.token}` } : {}) },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });

async function newCustomer(url: string, email: string, extra: Record<string, unknown> = {}) {
  const r = await admin(url, "/admin/customers", { body: { email, name: email.split("@")[0], ...extra } });
  assert.equal(r.status, 201, await r.clone().text());
  return (await r.json()) as { customer: { id: string; email: string }; password?: string };
}
async function login(url: string, email: string, password: string) {
  const r = await portal(url, "/login", { body: { email, password } });
  assert.equal(r.status, 200, await r.clone().text());
  return ((await r.json()) as { token: string }).token;
}
async function customerKey(url: string, token: string, name = "app") {
  const r = await portal(url, "/keys", { token, body: { name } });
  assert.equal(r.status, 201, await r.clone().text());
  return (await r.json()) as { id: string; key: string };
}

describe("API portal", () => {
  let resale: Awaited<ReturnType<typeof mockUpstream>>;
  let own: Awaited<ReturnType<typeof mockUpstream>>;
  let g: Awaited<ReturnType<typeof startGateway>>;
  let ownerKey: string;

  before(async () => {
    resale = await mockUpstream((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(USAGE);
    });
    own = await mockUpstream((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(USAGE);
    });
    g = await startGateway(
      baseEnv({
        MITRIFY_PORTAL_SECRET: SECRET,
        MITRIFY_SURPLUS_API_KEY: UPSTREAM_KEY,
        MITRIFY_SURPLUS_BASE_URL: resale.url,
        MITRIFY_SURPLUS_APPROVED: "1",
        MITRIFY_SURPLUS_RESALE_APPROVED: "1",
        MITRIFY_DEEPINFRA_API_KEY: UPSTREAM_KEY_B,
        MITRIFY_DEEPINFRA_BASE_URL: own.url,
        MITRIFY_DEEPINFRA_APPROVED: "1", // allowed for the owner's own use, NOT approved for resale
      }),
    );
    await admin(g.url, "/admin/prices", {
      method: "PUT",
      body: [price("surplus", "resale-model", 1, 2), price("deepinfra", "own-only-model", 0.1, 0.1)],
    });
    await admin(g.url, "/admin/catalog/refresh", { body: {} });
    ownerKey = ((await (await admin(g.url, "/admin/keys", { body: { name: "owner-key" } })).json()) as { key: string }).key;
  });
  after(async () => {
    await g.close();
    await resale.close();
    await own.close();
  });

  it("only the owner can create accounts; bad input and duplicates are refused", async () => {
    const r = await fetch(g.url + "/admin/customers", { method: "POST", headers: { "content-type": "application/json" }, body: '{"email":"a@x.io","name":"A"}' });
    assert.equal(r.status, 401);
    assert.equal(g.store.customers.size, 0);
    assert.equal((await admin(g.url, "/admin/customers", { body: { email: "not-an-email", name: "A" } })).status, 400);
    assert.equal((await admin(g.url, "/admin/customers", { body: { email: "a@x.io", name: "A", password: "short" } })).status, 400);
    const c = await newCustomer(g.url, "Dup@Example.com");
    assert.ok(c.password && c.password.length >= 16, "a password is generated and shown once");
    assert.equal((await admin(g.url, "/admin/customers", { body: { email: "dup@example.com", name: "again" } })).status, 409);
    const stored = [...g.store.customers.values()][0];
    assert.ok(!JSON.stringify(stored).includes(c.password!), "the password is stored only as a hash");
    assert.equal(stored.email, "dup@example.com");
  });

  it("customer signs in, creates a key, and is charged exactly the listed price (0% markup)", async () => {
    const { customer, password } = await newCustomer(g.url, "billing@example.com");
    assert.equal((await portal(g.url, "/login", { body: { email: "billing@example.com", password: "wrong-password" } })).status, 401);
    const token = await login(g.url, "billing@example.com", password!);
    const me = await (await portal(g.url, "/me", { token })).json();
    assert.equal(me.balanceUsd, 0);
    assert.equal(me.markupPercent, 0);
    const key = await customerKey(g.url, token);

    // No credit yet: refused before anything reaches the provider.
    resale.seen.length = 0;
    const refused = await chat(g.url, key.key, '{"model":"resale-model","messages":[]}');
    assert.equal(refused.status, 402);
    assert.equal(resale.seen.length, 0);

    assert.equal((await admin(g.url, `/admin/customers/${customer.id}/credit`, { body: { amountUsd: 1, note: "first top-up" } })).status, 200);
    const ok = await chat(g.url, key.key, '{"model":"resale-model","messages":[]}');
    assert.equal(ok.status, 200);
    await ok.text();
    await sleep(30);
    const after = await (await portal(g.url, "/me", { token })).json();
    assert.equal(after.balanceUsd, 1 - COST);
    const ledger = await (await admin(g.url, `/admin/customers/${customer.id}/ledger`)).json();
    assert.deepEqual(ledger.entries.map((e: { kind: string }) => e.kind), ["debit", "credit"]);
    assert.equal(ledger.entries[0].amountUsd, COST);
    assert.match(ledger.entries[0].ref, /^[0-9a-f-]{36}$/, "the debit points at the request id");
    const usage = await (await portal(g.url, "/usage", { token })).json();
    assert.equal(usage.rows[0].chargedUsd, COST);
    assert.equal(usage.chargedUsd, COST);
    assert.equal(usage.rows[0].model, "resale-model");
    // The provider key is never shown to a customer anywhere.
    for (const t of [JSON.stringify(me), JSON.stringify(usage), JSON.stringify(await (await portal(g.url, "/keys", { token })).json())]) {
      assert.ok(!t.includes(UPSTREAM_KEY) && !t.includes(UPSTREAM_KEY_B) && !t.includes("keyHash"));
    }
  });

  it("a request whose cost is unknown is not charged", async () => {
    const { customer, password } = await newCustomer(g.url, "unknown@example.com");
    await admin(g.url, `/admin/customers/${customer.id}/credit`, { body: { amountUsd: 1 } });
    const token = await login(g.url, "unknown@example.com", password!);
    const key = await customerKey(g.url, token);
    g.gw.breakers.get("surplus")!.success();
    resale.state.behaviour = (_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end('{"choices":[]}'); // no usage reported
    };
    assert.equal((await chat(g.url, key.key, '{"model":"resale-model","messages":[]}')).status, 200);
    await sleep(30);
    assert.equal((await g.store.getCustomer(customer.id))!.balanceUsd, 1);
    const row = g.store.usage.at(-1)!;
    assert.equal(row.billedCostUsd, null);
    assert.equal(row.billingStatus, "unknown");
    resale.state.behaviour = (_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(USAGE);
    };
  });

  it("customers are only routed to providers approved for resale", async () => {
    const { customer, password } = await newCustomer(g.url, "routing@example.com");
    await admin(g.url, `/admin/customers/${customer.id}/credit`, { body: { amountUsd: 1 } });
    const token = await login(g.url, "routing@example.com", password!);
    const key = await customerKey(g.url, token);
    own.seen.length = 0;
    resale.seen.length = 0;

    // The model that exists only at the non-resale provider is invisible and unusable for the customer.
    assert.equal((await chat(g.url, key.key, '{"model":"own-only-model","messages":[]}')).status, 404);
    const models = (await (await fetch(g.url + "/v1/models", { headers: { authorization: `Bearer ${key.key}` } })).json()).data.map((m: { id: string }) => m.id);
    assert.ok(models.includes("resale-model") && !models.includes("own-only-model"));

    // Auto-cheap: for the customer the cheaper non-resale model is skipped.
    const viaCustomer = await chat(g.url, key.key, '{"model":"mitrify/auto-cheap","messages":[]}');
    assert.equal(viaCustomer.headers.get("x-mitrify-provider"), "surplus");
    await viaCustomer.text();
    assert.equal(own.seen.length, 0);

    // The owner's own key still gets the cheapest model.
    const viaOwner = await chat(g.url, ownerKey, '{"model":"mitrify/auto-cheap","messages":[]}');
    assert.equal(viaOwner.headers.get("x-mitrify-provider"), "deepinfra");
    await viaOwner.text();
    assert.equal(own.seen.length, 1);
  });

  it("customers cannot see or change each other's keys, and tokens cannot be forged", async () => {
    const a = await newCustomer(g.url, "alice@example.com");
    const b = await newCustomer(g.url, "bob@example.com");
    const ta = await login(g.url, "alice@example.com", a.password!);
    const tb = await login(g.url, "bob@example.com", b.password!);
    const keyA = await customerKey(g.url, ta, "alice-key");
    const keysB = (await (await portal(g.url, "/keys", { token: tb })).json()).keys;
    assert.deepEqual(keysB, []);
    assert.equal((await portal(g.url, `/keys/${keyA.id}/revoke`, { token: tb, method: "POST", body: {} })).status, 404);
    assert.equal((await g.store.getClient(keyA.id))!.revokedAt, null, "bob's attempt changed nothing");
    assert.equal((await portal(g.url, `/keys/${keyA.id}/revoke`, { token: ta, method: "POST", body: {} })).status, 200);
    assert.equal((await chat(g.url, keyA.key, '{"model":"resale-model"}')).status, 401);

    assert.equal((await portal(g.url, "/me")).status, 401);
    assert.equal((await portal(g.url, "/me", { token: "garbage" })).status, 401);
    const [body, sig] = ta.split(".");
    const forged = Buffer.from(JSON.stringify({ sub: b.customer.id, exp: 9999999999, typ: "portal" })).toString("base64url");
    assert.equal((await portal(g.url, "/me", { token: `${forged}.${sig}` })).status, 401, "a changed payload breaks the signature");
    assert.equal((await portal(g.url, "/me", { token: signToken(a.customer.id, "a-different-secret-0123456789-abcdefghijklmnop", 3600) })).status, 401);
    assert.equal((await portal(g.url, "/me", { token: signToken(a.customer.id, SECRET, -10) })).status, 401, "expired");
    assert.equal((await portal(g.url, "/me", { token: `${body}.` })).status, 401);
    // The owner's setup code is not accepted as a customer token and a customer token opens no admin page.
    assert.equal((await fetch(g.url + "/admin/customers", { headers: { "x-mitrify-setup-code": "x".repeat(40) } })).status, 401);
    assert.equal((await fetch(g.url + "/admin/customers", { headers: { authorization: `Bearer ${ta}` } })).status, 401);
  });

  it("a switched-off customer loses sign-in, the old token and every key at once", async () => {
    const c = await newCustomer(g.url, "off@example.com");
    await admin(g.url, `/admin/customers/${c.customer.id}/credit`, { body: { amountUsd: 1 } });
    const token = await login(g.url, "off@example.com", c.password!);
    const key = await customerKey(g.url, token);
    assert.equal((await admin(g.url, `/admin/customers/${c.customer.id}/disable`, { body: { disabled: true } })).status, 200);
    assert.equal((await chat(g.url, key.key, '{"model":"resale-model"}')).status, 403);
    assert.equal((await portal(g.url, "/me", { token })).status, 401);
    assert.equal((await portal(g.url, "/login", { body: { email: "off@example.com", password: c.password } })).status, 401);
    await admin(g.url, `/admin/customers/${c.customer.id}/disable`, { body: { disabled: false } });
    assert.equal((await portal(g.url, "/me", { token })).status, 200);
  });

  it("wrong passwords lock that account out, even for the right password", async () => {
    const c = await newCustomer(g.url, "lock@example.com");
    for (let i = 0; i < 5; i++) assert.equal((await portal(g.url, "/login", { body: { email: "lock@example.com", password: "nope-" + i } })).status, 401);
    const r = await portal(g.url, "/login", { body: { email: "lock@example.com", password: c.password } });
    assert.equal(r.status, 429);
    assert.ok(r.headers.get("retry-after"));
  });

  it("limits keys per customer and lets them change their password", async () => {
    const c = await newCustomer(g.url, "keys@example.com");
    const token = await login(g.url, "keys@example.com", c.password!);
    for (let i = 0; i < 5; i++) await customerKey(g.url, token, "k" + i);
    assert.equal((await portal(g.url, "/keys", { token, body: { name: "sixth" } })).status, 409);
    assert.equal((await portal(g.url, "/keys", { token, body: { name: "" } })).status, 400);
    assert.equal((await portal(g.url, "/password", { token, body: { current: "wrong-current", next: "a-new-long-password" } })).status, 401);
    assert.equal((await portal(g.url, "/password", { token, body: { current: c.password, next: "short" } })).status, 400);
    assert.equal((await portal(g.url, "/password", { token, body: { current: c.password, next: "a-new-long-password" } })).status, 200);
    assert.equal((await portal(g.url, "/login", { body: { email: "keys@example.com", password: c.password } })).status, 401);
    await login(g.url, "keys@example.com", "a-new-long-password");
  });

  it("deleting a customer needs the typed email, stops every key, frees the email, and keeps the credit history", async () => {
    const c = await newCustomer(g.url, "delete-me@example.com");
    await admin(g.url, `/admin/customers/${c.customer.id}/credit`, { body: { amountUsd: 2, note: "test" } });
    const token = await login(g.url, "delete-me@example.com", c.password!);
    const key = await customerKey(g.url, token);

    // Without the right email nothing happens.
    assert.equal((await admin(g.url, `/admin/customers/${c.customer.id}/delete`, { body: {} })).status, 400);
    assert.equal((await admin(g.url, `/admin/customers/${c.customer.id}/delete`, { body: { confirmEmail: "someone-else@example.com" } })).status, 400);
    assert.ok(await g.store.getCustomer(c.customer.id), "still there");
    assert.equal((await chat(g.url, key.key, '{"model":"resale-model"}')).status, 200);

    // Only the owner can do it.
    const noCode = await fetch(g.url + `/admin/customers/${c.customer.id}/delete`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirmEmail: "delete-me@example.com" }) });
    assert.equal(noCode.status, 401);

    const done = await admin(g.url, `/admin/customers/${c.customer.id}/delete`, { body: { confirmEmail: " Delete-Me@Example.com " } });
    assert.equal(done.status, 200);
    assert.equal((await done.json()).deleted, true);
    assert.equal(await g.store.getCustomer(c.customer.id), null);
    assert.equal((await chat(g.url, key.key, '{"model":"resale-model"}')).status, 401, "the key stops at once (it was revoked)");
    assert.equal((await portal(g.url, "/me", { token })).status, 401, "the old sign-in token stops");
    assert.equal((await portal(g.url, "/login", { body: { email: "delete-me@example.com", password: c.password } })).status, 401);
    assert.ok(g.store.ledger.some((l) => l.customerId === c.customer.id), "the credit history stays");
    assert.ok(g.store.audit.some((a) => a.action === "customer_deleted"));
    assert.equal((await admin(g.url, `/admin/customers/${c.customer.id}/delete`, { body: { confirmEmail: "delete-me@example.com" } })).status, 404);

    // The email can be used again, as a brand-new account with no credit.
    const again = await newCustomer(g.url, "delete-me@example.com");
    assert.notEqual(again.customer.id, c.customer.id);
    assert.equal((await g.store.getCustomer(again.customer.id))!.balanceUsd, 0);
  });

  it("owner credit and adjustment are validated and audited", async () => {
    const c = await newCustomer(g.url, "credit@example.com");
    for (const amountUsd of [0, -5, "5", NaN, 1e9]) {
      assert.equal((await admin(g.url, `/admin/customers/${c.customer.id}/credit`, { body: { amountUsd } })).status, 400, String(amountUsd));
    }
    assert.equal((await admin(g.url, `/admin/customers/${c.customer.id}/credit`, { body: { amountUsd: 5 } })).status, 200);
    const adj = await admin(g.url, `/admin/customers/${c.customer.id}/adjust`, { body: { amountUsd: -2, note: "refund error" } });
    assert.equal((await adj.json()).balanceUsd, 3);
    assert.equal((await admin(g.url, "/admin/customers/not-a-uuid/credit", { body: { amountUsd: 1 } })).status, 404);
    assert.ok(g.store.audit.some((a) => a.action === "customer_credited"));
    assert.ok(!JSON.stringify(g.store.audit).includes(c.password!), "no password in the audit log");
  });
});

describe("API portal markup and switches", () => {
  it("adds the explicit markup, and only that", async () => {
    const up = await mockUpstream((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(USAGE);
    });
    const g = await startGateway(
      baseEnv({
        MITRIFY_PORTAL_SECRET: SECRET,
        MITRIFY_RESALE_MARKUP_PERCENT: "50",
        MITRIFY_SURPLUS_API_KEY: UPSTREAM_KEY,
        MITRIFY_SURPLUS_BASE_URL: up.url,
        MITRIFY_SURPLUS_APPROVED: "1",
        MITRIFY_SURPLUS_RESALE_APPROVED: "1",
      }),
    );
    await admin(g.url, "/admin/prices", { method: "PUT", body: [price("surplus", "m", 1, 2)] });
    const c = await newCustomer(g.url, "markup@example.com");
    await admin(g.url, `/admin/customers/${c.customer.id}/credit`, { body: { amountUsd: 1 } });
    const key = await customerKey(g.url, await login(g.url, "markup@example.com", c.password!));
    await (await chat(g.url, key.key, '{"model":"m"}')).text();
    await sleep(30);
    assert.equal((await g.store.getCustomer(c.customer.id))!.balanceUsd, 1 - COST * 1.5);
    assert.equal(g.store.usage.at(-1)!.estimatedCostUsd, COST, "the provider's cost stays recorded separately");
    await g.close();
    await up.close();
  });

  it("without MITRIFY_PORTAL_SECRET the accounts are off", async () => {
    const g = await startGateway(baseEnv());
    const r = await portal(g.url, "/login", { body: { email: "a@b.io", password: "x" } });
    assert.equal(r.status, 503);
    assert.equal((await r.json()).error.type, "portal_disabled");
    await g.close();
  });

  it("a short MITRIFY_PORTAL_SECRET is refused", () => {
    assert.equal(loadConfig({ MITRIFY_PORTAL_SECRET: "short" }).portalSecret, null);
    assert.equal(loadConfig({ MITRIFY_PORTAL_SECRET: SECRET }).portalSecret, SECRET);
  });

  it("/portal-api is answered on the website's own host, so the portal page can reach it", async () => {
    const app = express();
    app.use(createGatewayMiddleware({ config: loadConfig(baseEnv({ MITRIFY_PORTAL_SECRET: SECRET })), store: new MemoryStore() }));
    app.get("/", (_req, res) => res.send("marketplace"));
    const server = createServer(app);
    const url = await listen(server);
    const r = await fetch(url + "/portal-api/me");
    assert.equal(r.status, 401);
    assert.equal((await r.json()).error.type, "not_signed_in");
    assert.equal(await (await fetch(url + "/")).text(), "marketplace");
    server.closeAllConnections();
    server.close();
  });
});
