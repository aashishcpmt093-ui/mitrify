import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { SETUP_CODE, UPSTREAM_KEY, admin, baseEnv, mockUpstream, price, startGateway } from "./helpers";

const REPLY = '{"choices":[{"message":{"content":"Namaste from the model"},"finish_reason":"stop"}],"usage":{"prompt_tokens":1000,"completion_tokens":1000}}';

const tryIt = (url: string, body: string, code: string | null = SETUP_CODE) =>
  fetch(url + "/admin/try", {
    method: "POST",
    headers: { "content-type": "application/json", ...(code ? { "x-mitrify-setup-code": code } : {}) },
    body,
  });

describe("owner Try a message", () => {
  let up: Awaited<ReturnType<typeof mockUpstream>>;
  let g: Awaited<ReturnType<typeof startGateway>>;

  before(async () => {
    up = await mockUpstream((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(REPLY);
    });
    g = await startGateway(
      baseEnv({ MITRIFY_SURPLUS_API_KEY: UPSTREAM_KEY, MITRIFY_SURPLUS_BASE_URL: up.url, MITRIFY_SURPLUS_APPROVED: "1" }),
    );
    await admin(g.url, "/admin/prices", { method: "PUT", body: [price("surplus", "m", 1, 2)] });
    await admin(g.url, "/admin/catalog/refresh", { body: {} });
  });
  after(async () => {
    await g.close();
    await up.close();
  });

  it("sends a normal chat request through the real path and records usage and cost", async () => {
    up.seen.length = 0;
    const body = '{"model":"m","messages":[{"role":"user","content":"hello"}],"max_tokens":50}';
    const r = await tryIt(g.url, body);
    assert.equal(r.status, 200);
    assert.equal(await r.text(), REPLY, "the model's answer comes back unchanged");
    assert.equal(r.headers.get("x-mitrify-provider"), "surplus");
    assert.ok(up.seen[0].body.equals(Buffer.from(body)), "the request body is forwarded byte for byte");
    await new Promise((x) => setTimeout(x, 30));
    const row = g.store.usage.at(-1)!;
    assert.equal(row.estimatedCostUsd, 0.003);
    assert.equal(row.outcome, "completed");
    assert.equal(g.store.clients.size >= 1, true);
  });

  it("works for auto-cheap too, and reuses one test client", async () => {
    const r = await tryIt(g.url, '{"model":"mitrify/auto-cheap","messages":[]}');
    assert.equal(r.status, 200);
    await r.text();
    await tryIt(g.url, '{"model":"m","messages":[]}').then((x) => x.text());
    const testClients = [...g.store.clients.values()].filter((c) => c.name === "owner-test (page)");
    assert.equal(testClients.length, 1);
    assert.equal(testClients[0].customerId, null);
    assert.deepEqual(testClients[0].scopes, ["chat:write"]);
  });

  it("needs the setup code, and a wrong one gets nothing", async () => {
    up.seen.length = 0;
    assert.equal((await tryIt(g.url, '{"model":"m"}', null)).status, 401);
    assert.equal((await tryIt(g.url, '{"model":"m"}', "x".repeat(40))).status, 401);
    assert.equal(up.seen.length, 0);
  });

  it("a model that is not switched on is refused like anywhere else", async () => {
    assert.equal((await tryIt(g.url, '{"model":"not-enabled","messages":[]}')).status, 404);
  });

  it("the test client's key cannot be used from outside", async () => {
    const keys = (await (await admin(g.url, "/admin/keys")).json()).keys as { name: string; keyPrefix: string }[];
    assert.ok(keys.some((k) => k.name === "owner-test (page)"));
    // Only a hash is stored, so there is no key anyone could present.
    const stored = [...g.store.clients.values()].find((c) => c.name === "owner-test (page)")!;
    assert.equal(stored.keyHash.length, 64);
    const probe = await fetch(g.url + "/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${stored.keyPrefix}`, "content-type": "application/json" },
      body: '{"model":"m"}',
    });
    assert.equal(probe.status, 401);
  });
});
