import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import express from "express";
import { createServer } from "http";
import { buildSnapshot } from "../catalog";
import { loadConfig } from "../config";
import { createGatewayMiddleware } from "../index";
import { findTopLevelModel, replaceTopLevelModel } from "../jsonModel";
import { MemoryStore } from "../store";
import { SseWatcher, costUsd, isErrorBody, readUsage } from "../usage";
import { FreeQuota } from "../limits";
import {
  SETUP_CODE,
  UPSTREAM_KEY,
  UPSTREAM_KEY_B,
  admin,
  baseEnv,
  chat,
  createKey,
  listen,
  mockUpstream,
  price,
  sleep,
  startGateway,
} from "./helpers";

// ── Pure pieces ─────────────────────────────────────────────────────────────────────────────────

describe("jsonModel", () => {
  it("replaces only the top-level model bytes", () => {
    const body = Buffer.from('{ "messages":[{"role":"user","content":"model: \\"x\\" é 😀","model":"inner"}] ,\n "model" : "a",  "temperature":0.70 }');
    const out = replaceTopLevelModel(body, "provider-model/v2");
    assert.equal(
      out.toString(),
      '{ "messages":[{"role":"user","content":"model: \\"x\\" é 😀","model":"inner"}] ,\n "model" : "provider-model/v2",  "temperature":0.70 }',
    );
  });
  it("rejects duplicate top-level model keys and malformed JSON", () => {
    assert.throws(() => findTopLevelModel(Buffer.from('{"model":"a","model":"b"}')));
    assert.throws(() => findTopLevelModel(Buffer.from('{"model":"a"')));
    assert.throws(() => findTopLevelModel(Buffer.from('{"model":"a"} {}')));
    assert.equal(findTopLevelModel(Buffer.from('{"x":{"model":"a"}}')), null);
  });
});

describe("usage and cost", () => {
  it("counts free calls per day and per minute, and starts again after midnight UTC", () => {
    let t = Date.UTC(2026, 10, 6, 23, 59, 0);
    const q = new FreeQuota(() => t);
    const lim = { perDay: 3, perMinute: 2 };
    assert.equal(q.check("p", lim).ok, true);
    q.take("p");
    q.take("p");
    const blocked = q.check("p", lim);
    assert.equal(blocked.ok, false); // 2 in the last minute
    assert.ok(blocked.retryAfterMs > 0 && blocked.retryAfterMs <= 60_000);
    t += 61_000; // past midnight: a new day, a new minute
    assert.equal(q.used("p").today, 0);
    assert.equal(q.check("p", lim).ok, true);
    q.take("p");
    t += 61_000;
    q.take("p");
    t += 61_000;
    q.take("p");
    const full = q.check("p", lim);
    assert.equal(full.ok, false); // 3 today
    assert.ok(full.retryAfterMs > 3600_000);
    assert.equal(q.check("p", { perDay: null, perMinute: null }).ok, true);
    const r = new FreeQuota(() => t);
    r.restore("p", new Date(t).toISOString().slice(0, 10), 7);
    assert.equal(r.used("p").today, 7);
    r.restore("p", "2020-01-01", 99); // an old day is ignored
    assert.equal(r.used("p").today, 7);
  });
  it("reads the cost a provider reports itself (Surplus buyer_cost_micro, millionths of a dollar)", () => {
    const u = readUsage({ usage: { prompt_tokens: 10, completion_tokens: 20, buyer_cost_micro: 1234 } })!;
    assert.equal(u.reportedCostUsd, 0.001234);
    assert.equal(readUsage({ usage: { prompt_tokens: 1, completion_tokens: 1 } })!.reportedCostUsd, undefined);
    assert.equal(readUsage({ usage: { prompt_tokens: 1, completion_tokens: 1, buyer_cost_micro: -5 } })!.reportedCostUsd, undefined);
  });
  it("recognises a 200 reply whose body is an error", () => {
    assert.equal(isErrorBody({ error: { message: "no_sellers_for_model" } }), true);
    assert.equal(isErrorBody({ choices: [{}], error: null }), false);
    assert.equal(isErrorBody({ choices: [{ message: {} }] }), false);
    assert.equal(isErrorBody(null), false);
  });
  it("prices cached tokens separately and never adds a markup", () => {
    const c = costUsd({ inputTokens: 1_000_000, outputTokens: 500_000, cachedTokens: 200_000 }, { inputPerMTokUsd: 1, outputPerMTokUsd: 2, cachedInputPerMTokUsd: 0.1 });
    assert.equal(c, 0.8 + 0.02 + 1);
  });
  it("reads usage from an SSE stream split at arbitrary points", () => {
    const text = 'data: {"choices":[{"delta":{"content":"hi"}}]}\n\ndata: {"choices":[{"finish_reason":"stop"}],"usage":{"prompt_tokens":5,"completion_tokens":7}}\n\ndata: [DONE]\n\n';
    const w = new SseWatcher();
    for (let i = 0; i < text.length; i += 3) w.feed(Buffer.from(text.slice(i, i + 3)));
    w.end();
    assert.deepEqual(w.usage, { inputTokens: 5, outputTokens: 7, cachedTokens: 0 });
    assert.ok(w.sawDone && w.sawFinishReason);
  });
});

describe("catalog", () => {
  it("keeps only approved, quality-checked, fresh prices and ranks the cheapest first", () => {
    const config = loadConfig({
      ...baseEnv(),
      MITRIFY_SURPLUS_API_KEY: "k",
      MITRIFY_SURPLUS_BASE_URL: "https://a.example/v1",
      MITRIFY_SURPLUS_APPROVED: "1",
      MITRIFY_DEEPINFRA_API_KEY: "k",
      MITRIFY_DEEPINFRA_BASE_URL: "https://b.example/v1",
      MITRIFY_NOVITA_API_KEY: "k",
      MITRIFY_NOVITA_BASE_URL: "https://c.example/v1",
      MITRIFY_NOVITA_APPROVED: "1",
      MITRIFY_GATEWAY_POOL_SIZE: "2",
    });
    const now = new Date();
    const old = new Date(now.getTime() - 40 * 86400_000);
    const p = (provider: string, m: string, i: number, o: number, extra: Partial<Record<string, unknown>> = {}) => ({
      provider, upstreamModel: m, inputPerMTokUsd: i, outputPerMTokUsd: o, cachedInputPerMTokUsd: null, currency: "USD" as const,
      sourceUrl: "https://x", verifiedAt: now, contextLength: null, supportsStreaming: true, supportsTools: false,
      qualityPassed: true, enabled: true, updatedAt: now, ...extra,
    });
    const snap = buildSnapshot(
      [
        p("surplus", "m-mid", 0.3, 0.3),
        p("surplus", "m-cheap", 0.1, 0.1),
        p("deepinfra", "m-unapproved", 0.01, 0.01),
        p("novita", "m-bad-quality", 0.01, 0.01, { qualityPassed: false }),
        p("novita", "m-stale", 0.01, 0.01, { verifiedAt: old }),
        p("novita", "m-out", 0.5, 0.5),
      ],
      config,
      { input: 0, output: 0 },
      now,
    );
    assert.deepEqual(snap.entries.map((e) => e.upstreamModel), ["m-cheap", "m-mid"]);
    const reasons = Object.fromEntries(snap.excluded.map((e) => [e.upstreamModel, e.reason]));
    assert.match(reasons["m-unapproved"], /pending_approval/);
    assert.match(reasons["m-bad-quality"], /not switched On/);
    assert.match(reasons["m-stale"], /older/);
    assert.match(reasons["m-out"], /outside the pool of 2/);
    assert.equal(snap.weights.source, "default");
  });
  it("weights by the observed input/output ratio once there is enough traffic", () => {
    const config = loadConfig({ ...baseEnv(), MITRIFY_SURPLUS_API_KEY: "k", MITRIFY_SURPLUS_BASE_URL: "https://a.example/v1", MITRIFY_SURPLUS_APPROVED: "1" });
    const now = new Date();
    const mk = (m: string, i: number, o: number) => ({
      provider: "surplus", upstreamModel: m, inputPerMTokUsd: i, outputPerMTokUsd: o, cachedInputPerMTokUsd: null, currency: "USD" as const,
      sourceUrl: "https://x", verifiedAt: now, contextLength: null, supportsStreaming: true, supportsTools: false, qualityPassed: true, enabled: true, updatedAt: now,
    });
    // Mostly output tokens: the model with cheap output wins even though its input is dearer.
    const snap = buildSnapshot([mk("cheap-in", 0.1, 2), mk("cheap-out", 1, 0.5)], config, { input: 100_000, output: 900_000 }, now);
    assert.equal(snap.weights.source, "observed");
    assert.equal(snap.entries[0].upstreamModel, "cheap-out");
  });
});

// ── End to end against a mock provider ──────────────────────────────────────────────────────────

describe("gateway end to end", () => {
  let up: Awaited<ReturnType<typeof mockUpstream>>;
  let up2: Awaited<ReturnType<typeof mockUpstream>>;
  let g: Awaited<ReturnType<typeof startGateway>>;
  let key: string;

  before(async () => {
    up = await mockUpstream((_req, res) => {
      res.writeHead(200, { "content-type": "application/json", "x-request-id": "up-123", "set-cookie": "upstream=1" });
      res.end('{"id":"x","choices":[{"message":{"content":"ok"},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":20}}');
    });
    up2 = await mockUpstream((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end('{"usage":{"prompt_tokens":1,"completion_tokens":1}}');
    });
    g = await startGateway(
      baseEnv({
        MITRIFY_SURPLUS_API_KEY: UPSTREAM_KEY,
        MITRIFY_SURPLUS_BASE_URL: up.url + "/v1",
        MITRIFY_SURPLUS_APPROVED: "1",
        MITRIFY_DEEPINFRA_API_KEY: UPSTREAM_KEY_B,
        MITRIFY_DEEPINFRA_BASE_URL: up2.url + "/v1",
        MITRIFY_DEEPINFRA_APPROVED: "1",
        MITRIFY_NOVITA_API_KEY: "sk-novita",
        MITRIFY_NOVITA_BASE_URL: "https://novita.example/v1", // not approved: must never be used
      }),
    );
    const r = await admin(g.url, "/admin/prices", {
      method: "PUT",
      body: [
        price("surplus", "deepseek-chat", 0.2, 0.4),
        price("surplus", "pricey-model", 5, 10),
        price("deepinfra", "llama-small", 0.3, 0.6),
      ],
    });
    assert.equal(r.status, 200);
    assert.equal((await admin(g.url, "/admin/catalog/refresh", { body: {} })).status, 200);
    key = (await createKey(g.url)).key;
  });

  after(async () => {
    await g.close();
    await up.close();
    await up2.close();
  });

  it("health check needs no key and says nothing else", async () => {
    const r = await fetch(g.url + "/healthz");
    assert.deepEqual(await r.json(), { status: "ok" });
  });

  it("pinned mode forwards the exact bytes and returns the exact bytes", async () => {
    up.seen.length = 0;
    const body = '{\n  "model" : "deepseek-chat",\n  "messages": [{"role":"system","content":"Be exact."},{"role":"user","content":"नमस्ते \\u00e9 😀"}],\n  "temperature": 0.70, "max_tokens": 5, "tools": [{"type":"function","function":{"name":"f","parameters":{}}}]\n}';
    const r = await chat(g.url, key, body, { cookie: "session=abc", "x-internal-secret": "nope", "x-forwarded-for": "1.2.3.4" });
    assert.equal(r.status, 200);
    const text = await r.text();
    assert.equal(text, '{"id":"x","choices":[{"message":{"content":"ok"},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":20}}');
    assert.equal(up.seen.length, 1);
    const s = up.seen[0];
    assert.ok(s.body.equals(Buffer.from(body)), "request body must be byte-identical");
    assert.equal(s.url, "/v1/chat/completions");
    assert.equal(s.headers.authorization, `Bearer ${UPSTREAM_KEY}`);
    assert.equal(s.headers.cookie, undefined);
    assert.equal(s.headers["x-internal-secret"], undefined);
    assert.equal(s.headers["x-forwarded-for"], undefined);
    assert.ok(!JSON.stringify(s.headers).includes(key), "the Mitrify key must never reach the provider");
    assert.equal(r.headers.get("x-mitrify-provider"), "surplus");
    assert.equal(r.headers.get("x-mitrify-mode"), "pinned");
    assert.equal(r.headers.get("x-upstream-request-id"), "up-123");
    assert.equal(r.headers.get("set-cookie"), null, "upstream cookies are not passed on");
    await sleep(20);
    const row = g.store.usage.at(-1)!;
    assert.equal(row.inputTokens, 10);
    assert.equal(row.outputTokens, 20);
    assert.equal(row.estimatedCostUsd, (10 * 0.2 + 20 * 0.4) / 1e6);
    assert.equal(row.billingStatus, "estimated");
  });

  it("auto-cheap picks the cheapest pool model and changes only the model value", async () => {
    up.seen.length = 0;
    const body = '{"model":"mitrify/auto-cheap","messages":[{"role":"user","content":"hi"}],"top_p":1}';
    const r = await chat(g.url, key, body);
    assert.equal(r.status, 200);
    await r.text();
    assert.equal(up.seen[0].body.toString(), '{"model":"deepseek-chat","messages":[{"role":"user","content":"hi"}],"top_p":1}');
    assert.equal(r.headers.get("x-mitrify-mode"), "auto-cheap");
    assert.equal(r.headers.get("x-mitrify-model"), "deepseek-chat");
  });

  it("falls back inside the pool only when the provider refuses before starting", async () => {
    up.state.behaviour = (_req, res) => {
      res.writeHead(503, { "content-type": "application/json" });
      res.end('{"error":"overloaded"}');
    };
    up.seen.length = 0;
    up2.seen.length = 0;
    const r = await chat(g.url, key, '{"model":"mitrify/auto-cheap","messages":[]}');
    assert.equal(r.status, 200);
    await r.text();
    assert.equal(up.seen.length, 1);
    assert.equal(up2.seen.length, 1);
    assert.equal(up2.seen[0].headers.authorization, `Bearer ${UPSTREAM_KEY_B}`);
    assert.equal(up2.seen[0].body.toString(), '{"model":"llama-small","messages":[]}');
    assert.equal(r.headers.get("x-mitrify-attempts"), "2");
  });

  it("pinned mode never falls back: the provider's error is returned as it is", async () => {
    up2.seen.length = 0;
    const r = await chat(g.url, key, '{"model":"deepseek-chat","messages":[]}');
    assert.equal(r.status, 503);
    assert.equal(await r.text(), '{"error":"overloaded"}');
    assert.equal(up2.seen.length, 0);
  });

  it("does not retry a 500 (the work may have started)", async () => {
    up.state.behaviour = (_req, res) => {
      res.writeHead(500, { "content-type": "application/json" });
      res.end('{"error":"boom"}');
    };
    up2.seen.length = 0;
    const r = await chat(g.url, key, '{"model":"mitrify/auto-cheap","messages":[]}');
    assert.equal(r.status, 500);
    assert.equal(await r.text(), '{"error":"boom"}');
    assert.equal(up2.seen.length, 0);
  });

  it("streams SSE events unchanged, in order, without buffering, and bills from the stream usage", async () => {
    // Fresh breaker for surplus after the failures above.
    g.gw.breakers.get("surplus")!.success();
    const events = [
      'data: {"choices":[{"delta":{"content":"fn main() {"}}]}\n\n',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"a\\":1}"}}]}}]}\n\n',
      ": keep-alive comment\n\n",
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
      'data: {"choices":[],"usage":{"prompt_tokens":100,"completion_tokens":50,"prompt_tokens_details":{"cached_tokens":40}}}\n\n',
      "data: [DONE]\n\n",
    ];
    let releaseLast!: () => void;
    const gate = new Promise<void>((r) => (releaseLast = r));
    up.state.behaviour = async (_req, res) => {
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
      for (let i = 0; i < events.length; i++) {
        if (i === 2) await gate; // the client must already have the first events
        res.write(events[i]);
        await sleep(5);
      }
      res.end();
    };
    const r = await chat(g.url, key, '{"model":"deepseek-chat","stream":true,"stream_options":{"include_usage":true},"messages":[]}');
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("content-type"), "text/event-stream");
    const reader = r.body!.getReader();
    let got = "";
    while (got.length < events[0].length + events[1].length) got += new TextDecoder().decode((await reader.read()).value);
    assert.equal(got, events[0] + events[1], "first events arrive before the provider finishes");
    releaseLast();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      got += new TextDecoder().decode(value);
    }
    assert.equal(got, events.join(""));
    await sleep(20);
    const row = g.store.usage.at(-1)!;
    assert.equal(row.outcome, "completed");
    assert.deepEqual([row.inputTokens, row.outputTokens, row.cachedTokens], [100, 50, 40]);
  });

  it("refuses a stream that does not ask for usage instead of adding it", async () => {
    up.seen.length = 0;
    const r = await chat(g.url, key, '{"model":"deepseek-chat","stream":true,"messages":[]}');
    assert.equal(r.status, 400);
    assert.equal((await r.json()).error.type, "usage_required");
    assert.equal(up.seen.length, 0);
  });

  it("cuts the connection when the provider fails midway, and does not replay", async () => {
    up.state.behaviour = (_req, res) => {
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.write('data: {"choices":[{"delta":{"content":"half"}}]}\n\n');
      setTimeout(() => res.socket?.destroy(), 20);
    };
    up.seen.length = 0;
    up2.seen.length = 0;
    const r = await chat(g.url, key, '{"model":"mitrify/auto-cheap","stream":true,"stream_options":{"include_usage":true},"messages":[]}');
    assert.equal(r.status, 200);
    await assert.rejects(r.text(), "the client must see an error, not a clean end");
    await sleep(30);
    assert.equal(up.seen.length, 1);
    assert.equal(up2.seen.length, 0, "no replay on another provider once generation started");
    assert.equal(g.store.usage.at(-1)!.outcome, "failed_midstream");
  });

  it("cancels the upstream request when the client disconnects", async () => {
    g.gw.breakers.get("surplus")!.success();
    up.state.behaviour = (_req, res) => {
      res.writeHead(200, { "content-type": "text/event-stream" });
      const t = setInterval(() => res.write('data: {"choices":[{"delta":{"content":"."}}]}\n\n'), 10);
      res.on("close", () => clearInterval(t));
    };
    up.closed.length = 0;
    const r = await chat(g.url, key, '{"model":"deepseek-chat","stream":true,"stream_options":{"include_usage":true},"messages":[]}');
    const reader = r.body!.getReader();
    await reader.read();
    await reader.cancel();
    await sleep(100);
    assert.equal(up.closed.at(-1), true, "the provider connection is closed");
    assert.equal(g.store.usage.at(-1)!.outcome, "cancelled");
  });

  it("rejects missing, wrong and revoked keys, and keys without the scope", async () => {
    assert.equal((await chat(g.url, "", "{}")).status, 401);
    assert.equal((await chat(g.url, "mtf_live_" + "A".repeat(43), "{}")).status, 401);
    const k = await createKey(g.url, { name: "temp" });
    assert.equal((await admin(g.url, `/admin/keys/${k.id}/revoke`, { body: {} })).status, 200);
    assert.equal((await chat(g.url, k.key, '{"model":"deepseek-chat"}')).status, 401);
    const m = await createKey(g.url, { name: "models-only", scopes: ["models:read"] });
    assert.equal((await chat(g.url, m.key, '{"model":"deepseek-chat"}')).status, 403);
    const list = await fetch(g.url + "/v1/models", { headers: { authorization: `Bearer ${m.key}` } });
    const ids = (await list.json()).data.map((d: { id: string }) => d.id);
    assert.ok(ids.includes("mitrify/auto-cheap") && ids.includes("deepseek-chat"));
  });

  it("rotation gives a new key and keeps the old one only for the grace period", async () => {
    const k = await createKey(g.url, { name: "rotating" });
    const r = await admin(g.url, `/admin/keys/${k.id}/rotate`, { body: {} });
    assert.equal(r.status, 201);
    const fresh = (await r.json()) as { key: string; rotatedFrom: string };
    assert.notEqual(fresh.key, k.key);
    assert.equal(fresh.rotatedFrom, k.id);
    const old = await g.store.getClient(k.id);
    assert.ok(old!.expiresAt!.getTime() <= Date.now() + 24 * 3600_000 + 1000);
  });

  it("rejects bad bodies, unknown models, ambiguous JSON and oversized requests", async () => {
    assert.equal((await chat(g.url, key, "not json")).status, 400);
    assert.equal((await chat(g.url, key, '{"model":"a","model":"deepseek-chat"}')).status, 400);
    assert.equal((await chat(g.url, key, '{"model":"no-such-model"}')).status, 404);
    assert.equal((await chat(g.url, key, '{"model":"x"}', { "content-type": "text/plain" })).status, 415);
    const big = '{"model":"deepseek-chat","x":"' + "a".repeat(9 * 1024 * 1024) + '"}';
    assert.equal((await chat(g.url, key, big)).status, 413);
    // A client cannot steer the request to a destination of its own.
    assert.equal((await chat(g.url, key, '{"model":"deepseek-chat"}', { "x-mitrify-provider": "http://evil.example" })).status, 400);
  });

  it("never sends traffic to a provider that is not approved", async () => {
    await admin(g.url, "/admin/prices", { method: "PUT", body: [price("novita", "dirt-cheap", 0.0001, 0.0001)] });
    await admin(g.url, "/admin/catalog/refresh", { body: {} });
    const cat = await (await admin(g.url, "/admin/catalog")).json();
    assert.ok(!cat.entries.some((e: { provider: string }) => e.provider === "novita"));
    assert.equal((await chat(g.url, key, '{"model":"dirt-cheap"}')).status, 404);
  });

  it("the kill switch stops client traffic but not admin", async () => {
    assert.equal((await admin(g.url, "/admin/kill", { body: { enabled: true } })).status, 200);
    const r = await chat(g.url, key, '{"model":"deepseek-chat"}');
    assert.equal(r.status, 503);
    assert.equal((await r.json()).error.type, "gateway_disabled");
    assert.equal((await admin(g.url, "/admin/kill", { body: { enabled: false } })).status, 200);
    assert.equal((await admin(g.url, "/admin/status")).status, 200);
  });

  it("a provider can be switched off on its own", async () => {
    await admin(g.url, "/admin/providers/surplus/disable", { body: { disabled: true } });
    assert.equal((await chat(g.url, key, '{"model":"deepseek-chat"}')).status, 404);
    await admin(g.url, "/admin/providers/surplus/disable", { body: { disabled: false } });
  });

  it("no response, status page or log ever contains a provider key or a prompt", async () => {
    const status = await (await admin(g.url, "/admin/status")).text();
    const prices = await (await admin(g.url, "/admin/prices")).text();
    const keys = await (await admin(g.url, "/admin/keys")).text();
    for (const t of [status, prices, keys, g.logs.join("\n")]) {
      assert.ok(!t.includes(UPSTREAM_KEY) && !t.includes(UPSTREAM_KEY_B), "provider key leaked");
      assert.ok(!t.includes("नमस्ते") && !t.includes("Be exact."), "prompt content leaked");
    }
    assert.ok(!keys.includes("keyHash") && !keys.includes(key), "client keys and hashes are never listed");
    assert.match(status, /"apiKeyConfigured":true/);
  });

  it("budgets: refused when today's spend reaches the cap", async () => {
    g.gw.breakers.get("surplus")!.success();
    up.state.behaviour = (_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end('{"usage":{"prompt_tokens":1000000,"completion_tokens":0}}');
    };
    const k = await createKey(g.url, { name: "small-budget", dailyBudgetUsd: 0.1 });
    assert.equal((await chat(g.url, k.key, '{"model":"deepseek-chat"}')).status, 200);
    await sleep(20);
    const r = await chat(g.url, k.key, '{"model":"deepseek-chat"}');
    assert.equal(r.status, 429);
    assert.equal((await r.json()).error.type, "budget_exceeded");
  });

  it("reconciled cost is stored next to the estimate", async () => {
    const row = g.store.usage.find((u) => u.billingStatus === "estimated")!;
    const r = await admin(g.url, `/admin/usage/${row.requestId}/reconcile`, { body: { costUsd: 0.000011 } });
    assert.equal(r.status, 200);
    const u = (await g.store.listUsage(new Date(0), 1000)).find((x) => x.requestId === row.requestId)!;
    assert.equal(u.reconciledCostUsd, 0.000011);
    assert.equal(u.billingStatus, "reconciled");
    assert.notEqual(u.estimatedCostUsd, null);
  });
});

describe("admin protection (the setup code)", () => {
  it("without MITRIFY_GATEWAY_SETUP_CODE nobody can create a key", async () => {
    const env = baseEnv();
    delete (env as Record<string, string | undefined>).MITRIFY_GATEWAY_SETUP_CODE;
    const g = await startGateway(env);
    const r = await admin(g.url, "/admin/keys", { body: { name: "x" } });
    assert.equal(r.status, 503);
    assert.equal((await r.json()).error.type, "admin_disabled");
    assert.equal(g.store.clients.size, 0);
    await g.close();
  });

  it("a short setup code is refused as too weak", async () => {
    const g = await startGateway(baseEnv({ MITRIFY_GATEWAY_SETUP_CODE: "short" }));
    assert.equal((await admin(g.url, "/admin/keys", { body: { name: "x" }, code: "short" })).status, 503);
    await g.close();
  });

  it("wrong codes are refused, logged, and lock the address out after 5 tries", async () => {
    const g = await startGateway(baseEnv());
    for (let i = 0; i < 5; i++) assert.equal((await admin(g.url, "/admin/keys", { body: { name: "x" }, code: "wrong" + i })).status, 401);
    // Even the right code is refused while locked out.
    assert.equal((await admin(g.url, "/admin/keys", { body: { name: "x" }, code: SETUP_CODE })).status, 429);
    assert.equal(g.store.clients.size, 0);
    assert.equal(g.store.audit.filter((a) => a.action === "admin_auth_failed").length, 5);
    await g.close();
  });

  it("an admin IP allowlist blocks other addresses", async () => {
    const g = await startGateway(baseEnv({ MITRIFY_GATEWAY_ADMIN_IPS: "10.9.9.9" }));
    assert.equal((await admin(g.url, "/admin/status")).status, 403);
    await g.close();
  });

  it("the key is shown once and only its hash is stored", async () => {
    const g = await startGateway(baseEnv());
    const k = await createKey(g.url);
    const stored = [...g.store.clients.values()][0];
    assert.ok(!JSON.stringify(stored).includes(k.key));
    assert.equal(stored.keyHash.length, 64);
    await g.close();
  });

  it("refuses traffic until a daily budget is set", async () => {
    const env = baseEnv();
    delete (env as Record<string, string | undefined>).MITRIFY_GATEWAY_DAILY_BUDGET_USD;
    const g = await startGateway(env);
    const k = await createKey(g.url);
    const r = await chat(g.url, k.key, '{"model":"x"}');
    assert.equal(r.status, 503);
    assert.equal((await r.json()).error.type, "budget_not_configured");
    await g.close();
  });
});

describe("concurrency", () => {
  it("queues up to the limit and answers 429 beyond it, never dropping silently", async () => {
    let release!: () => void;
    const hold = new Promise<void>((r) => (release = r));
    const up = await mockUpstream(async (_req, res) => {
      await hold;
      res.writeHead(200, { "content-type": "application/json" });
      res.end('{"usage":{"prompt_tokens":1,"completion_tokens":1}}');
    });
    const g = await startGateway(
      baseEnv({
        MITRIFY_SURPLUS_API_KEY: UPSTREAM_KEY,
        MITRIFY_SURPLUS_BASE_URL: up.url,
        MITRIFY_SURPLUS_APPROVED: "1",
        MITRIFY_SURPLUS_MAX_CONCURRENCY: "2",
        MITRIFY_SURPLUS_MAX_QUEUE: "1",
      }),
    );
    await admin(g.url, "/admin/prices", { method: "PUT", body: [price("surplus", "m", 0.1, 0.1)] });
    const k = await createKey(g.url);
    const reqs = Array.from({ length: 5 }, () => chat(g.url, k.key, '{"model":"m"}'));
    await sleep(100);
    release();
    const statuses = (await Promise.all(reqs)).map((r) => r.status).sort();
    assert.deepEqual(statuses, [200, 200, 200, 429, 429]);
    assert.equal(up.seen.length, 3);
    await g.close();
    await up.close();
  });
});

describe("mounting on the marketplace server", () => {
  it("only the gateway host reaches the gateway; the marketplace is untouched", async () => {
    const store = new MemoryStore();
    const app = express();
    app.use(createGatewayMiddleware({ config: loadConfig(baseEnv({ MITRIFY_GATEWAY_HOST: "gateway.mitrify.com" })), store }));
    app.use(express.json());
    app.post("/api/echo", (req, res) => res.json({ marketplace: true, body: req.body }));
    app.get("/healthz", (_req, res) => res.send("marketplace-healthz"));
    const server = createServer(app);
    const url = await listen(server);

    const m = await fetch(url + "/api/echo", { method: "POST", headers: { "content-type": "application/json" }, body: '{"a":1}' });
    assert.deepEqual(await m.json(), { marketplace: true, body: { a: 1 } });
    assert.equal(await (await fetch(url + "/healthz")).text(), "marketplace-healthz");

    const { request } = await import("http");
    const viaGateway = await new Promise<{ status: number; body: string }>((resolve) => {
      const r = request(url + "/api/echo", { method: "POST", headers: { host: "gateway.mitrify.com", "content-type": "application/json" } }, (res) => {
        let b = "";
        res.on("data", (c) => (b += c));
        res.on("end", () => resolve({ status: res.statusCode!, body: b }));
      });
      r.end('{"a":1}');
    });
    assert.equal(viaGateway.status, 404, "marketplace routes are not reachable on the gateway host");
    assert.match(viaGateway.body, /"source":"mitrify"/);
    server.closeAllConnections();
    server.close();
  });

  it("with MITRIFY_GATEWAY_ENABLED unset the middleware does nothing", async () => {
    const app = express();
    app.use(createGatewayMiddleware({ config: loadConfig({}) }));
    app.get("/healthz", (_req, res) => res.send("marketplace"));
    const server = createServer(app);
    const url = await listen(server);
    const { request } = await import("http");
    const body = await new Promise<string>((resolve) => {
      request(url + "/healthz", { headers: { host: "gateway.mitrify.com" } }, (res) => {
        let b = "";
        res.on("data", (c) => (b += c));
        res.on("end", () => resolve(b));
      }).end();
    });
    assert.equal(body, "marketplace");
    server.closeAllConnections();
    server.close();
  });
});

describe("config", () => {
  it("refuses plain http and URLs with credentials for providers", () => {
    const c = loadConfig({ MITRIFY_SURPLUS_API_KEY: "k", MITRIFY_SURPLUS_BASE_URL: "http://x.example", MITRIFY_SURPLUS_APPROVED: "1" });
    assert.equal(c.providers[0].status, "invalid_config");
    const d = loadConfig({ MITRIFY_SURPLUS_API_KEY: "k", MITRIFY_SURPLUS_BASE_URL: "https://u:p@x.example", MITRIFY_SURPLUS_APPROVED: "1" });
    assert.equal(d.providers[0].status, "invalid_config");
    const e = loadConfig({ MITRIFY_SURPLUS_API_KEY: "k", MITRIFY_SURPLUS_BASE_URL: "https://x.example/v1" });
    assert.equal(e.providers[0].status, "pending_approval");
  });
});

describe("recent calls for the owner", () => {
  it("lists calls to /v1 with how they ended, including ones refused at the door, without prompts or keys", async () => {
    const up = await mockUpstream((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end('{"choices":[{"message":{"content":"SECRET-REPLY"}}],"usage":{"prompt_tokens":1,"completion_tokens":1}}');
    });
    const g = await startGateway(baseEnv({ MITRIFY_SURPLUS_API_KEY: UPSTREAM_KEY, MITRIFY_SURPLUS_BASE_URL: up.url, MITRIFY_SURPLUS_APPROVED: "1" }));
    try {
      await admin(g.url, "/admin/prices", { method: "PUT", body: [price("surplus", "m-1", 0.1, 0.1, { enabled: true })] });
      const key = await createKey(g.url, { name: "navbharatai-chat" });
      const k = (key as { key: string }).key;
      assert.equal((await chat(g.url, k, '{"model":"m-1","messages":[{"role":"user","content":"SECRET-PROMPT"}]}')).status, 200);
      assert.equal((await chat(g.url, "mtf_live_" + "x".repeat(40), '{"model":"m-1","messages":[]}')).status, 401);
      assert.equal((await chat(g.url, k, '{"model":"m-1","stream":true,"messages":[]}')).status, 400); // refused at the door: stream without usage
      const r = await admin(g.url, "/admin/recent");
      assert.equal(r.status, 200);
      const text = await r.text();
      const calls = JSON.parse(text).calls as { client: string | null; status: number; error: string | null; provider: string | null; model: string | null }[];
      assert.equal(calls.length, 3);
      assert.deepEqual(calls.map((c) => c.status), [400, 401, 200]); // newest first
      assert.equal(calls[0].client, "navbharatai-chat");
      assert.equal(calls[0].error, "usage_required");
      assert.equal(calls[1].client, null);
      assert.equal(calls[1].error, "invalid_api_key");
      assert.deepEqual([calls[2].provider, calls[2].model], ["surplus", "m-1"]);
      assert.ok(!text.includes("SECRET-PROMPT") && !text.includes("SECRET-REPLY") && !text.includes(k) && !text.includes(UPSTREAM_KEY));
      assert.equal((await fetch(g.url + "/admin/recent")).status >= 400, true); // not open to the public
    } finally {
      await g.close();
      await up.close();
    }
  });
});

describe("why a reply ended", () => {
  it("Recent calls show the finish reason and the app's own max_tokens limit, for plain and streamed replies", async () => {
    const up = await mockUpstream((req, res) => {
      const stream = JSON.parse(req.body.toString()).stream === true;
      if (stream) {
        res.writeHead(200, { "content-type": "text/event-stream" });
        res.write('data: {"choices":[{"delta":{"content":"a"}}]}\n\n');
        res.write('data: {"choices":[{"delta":{},"finish_reason":"length"}]}\n\n');
        res.write('data: {"choices":[],"usage":{"prompt_tokens":3,"completion_tokens":9}}\n\n');
        res.end("data: [DONE]\n\n");
      } else {
        res.writeHead(200, { "content-type": "application/json" });
        res.end('{"choices":[{"message":{"content":"a"},"finish_reason":"length"}],"usage":{"prompt_tokens":3,"completion_tokens":7}}');
      }
    });
    const g = await startGateway(baseEnv({ MITRIFY_SURPLUS_API_KEY: UPSTREAM_KEY, MITRIFY_SURPLUS_BASE_URL: up.url, MITRIFY_SURPLUS_APPROVED: "1" }));
    try {
      await admin(g.url, "/admin/prices", { method: "PUT", body: [price("surplus", "m-1", 0.1, 0.1, { enabled: true })] });
      const k = (await createKey(g.url)).key;
      assert.equal((await (await chat(g.url, k, '{"model":"m-1","max_tokens":7,"messages":[]}')).text()).includes("length"), true);
      const s = await chat(g.url, k, '{"model":"m-1","stream":true,"max_completion_tokens":9,"stream_options":{"include_usage":true},"messages":[]}');
      await s.text();
      await new Promise((r) => setTimeout(r, 50));
      const calls = (await (await admin(g.url, "/admin/recent")).json()).calls as { finish: string | null; outputTokens: number | null; maxTokens: number | null; outcome: string | null }[];
      assert.deepEqual(calls.map((c) => [c.finish, c.outputTokens, c.maxTokens, c.outcome]), [
        ["length", 9, 9, "completed"],
        ["length", 7, 7, "completed"],
      ]);
    } finally {
      await g.close();
      await up.close();
    }
  });
});
