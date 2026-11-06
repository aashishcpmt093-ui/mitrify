import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SETUP_CODE, UPSTREAM_KEY, admin, baseEnv, chat, mockUpstream, price, startGateway, type Seen } from "./helpers";

const OK = '{"choices":[{"message":{"content":"ok"}}],"usage":{"prompt_tokens":1000,"completion_tokens":1000}}';
const AUTO = '{"model":"mitrify/auto-cheap","messages":[{"role":"user","content":"hi"}]}';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A provider that takes `delayMs` to answer and records how many requests it ever had at once. */
async function slowProvider(delayMs: number, onRequest?: (req: Seen) => void) {
  const stat = { now: 0, max: 0, served: 0 };
  const up = await mockUpstream(async (req, res) => {
    onRequest?.(req);
    stat.now++;
    stat.max = Math.max(stat.max, stat.now);
    res.on("close", () => stat.now--);
    await sleep(delayMs);
    stat.served++;
    res.writeHead(200, { "content-type": "application/json" });
    res.end(OK);
  });
  return { up, stat };
}

describe("capacity", () => {
  it("1000 requests at once over 7 providers: all answered, no provider ever over its own limit, the load spreads cheapest first", async () => {
    const ids = ["surplus", "routerone", "siliconflow", "deepinfra", "novita", "openrouter", "acme"];
    const capacity = [30, 20, 20, 15, 15, 10, 10]; // total 120 at the same moment
    const providers = await Promise.all(ids.map(() => slowProvider(300))); // slow enough that the cheap ones fill up
    const env: Record<string, string> = { MITRIFY_GATEWAY_EXTRA_PROVIDERS: "acme", MITRIFY_GATEWAY_MAX_INFLIGHT: "1500" };
    ids.forEach((id, i) => {
      const U = id.toUpperCase();
      env[`MITRIFY_${U}_API_KEY`] = UPSTREAM_KEY;
      env[`MITRIFY_${U}_BASE_URL`] = providers[i].up.url;
      env[`MITRIFY_${U}_APPROVED`] = "1";
      env[`MITRIFY_${U}_MAX_CONCURRENCY`] = String(capacity[i]);
      env[`MITRIFY_${U}_MAX_QUEUE`] = "2000";
    });
    const g = await startGateway(baseEnv(env));
    // One model per provider, each dearer than the last: the first provider is the cheapest.
    await admin(g.url, "/admin/prices", { method: "PUT", body: ids.map((id, i) => price(id, `model-${i}`, 0.01 * (i + 1), 0.01 * (i + 1))) });
    await admin(g.url, "/admin/catalog/refresh", { body: {} });
    const key = ((await (await admin(g.url, "/admin/keys", { body: { name: "bulk", rpm: 100000 } })).json()) as { key: string }).key;

    const started = Date.now();
    const results = await Promise.all(Array.from({ length: 1000 }, () => chat(g.url, key, AUTO).then(async (r) => (await r.text(), r.status))));
    const took = Date.now() - started;

    assert.equal(results.filter((s) => s === 200).length, 1000, `statuses: ${JSON.stringify([...new Set(results)])}`);
    providers.forEach((p, i) => assert.ok(p.stat.max <= capacity[i], `${ids[i]} had ${p.stat.max} at once, limit ${capacity[i]}`));
    assert.equal(providers.reduce((s, p) => s + p.stat.served, 0), 1000);
    // The cheapest provider took as much as it could; the others took the overflow, none was left out.
    assert.equal(providers[0].stat.max, capacity[0], "the cheapest provider was filled first");
    providers.forEach((p, i) => assert.ok(p.stat.served > 0, `${ids[i]} was never used`));
    assert.ok(providers[0].stat.served >= providers[6].stat.served, "cheaper providers did at least as much as the dearest");
    assert.ok(took < 20_000, `took ${took} ms`);
    const status = await (await admin(g.url, "/admin/status")).json();
    assert.equal(status.inflight, 0);
    assert.equal(status.inflightMegabytes, 0);
    await g.close();
    await Promise.all(providers.map((p) => p.up.close()));
  });

  it("when every provider is full the requests wait in line and all finish, without exceeding anyone's limit", async () => {
    const a = await slowProvider(100);
    const b = await slowProvider(100);
    const g = await startGateway(
      baseEnv({
        MITRIFY_SURPLUS_API_KEY: UPSTREAM_KEY, MITRIFY_SURPLUS_BASE_URL: a.up.url, MITRIFY_SURPLUS_APPROVED: "1", MITRIFY_SURPLUS_MAX_CONCURRENCY: "2", MITRIFY_SURPLUS_MAX_QUEUE: "500",
        MITRIFY_ROUTERONE_API_KEY: UPSTREAM_KEY, MITRIFY_ROUTERONE_BASE_URL: b.up.url, MITRIFY_ROUTERONE_APPROVED: "1", MITRIFY_ROUTERONE_MAX_CONCURRENCY: "2", MITRIFY_ROUTERONE_MAX_QUEUE: "500",
      }),
    );
    await admin(g.url, "/admin/prices", { method: "PUT", body: [price("surplus", "m-a", 0.01, 0.01), price("routerone", "m-b", 0.02, 0.02)] });
    await admin(g.url, "/admin/catalog/refresh", { body: {} });
    const key = ((await (await admin(g.url, "/admin/keys", { body: { name: "k", rpm: 100000 } })).json()) as { key: string }).key;
    const results = await Promise.all(Array.from({ length: 40 }, () => chat(g.url, key, AUTO).then(async (r) => (await r.text(), r.status))));
    assert.deepEqual([...new Set(results)], [200]);
    assert.ok(a.stat.max <= 2 && b.stat.max <= 2, `${a.stat.max}, ${b.stat.max}`);
    assert.equal(a.stat.served + b.stat.served, 40);
    assert.ok(a.stat.served > 0 && b.stat.served > 0, "both shared the work");
    await g.close();
    await a.up.close();
    await b.up.close();
  });

  it("a busy cheap provider does not hold up a request that another provider could start at once", async () => {
    const slow = await slowProvider(500); // cheap, one place, slow
    const fast = await slowProvider(20); // dearer, one place, quick
    const g = await startGateway(
      baseEnv({
        MITRIFY_SURPLUS_API_KEY: UPSTREAM_KEY, MITRIFY_SURPLUS_BASE_URL: slow.up.url, MITRIFY_SURPLUS_APPROVED: "1", MITRIFY_SURPLUS_MAX_CONCURRENCY: "1",
        MITRIFY_ROUTERONE_API_KEY: UPSTREAM_KEY, MITRIFY_ROUTERONE_BASE_URL: fast.up.url, MITRIFY_ROUTERONE_APPROVED: "1", MITRIFY_ROUTERONE_MAX_CONCURRENCY: "1",
      }),
    );
    await admin(g.url, "/admin/prices", { method: "PUT", body: [price("surplus", "cheap", 0.01, 0.01), price("routerone", "dear", 0.05, 0.05)] });
    await admin(g.url, "/admin/catalog/refresh", { body: {} });
    const key = ((await (await admin(g.url, "/admin/keys", { body: { name: "k", rpm: 100000 } })).json()) as { key: string }).key;
    const first = chat(g.url, key, AUTO).then(async (r) => (await r.text(), decodeURIComponent(r.headers.get("x-mitrify-model")!)));
    await sleep(120); // the cheap provider is now busy with the first request
    const t0 = Date.now();
    const r2 = await chat(g.url, key, AUTO);
    await r2.text();
    const took = Date.now() - t0;
    assert.equal(decodeURIComponent(r2.headers.get("x-mitrify-model")!), "dear", "went to the provider that had a free place");
    assert.ok(took < 300, `waited ${took} ms instead of starting at once`);
    assert.equal(await first, "cheap");
    await g.close();
    await slow.up.close();
    await fast.up.close();
  });

  it("a full queue is a clean 429 with a wait time, never a hang or an overload of the provider", async () => {
    const a = await slowProvider(300);
    const g = await startGateway(
      baseEnv({ MITRIFY_SURPLUS_API_KEY: UPSTREAM_KEY, MITRIFY_SURPLUS_BASE_URL: a.up.url, MITRIFY_SURPLUS_APPROVED: "1", MITRIFY_SURPLUS_MAX_CONCURRENCY: "1", MITRIFY_SURPLUS_MAX_QUEUE: "2" }),
    );
    await admin(g.url, "/admin/prices", { method: "PUT", body: [price("surplus", "m", 0.01, 0.01)] });
    await admin(g.url, "/admin/catalog/refresh", { body: {} });
    const key = ((await (await admin(g.url, "/admin/keys", { body: { name: "k", rpm: 100000 } })).json()) as { key: string }).key;
    const rs = await Promise.all(Array.from({ length: 10 }, () => chat(g.url, key, AUTO).then(async (r) => ({ s: r.status, ra: r.headers.get("retry-after"), body: await r.text() }))));
    const ok = rs.filter((r) => r.s === 200).length;
    const busy = rs.filter((r) => r.s === 429);
    assert.equal(ok, 3, "one running and two waiting");
    assert.equal(busy.length, 7);
    assert.ok(busy.every((r) => r.ra && Number(r.ra) >= 1 && JSON.parse(r.body).error.type === "provider_busy"));
    assert.equal(a.stat.max, 1);
    await g.close();
    await a.up.close();
  });

  it("many free models that are all full still leave a paid model for the last attempt", async () => {
    const calls: Record<string, number> = {};
    const up = await mockUpstream((req, res) => {
      const m = (JSON.parse(req.body.toString()) as { model: string }).model;
      calls[m] = (calls[m] ?? 0) + 1;
      if (m.startsWith("free-")) return void (res.writeHead(429, { "content-type": "application/json" }), res.end('{"error":"limit"}'));
      res.writeHead(200, { "content-type": "application/json" });
      res.end(OK);
    });
    const g = await startGateway(baseEnv({ MITRIFY_SURPLUS_API_KEY: UPSTREAM_KEY, MITRIFY_SURPLUS_BASE_URL: up.url, MITRIFY_SURPLUS_APPROVED: "1" }));
    const free = Array.from({ length: 40 }, (_, i) => price("surplus", `free-${String(i).padStart(2, "0")}`, 0, 0));
    await admin(g.url, "/admin/prices", { method: "PUT", body: [...free, price("surplus", "paid-1", 0.1, 0.2)] });
    await admin(g.url, "/admin/catalog/refresh", { body: {} });
    const key = ((await (await admin(g.url, "/admin/keys", { body: { name: "k" } })).json()) as { key: string }).key;
    const r = await chat(g.url, key, AUTO);
    assert.equal(r.status, 200);
    assert.equal(decodeURIComponent(r.headers.get("x-mitrify-model")!), "paid-1");
    await r.text();
    await g.close();
    await up.close();
  });

  it("memory guard: bodies held at once are capped, and an overflow is told to wait instead of crashing", async () => {
    const a = await slowProvider(400);
    const g = await startGateway(
      baseEnv({ MITRIFY_SURPLUS_API_KEY: UPSTREAM_KEY, MITRIFY_SURPLUS_BASE_URL: a.up.url, MITRIFY_SURPLUS_APPROVED: "1", MITRIFY_GATEWAY_MAX_INFLIGHT_MB: "1" }),
    );
    await admin(g.url, "/admin/prices", { method: "PUT", body: [price("surplus", "m", 0.01, 0.01)] });
    await admin(g.url, "/admin/catalog/refresh", { body: {} });
    const key = ((await (await admin(g.url, "/admin/keys", { body: { name: "k", rpm: 100000 } })).json()) as { key: string }).key;
    const big = JSON.stringify({ model: "mitrify/auto-cheap", messages: [{ role: "user", content: "x".repeat(600 * 1024) }] });
    const rs = await Promise.all([1, 2, 3].map(() => chat(g.url, key, big).then(async (r) => ({ s: r.status, ra: r.headers.get("retry-after"), t: await r.text() }))));
    assert.deepEqual(rs.map((r) => r.s).sort(), [200, 503, 503]);
    assert.ok(rs.filter((r) => r.s === 503).every((r) => r.ra === "5" && JSON.parse(r.t).error.type === "gateway_busy"));
    // Once the first has finished there is room again.
    assert.equal((await chat(g.url, key, big)).status, 200);
    const status = await (await admin(g.url, "/admin/status")).json();
    assert.equal(status.inflightMegabytes, 0);
    assert.ok(SETUP_CODE);
    await g.close();
    await a.up.close();
  });
});
