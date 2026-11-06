import assert from "node:assert/strict";
import { createServer } from "node:http";
import { describe, it } from "node:test";
import { buildSnapshot } from "../catalog";
import { loadConfig } from "../config";
import { Gateway } from "../gateway";
import { parseModelList } from "../priceImport";
import { MemoryStore, type PriceEntry } from "../store";
import { SETUP_CODE, UPSTREAM_KEY, admin, baseEnv, chat, listen, mockUpstream, price, startGateway, type Seen } from "./helpers";

const OK = '{"choices":[{"message":{"content":"ok"}}],"usage":{"prompt_tokens":1000,"completion_tokens":1000}}';
const modelOf = (s: Seen) => (JSON.parse(s.body.toString()) as { model: string }).model;
const AUTO = '{"model":"mitrify/auto-cheap","messages":[{"role":"user","content":"hi"}]}';

/** A provider whose models behave as scripted. */
function scripted(rules: Record<string, (n: number, res: import("http").ServerResponse) => void>) {
  const calls: Record<string, number> = {};
  return {
    calls,
    behaviour: (req: Seen, res: import("http").ServerResponse) => {
      const m = modelOf(req);
      calls[m] = (calls[m] ?? 0) + 1;
      (rules[m] ?? ((_n, r) => (r.writeHead(200, { "content-type": "application/json" }), r.end(OK))))(calls[m], res);
    },
  };
}
const okRes = (res: import("http").ServerResponse) => (res.writeHead(200, { "content-type": "application/json" }), res.end(OK));
const limit = (res: import("http").ServerResponse, retryAfter?: string) => (res.writeHead(429, { "content-type": "application/json", ...(retryAfter ? { "retry-after": retryAfter } : {}) }), res.end('{"error":"limit"}'));

async function setup(rules: Parameters<typeof scripted>[0], models: [string, number, number][], env: Record<string, string> = {}) {
  const s = scripted(rules);
  const up = await mockUpstream((req, res) => s.behaviour(req, res));
  const g = await startGateway(
    baseEnv({
      MITRIFY_SURPLUS_API_KEY: UPSTREAM_KEY,
      MITRIFY_SURPLUS_BASE_URL: up.url,
      MITRIFY_SURPLUS_APPROVED: "1",
      MITRIFY_SURPLUS_MAX_CONCURRENCY: "60",
      MITRIFY_SURPLUS_MAX_QUEUE: "500",
      ...env,
    }),
  );
  await admin(g.url, "/admin/prices", { method: "PUT", body: models.map(([m, i, o]) => price("surplus", m, i, o)) });
  await admin(g.url, "/admin/catalog/refresh", { body: {} });
  const key = ((await (await admin(g.url, "/admin/keys", { body: { name: "k" } })).json()) as { key: string }).key;
  return { g, up, s, key, close: async () => (await g.close(), await up.close()) };
}

const entry = (over: Partial<PriceEntry>): PriceEntry => ({
  provider: "openrouter", upstreamModel: "x/m", inputPerMTokUsd: 0.1, outputPerMTokUsd: 0.2, cachedInputPerMTokUsd: null, currency: "USD",
  sourceUrl: "https://x", verifiedAt: new Date(), contextLength: 32000, supportsStreaming: true, supportsTools: false,
  qualityPassed: false, enabled: false, auto: true, chatCapable: true, blocked: false, updatedAt: new Date(), ...over,
});
const or = (env: Record<string, string> = {}) => loadConfig({ MITRIFY_OPENROUTER_API_KEY: "k", MITRIFY_OPENROUTER_APPROVED: "1", ...env });

describe("automatic pool rules", () => {
  it("imported chat models join by themselves: free first, then by price, longer context first on a tie", () => {
    const snap = buildSnapshot(
      [
        entry({ upstreamModel: "a/paid-dear", inputPerMTokUsd: 1, outputPerMTokUsd: 1 }),
        entry({ upstreamModel: "a/paid-cheap", inputPerMTokUsd: 0.05, outputPerMTokUsd: 0.05 }),
        entry({ upstreamModel: "a/free-short", inputPerMTokUsd: 0, outputPerMTokUsd: 0, contextLength: 9000 }),
        entry({ upstreamModel: "a/free-long", inputPerMTokUsd: 0, outputPerMTokUsd: 0, contextLength: 128000 }),
      ],
      or(),
      { input: 0, output: 0 },
      new Date(),
    );
    assert.deepEqual(snap.entries.map((e) => e.upstreamModel), ["a/free-long", "a/free-short", "a/paid-cheap", "a/paid-dear"]);
    assert.deepEqual(snap.entries.map((e) => e.free), [true, true, false, false]);
  });

  it("always keeps places for paid models behind the free ones, however many free models there are", () => {
    const many = [
      ...Array.from({ length: 60 }, (_, i) => entry({ upstreamModel: `f/free-${String(i).padStart(2, "0")}`, inputPerMTokUsd: 0, outputPerMTokUsd: 0 })),
      ...Array.from({ length: 12 }, (_, i) => entry({ upstreamModel: `p/paid-${String(i).padStart(2, "0")}`, inputPerMTokUsd: 0.01 * (i + 1), outputPerMTokUsd: 0.01 * (i + 1) })),
    ];
    const snap = buildSnapshot(many, or(), { input: 0, output: 0 }, new Date());
    assert.equal(snap.entries.length, 40);
    assert.equal(snap.entries.filter((e) => e.free).length, 32);
    assert.equal(snap.entries.filter((e) => !e.free).length, 8);
    assert.deepEqual(snap.entries.slice(32).map((e) => e.upstreamModel), Array.from({ length: 8 }, (_, i) => `p/paid-${String(i).padStart(2, "0")}`), "the cheapest paid ones, after every free one");
    assert.ok(snap.entries.slice(0, 32).every((e) => e.free));
    // With few free models, the spare places go to more paid ones.
    const few = buildSnapshot(many.slice(55), or(), { input: 0, output: 0 }, new Date());
    assert.equal(few.entries.length, 17);
    // The number of reserved places can be changed or switched off.
    assert.equal(buildSnapshot(many, or({ MITRIFY_GATEWAY_POOL_PAID: "0" }), { input: 0, output: 0 }, new Date()).entries.filter((e) => !e.free).length, 0);
    assert.equal(buildSnapshot(many, or({ MITRIFY_GATEWAY_POOL_PAID: "20" }), { input: 0, output: 0 }, new Date()).entries.filter((e) => !e.free).length, 12);
  });

  it("keeps out models that are not for chat, too short, skipped by the owner, or not imported", () => {
    const snap = buildSnapshot(
      [
        entry({ upstreamModel: "a/ok" }),
        entry({ upstreamModel: "a/music", chatCapable: false }),
        entry({ upstreamModel: "a/lyria-3-clip", chatCapable: null }), // unknown: the name gives it away
        entry({ upstreamModel: "a/plain-unknown", chatCapable: null }), // unknown but nothing suspicious: allowed
        entry({ upstreamModel: "a/tiny-context", contextLength: 2000 }),
        entry({ upstreamModel: "a/skipped", blocked: true }),
        entry({ upstreamModel: "a/by-hand", auto: false }), // typed in by hand: needs On + Pool
        entry({ upstreamModel: "a/by-hand-ticked", auto: false, enabled: true, qualityPassed: true }),
      ],
      or(),
      { input: 0, output: 0 },
      new Date(),
    );
    assert.deepEqual(snap.entries.map((e) => e.upstreamModel).sort(), ["a/by-hand-ticked", "a/ok", "a/plain-unknown"]);
    const why = Object.fromEntries(snap.excluded.map((e) => [e.upstreamModel, e.reason]));
    assert.match(why["a/music"], /not a chat model/);
    assert.match(why["a/lyria-3-clip"], /not a chat model/);
    assert.match(why["a/tiny-context"], /context shorter/);
    assert.match(why["a/skipped"], /skipped/);
    assert.match(why["a/by-hand"], /not switched On/);
  });

  it("MITRIFY_GATEWAY_AUTO_SELECT=0 turns the automatic choice off", () => {
    const snap = buildSnapshot([entry({ upstreamModel: "a/ok" })], or({ MITRIFY_GATEWAY_AUTO_SELECT: "0" }), { input: 0, output: 0 }, new Date());
    assert.deepEqual(snap.entries, []);
  });

  it("reads what a model reads and writes from the price list", () => {
    const m = parseModelList({
      data: [
        { id: "v/text", pricing: { prompt: "0", completion: "0" }, architecture: { input_modalities: ["text", "image"], output_modalities: ["text"] } },
        { id: "v/music", pricing: { prompt: "0", completion: "0" }, architecture: { input_modalities: ["text"], output_modalities: ["audio"] } },
        { id: "v/str", pricing: { prompt: "0", completion: "0" }, architecture: { modality: "text+image->text" } },
        { id: "v/str-img", pricing: { prompt: "0", completion: "0" }, architecture: { modality: "text->image" } },
        { id: "v/unknown", pricing: { prompt: "0", completion: "0" } },
      ],
    });
    assert.deepEqual(m.map((x) => [x.id, x.chatCapable]), [["v/text", true], ["v/music", false], ["v/str", true], ["v/str-img", false], ["v/unknown", null]]);
  });
});

describe("free first, then the cheapest, when requests arrive in bulk", () => {
  const quota = (n: number) => (calls: number, res: import("http").ServerResponse) => (calls <= n ? okRes(res) : limit(res));

  it("20 requests in a row: free models answer until each one's limit is reached, then paid ones, and every request succeeds", async () => {
    const t = await setup(
      {
        "free-a": quota(3),
        "free-b": quota(2),
        "free-gone": (_n, res) => (res.writeHead(404, { "content-type": "application/json" }), res.end('{"error":"no endpoints"}')),
      },
      [["free-a", 0, 0], ["free-b", 0, 0], ["free-gone", 0, 0], ["paid-1", 0.1, 0.2]],
    );
    const statuses: number[] = [];
    const served: string[] = [];
    for (let i = 0; i < 20; i++) {
      const r = await chat(t.g.url, t.key, AUTO);
      statuses.push(r.status);
      served.push(decodeURIComponent(r.headers.get("x-mitrify-model") ?? ""));
      await r.text();
    }
    assert.deepEqual(statuses, Array(20).fill(200), "no request failed");
    assert.deepEqual(served.slice(0, 3), ["free-a", "free-a", "free-a"], "free first");
    assert.equal(served.filter((m) => m === "free-a").length, 3);
    assert.equal(served.filter((m) => m === "free-b").length, 2);
    assert.equal(served.filter((m) => m === "paid-1").length, 15, "everything after the free limits went to the paid model");
    // A full model is not asked again and again: 3 answers + 1 refusal, 2 answers + 1 refusal, one 404.
    assert.deepEqual([t.s.calls["free-a"], t.s.calls["free-b"], t.s.calls["free-gone"]], [4, 3, 1]);
    const status = await (await admin(t.g.url, "/admin/status")).json();
    assert.deepEqual(status.cooling.map((c: { model: string }) => c.model).sort(), ["free-a", "free-b", "free-gone"]);
    await t.close();
  });

  it("40 requests at once: all succeed, and no free model goes past its limit", async () => {
    const t = await setup(
      { "free-a": quota(3), "free-b": quota(2) },
      [["free-a", 0, 0], ["free-b", 0, 0], ["paid-1", 0.1, 0.2]],
    );
    const results = await Promise.all(Array.from({ length: 40 }, () => chat(t.g.url, t.key, AUTO).then(async (r) => (await r.text(), [r.status, r.headers.get("x-mitrify-model")] as const))));
    assert.ok(results.every(([s]) => s === 200), "every request got an answer");
    const byModel = (m: string) => results.filter(([, x]) => x === m).length;
    assert.equal(byModel("free-a"), 3);
    assert.equal(byModel("free-b"), 2);
    assert.equal(byModel("paid-1"), 35);
    await t.close();
  });

  it("each request's last attempt goes to a paid model, so it never ends only because free models were full", async () => {
    const t = await setup(
      { "free-1": (_n, r) => limit(r), "free-2": (_n, r) => limit(r), "free-3": (_n, r) => limit(r) },
      [["free-1", 0, 0], ["free-2", 0, 0], ["free-3", 0, 0], ["paid-1", 0.1, 0.2]],
      { MITRIFY_GATEWAY_MAX_ATTEMPTS: "2" },
    );
    const r = await chat(t.g.url, t.key, AUTO);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("x-mitrify-model"), "paid-1");
    assert.equal(r.headers.get("x-mitrify-attempts"), "2");
    await r.text();
    assert.deepEqual(t.s.calls, { "free-1": 1, "paid-1": 1 }, "free-2 and free-3 were never asked");
    await t.close();
  });

  it("when every model is full the client gets a clear 429 with a wait time, not a hang", async () => {
    const t = await setup({ "free-x": (_n, r) => limit(r, "90") }, [["free-x", 0, 0]]);
    const first = await chat(t.g.url, t.key, AUTO);
    assert.equal(first.status, 429, "the provider's own answer is passed on");
    await first.text();
    const second = await chat(t.g.url, t.key, AUTO);
    assert.equal(second.status, 429);
    assert.equal((await second.json()).error.type, "all_rate_limited");
    const wait = Number(second.headers.get("retry-after"));
    assert.ok(wait > 60 && wait <= 90, `retry-after ${wait}`);
    assert.equal(t.s.calls["free-x"], 1, "the full model was not asked again");
    await t.close();
  });

  it("a free model that fails with a provider error or a bad-request refusal is skipped, and the answer says what was tried", async () => {
    const t = await setup(
      {
        "free-502": (_n, r) => (r.writeHead(502, { "content-type": "application/json" }), r.end('{"error":{"message":"Provider returned error","code":502}}')),
        "free-400": (_n, r) => (r.writeHead(400, { "content-type": "application/json" }), r.end('{"error":{"message":"Developer instruction is not enabled","code":400}}')),
      },
      [["free-502", 0, 0], ["free-400", 0, 0], ["free-ok", 0, 0], ["paid-1", 0.1, 0.2]],
    );
    const r = await chat(t.g.url, t.key, AUTO);
    assert.equal(r.status, 200);
    assert.equal(decodeURIComponent(r.headers.get("x-mitrify-model")!), "free-ok");
    assert.equal(r.headers.get("x-mitrify-trail"), "free-400%3A400,free-502%3A502,free-ok%3A200");
    await r.text();
    // The two that failed are left alone for a while: the next request goes straight to the one that works.
    const r2 = await chat(t.g.url, t.key, AUTO);
    assert.equal(r2.headers.get("x-mitrify-trail"), "free-ok%3A200");
    await r2.text();
    assert.deepEqual([t.s.calls["free-502"], t.s.calls["free-400"], t.s.calls["free-ok"]], [1, 1, 2]);
    await t.close();
  });

  it("a PAID model's provider error is passed on, never run twice, and the trail is there to read", async () => {
    const t = await setup(
      { "paid-1": (_n, r) => (r.writeHead(502, { "content-type": "application/json" }), r.end('{"error":{"message":"Provider returned error","code":502}}')) },
      [["paid-1", 0.1, 0.2], ["paid-2", 0.3, 0.4]],
    );
    const r = await chat(t.g.url, t.key, AUTO);
    assert.equal(r.status, 502, "the provider's own answer");
    assert.equal((await r.json()).error.message, "Provider returned error");
    assert.equal(r.headers.get("x-mitrify-trail"), "paid-1%3A502");
    assert.deepEqual(t.s.calls, { "paid-1": 1 }, "the paid model was asked once and no other paid model was tried");
    await t.close();
  });

  it("when only free models are left and all fail, the last answer is passed on with the whole trail", async () => {
    const t = await setup(
      { "free-a": (_n, r) => (r.writeHead(502), r.end('{"error":{"message":"Provider returned error"}}')), "free-b": (_n, r) => (r.writeHead(400), r.end('{"error":{"message":"bad"}}')) },
      [["free-a", 0, 0], ["free-b", 0, 0]],
    );
    const r = await chat(t.g.url, t.key, AUTO);
    assert.equal(r.status, 400);
    assert.equal(r.headers.get("x-mitrify-trail"), "free-a%3A502,free-b%3A400");
    await r.text();
    await t.close();
  });

  it("a named (pinned) call never falls back and is not blocked by a cooldown", async () => {
    const t = await setup(
      { "free-x": (_n, r) => limit(r), "gone": (_n, r) => (r.writeHead(404), r.end('{"error":"nf"}')) },
      [["free-x", 0, 0], ["gone", 0, 0], ["paid-1", 0.1, 0.2]],
    );
    await (await chat(t.g.url, t.key, AUTO)).text(); // makes free-x and gone cool down
    const a = await chat(t.g.url, t.key, '{"model":"free-x","messages":[]}');
    assert.equal(a.status, 429, "asked for free-x by name: the answer is free-x's own");
    await a.text();
    const b = await chat(t.g.url, t.key, '{"model":"gone","messages":[]}');
    assert.equal(b.status, 404, "a 404 on a named call is passed on, not retried elsewhere");
    await b.text();
    assert.equal(t.s.calls["paid-1"], 1);
    await t.close();
  });

  it("free answers cost nothing and are recorded", async () => {
    const t = await setup({}, [["free-a", 0, 0]]);
    const r = await chat(t.g.url, t.key, AUTO);
    assert.equal(r.status, 200);
    await r.text();
    await new Promise((x) => setTimeout(x, 30));
    const row = t.g.store.usage.at(-1)!;
    assert.equal(row.estimatedCostUsd, 0);
    assert.equal(row.outcome, "completed");
    assert.equal((await (await admin(t.g.url, "/admin/status")).json()).spentTodayUsd, 0);
    await t.close();
  });
});

describe("cooldown timing", () => {
  it("waits as long as the provider says, otherwise 1 minute, then 5 minutes, and forgets after a success", async () => {
    let now = Date.now();
    let mode: "limit" | "limit-after" | "ok" = "limit";
    const up = await mockUpstream((_req, res) => (mode === "ok" ? okRes(res) : limit(res, mode === "limit-after" ? "7" : undefined)));
    const store = new MemoryStore();
    const gw = new Gateway(
      loadConfig(baseEnv({ MITRIFY_SURPLUS_API_KEY: UPSTREAM_KEY, MITRIFY_SURPLUS_BASE_URL: up.url, MITRIFY_SURPLUS_APPROVED: "1", MITRIFY_GATEWAY_MAX_ATTEMPTS: "1" })),
      store,
      { now: () => now, log: () => {} },
    );
    await gw.start();
    const server = createServer((req, res) => void gw.handle(req, res));
    const url = await listen(server);
    await admin(url, "/admin/prices", { method: "PUT", body: [price("surplus", "free-x", 0, 0)] });
    await admin(url, "/admin/catalog/refresh", { body: {} });
    const key = ((await (await admin(url, "/admin/keys", { body: { name: "k" } })).json()) as { key: string }).key;
    const left = async () => (await (await admin(url, "/admin/status")).json()).cooling[0] as { secondsLeft: number; strikes: number } | undefined;

    await (await chat(url, key, AUTO)).text();
    assert.deepEqual(await left(), { provider: "surplus", model: "free-x", secondsLeft: 60, strikes: 1 });
    now += 61_000;
    assert.equal(await left(), undefined, "the wait is over");
    await (await chat(url, key, AUTO)).text();
    assert.equal((await left())!.secondsLeft, 300, "second refusal in a row waits longer");
    now += 301_000;
    mode = "limit-after";
    await (await chat(url, key, AUTO)).text();
    assert.equal((await left())!.secondsLeft, 7, "the provider's own Retry-After wins");
    now += 8_000;
    mode = "ok";
    assert.equal((await chat(url, key, AUTO)).status, 200);
    assert.equal(await left(), undefined, "a success wipes the memory of earlier refusals");
    server.closeAllConnections();
    server.close();
    await up.close();
  });
});

describe("first start", () => {
  it("reads the provider's price list and builds the pool by itself, with nothing to press", async () => {
    let listCalls = 0;
    const up = await mockUpstream((req, res) => {
      if (req.url === "/models") {
        listCalls++;
        res.writeHead(200, { "content-type": "application/json" });
        return void res.end(
          JSON.stringify({
            data: [
              { id: "v/free-one:free", context_length: 64000, pricing: { prompt: "0", completion: "0" }, architecture: { input_modalities: ["text"], output_modalities: ["text"] } },
              { id: "v/cheap-one", context_length: 64000, pricing: { prompt: "0.0000001", completion: "0.0000002" }, architecture: { input_modalities: ["text"], output_modalities: ["text"] } },
              { id: "v/music-one", context_length: 64000, pricing: { prompt: "0", completion: "0" }, architecture: { input_modalities: ["text"], output_modalities: ["audio"] } },
            ],
          }),
        );
      }
      okRes(res);
    });
    const g = await startGateway(baseEnv({ MITRIFY_OPENROUTER_API_KEY: UPSTREAM_KEY, MITRIFY_OPENROUTER_BASE_URL: up.url, MITRIFY_OPENROUTER_APPROVED: "1" }));
    await g.gw.refreshCatalogIfDue(); // what happens when the server starts
    assert.equal(listCalls, 1);
    const snap = await (await admin(g.url, "/admin/catalog")).json();
    assert.deepEqual(snap.entries.map((e: { upstreamModel: string }) => e.upstreamModel), ["v/free-one:free", "v/cheap-one"]);
    await g.gw.refreshCatalogIfDue(); // a fresh, non-empty pool is left alone
    assert.equal(listCalls, 1);
    const key = ((await (await admin(g.url, "/admin/keys", { body: { name: "k" } })).json()) as { key: string }).key;
    const r = await chat(g.url, key, AUTO);
    assert.equal(r.status, 200);
    assert.equal(decodeURIComponent(r.headers.get("x-mitrify-model")!), "v/free-one:free");
    await r.text();
    assert.ok(SETUP_CODE.length > 0);
    await g.close();
    await up.close();
  });
});

describe("no reply: try again on the next model", () => {
  const EMPTY = '{"choices":[{"message":{"role":"assistant","content":""},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":0}}';
  const ERR200 = '{"error":{"message":"upstream exploded","code":502}}';
  const json = (res: import("http").ServerResponse, body: string, status = 200) => (res.writeHead(status, { "content-type": "application/json" }), res.end(body));
  const sse = (res: import("http").ServerResponse, parts: string[]) => {
    res.writeHead(200, { "content-type": "text/event-stream" });
    for (const p of parts) res.write(p);
    res.end();
  };
  const STREAM = '{"model":"mitrify/auto-cheap","stream":true,"stream_options":{"include_usage":true},"messages":[{"role":"user","content":"hi"}]}';
  const GOOD_STREAM = [
    'data: {"choices":[{"delta":{"content":"Nam"}}]}\n\n',
    'data: {"choices":[{"delta":{"content":"aste"},"finish_reason":"stop"}]}\n\n',
    'data: {"choices":[],"usage":{"prompt_tokens":5,"completion_tokens":2}}\n\n',
    "data: [DONE]\n\n",
  ];

  it("a free model that answers 200 with an empty reply, or with an error inside, is skipped", async () => {
    const t = await setup(
      { "free-empty": (_n, r) => json(r, EMPTY), "free-err": (_n, r) => json(r, ERR200), "free-notjson": (_n, r) => (r.writeHead(200), r.end("<html>oops</html>")) },
      [["free-empty", 0, 0], ["free-err", 0, 0], ["free-notjson", 0, 0], ["free-ok", 0, 0], ["paid-1", 0.1, 0.2]],
    );
    const r = await chat(t.g.url, t.key, AUTO);
    assert.equal(r.status, 200);
    assert.equal(await r.text(), OK, "the good model's answer arrives unchanged");
    // Three free models gave no reply; the fourth is the next free one, which answers (the fifth and last would go to a paid model).
    assert.equal(r.headers.get("x-mitrify-trail"), "free-empty%3Aempty,free-err%3Aerror-in-body,free-notjson%3Anot-json,free-ok%3A200");
    await t.close();
  });

  it("a stream whose first event is an error, or that is empty, is skipped; a good one is passed on byte for byte and in order", async () => {
    const t = await setup(
      {
        "free-a": (_n, r) => sse(r, ['data: {"error":{"message":"overloaded"}}\n\n']),
        "free-b": (_n, r) => sse(r, ["data: [DONE]\n\n"]),
        "free-c": (_n, r) => sse(r, [": keep-alive\n\n", ...GOOD_STREAM]),
      },
      [["free-a", 0, 0], ["free-b", 0, 0], ["free-c", 0, 0], ["paid-1", 0.1, 0.2]],
    );
    const r = await chat(t.g.url, t.key, STREAM);
    assert.equal(r.status, 200);
    assert.equal(await r.text(), [": keep-alive\n\n", ...GOOD_STREAM].join(""));
    assert.equal(r.headers.get("x-mitrify-trail"), "free-a%3Aerror-in-stream,free-b%3Aempty,free-c%3A200");
    await new Promise((x) => setTimeout(x, 30));
    const row = t.g.store.usage.at(-1)!;
    assert.deepEqual([row.inputTokens, row.outputTokens, row.outcome], [5, 2, "completed"]);
    await t.close();
  });

  it("a good stream still reaches the client while the model is still talking (nothing is held back after the first event)", async () => {
    let release!: () => void;
    const gate = new Promise<void>((x) => (release = x));
    const t = await setup(
      {
        "free-a": (_n, res) => {
          res.writeHead(200, { "content-type": "text/event-stream" });
          res.write(GOOD_STREAM[0]);
          void gate.then(() => {
            for (const p of GOOD_STREAM.slice(1)) res.write(p);
            res.end();
          });
        },
      },
      [["free-a", 0, 0], ["paid-1", 0.1, 0.2]],
    );
    const r = await chat(t.g.url, t.key, STREAM);
    const reader = r.body!.getReader();
    let got = "";
    while (!got.includes("Nam")) got += new TextDecoder().decode((await reader.read()).value);
    assert.equal(got, GOOD_STREAM[0], "the first event arrived before the model finished");
    release();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      got += new TextDecoder().decode(value);
    }
    assert.equal(got, GOOD_STREAM.join(""));
    await t.close();
  });

  it("a free model that goes silent is given up on after the free timeout, and its connection is closed", async () => {
    const t = await setup(
      { "free-hang": () => {} /* never answers */ },
      [["free-hang", 0, 0], ["free-ok", 0, 0], ["paid-1", 0.1, 0.2]],
      { MITRIFY_GATEWAY_FREE_FIRST_BYTE_TIMEOUT_MS: "400" },
    );
    const started = Date.now();
    const r = await chat(t.g.url, t.key, AUTO);
    assert.equal(r.status, 200);
    await r.text();
    assert.ok(Date.now() - started < 4000, "did not wait for the long default timeout");
    assert.equal(r.headers.get("x-mitrify-trail"), "free-hang%3Atimeout,free-ok%3A200");
    await new Promise((x) => setTimeout(x, 100));
    assert.ok(t.up.closed[0], "the silent request was cancelled at the provider");
    // It is left alone afterwards.
    const r2 = await chat(t.g.url, t.key, AUTO);
    assert.equal(r2.headers.get("x-mitrify-trail"), "free-ok%3A200");
    await r2.text();
    await t.close();
  });

  it("a PAID model's empty reply is NOT run again unless the owner allows it (MITRIFY_GATEWAY_RETRY_PAID=1)", async () => {
    const rules = { "paid-1": (_n: number, r: import("http").ServerResponse) => json(r, EMPTY) };
    const models: [string, number, number][] = [["paid-1", 0.1, 0.2], ["paid-2", 0.3, 0.4]];
    const strict = await setup(rules, models);
    const a = await chat(strict.g.url, strict.key, AUTO);
    assert.equal(a.status, 200);
    assert.equal(await a.text(), EMPTY, "passed on as it is");
    assert.deepEqual(strict.s.calls, { "paid-1": 1 }, "a paid job was not run twice");
    await strict.close();

    const lenient = await setup(rules, models, { MITRIFY_GATEWAY_RETRY_PAID: "1" });
    const b = await chat(lenient.g.url, lenient.key, AUTO);
    assert.equal(await b.text(), OK);
    assert.equal(b.headers.get("x-mitrify-trail"), "paid-1%3Aempty,paid-2%3A200");
    await lenient.close();
  });

  it("the last attempt is never held back, and a named call is passed on exactly as the model sent it", async () => {
    const t = await setup({ "free-empty": (_n, r) => json(r, EMPTY) }, [["free-empty", 0, 0]]);
    const auto = await chat(t.g.url, t.key, AUTO);
    assert.equal(auto.status, 200);
    assert.equal(await auto.text(), EMPTY, "nothing else to try: the model's own answer goes through");
    const named = await chat(t.g.url, t.key, '{"model":"free-empty","messages":[]}');
    assert.equal(await named.text(), EMPTY);
    assert.equal(named.headers.get("x-mitrify-trail"), null);
    await t.close();
  });
});


describe("only real chat models are chosen automatically", () => {
  const P = { prompt: "0", completion: "0" };
  it("a model that also writes audio or images, or lacks the usual chat settings, is not a chat model", () => {
    const m = parseModelList({
      data: [
        { id: "google/lyria-3-clip-preview", pricing: P, architecture: { input_modalities: ["text"], output_modalities: ["text", "audio"] }, supported_parameters: ["max_tokens"] },
        { id: "x/image-maker", pricing: P, architecture: { input_modalities: ["text"], output_modalities: ["image", "text"] } },
        { id: "x/task-only", pricing: P, architecture: { input_modalities: ["text"], output_modalities: ["text"] }, supported_parameters: ["response_format", "structured_outputs"] },
        { id: "x/real-chat", pricing: P, architecture: { input_modalities: ["text", "image"], output_modalities: ["text"] }, supported_parameters: ["max_tokens", "temperature", "tools"] },
        { id: "x/modality-only", pricing: P, architecture: { modality: "text->text" } },
        { id: "x/modality-audio", pricing: P, architecture: { modality: "text->text+audio" } },
        { id: "x/empty-params", pricing: P, architecture: { input_modalities: ["text"], output_modalities: ["text"] }, supported_parameters: [] },
        { id: "x/params-only", pricing: P, supported_parameters: ["temperature"] },
      ],
    });
    assert.deepEqual(
      m.map((x) => [x.id, x.chatCapable]),
      [["google/lyria-3-clip-preview", false], ["x/image-maker", false], ["x/task-only", false], ["x/real-chat", true], ["x/modality-only", true], ["x/modality-audio", false], ["x/empty-params", true], ["x/params-only", true]],
    );
  });

  it("stealth models and single-purpose endpoints are never chosen, even when the list calls them chat models", () => {
    const snap = buildSnapshot(
      [
        entry({ upstreamModel: "stealth/crouton-alpha", inputPerMTokUsd: 0, outputPerMTokUsd: 0 }),
        entry({ upstreamModel: "scaledown/extract", inputPerMTokUsd: 0.04, outputPerMTokUsd: 0 }),
        entry({ upstreamModel: "scaledown/summarize", inputPerMTokUsd: 0.04, outputPerMTokUsd: 0 }),
        entry({ upstreamModel: "acme/extractor-pro", inputPerMTokUsd: 0.05, outputPerMTokUsd: 0.05 }), // a real chat model whose name only contains the word
        entry({ upstreamModel: "acme/chat-1", inputPerMTokUsd: 0.06, outputPerMTokUsd: 0.06 }),
      ],
      or(),
      { input: 0, output: 0 },
      new Date(),
    );
    assert.deepEqual(snap.entries.map((e) => e.upstreamModel), ["acme/extractor-pro", "acme/chat-1"]);
  });

  it("among free models, those that take tools (general assistants) come first, then the longer context", () => {
    const snap = buildSnapshot(
      [
        entry({ upstreamModel: "f/plain-long", inputPerMTokUsd: 0, outputPerMTokUsd: 0, contextLength: 200000, supportsTools: false }),
        entry({ upstreamModel: "f/tools-short", inputPerMTokUsd: 0, outputPerMTokUsd: 0, contextLength: 16000, supportsTools: true }),
        entry({ upstreamModel: "f/tools-long", inputPerMTokUsd: 0, outputPerMTokUsd: 0, contextLength: 128000, supportsTools: true }),
      ],
      or(),
      { input: 0, output: 0 },
      new Date(),
    );
    assert.deepEqual(snap.entries.map((e) => e.upstreamModel), ["f/tools-long", "f/tools-short", "f/plain-long"]);
  });

  it("a model that failed is rested for 5 minutes, then 25", async () => {
    let now = Date.now();
    const up = await mockUpstream((_req, res) => (res.writeHead(502, { "content-type": "application/json" }), res.end('{"error":{"message":"Provider returned error"}}')));
    const gw = new Gateway(
      loadConfig(baseEnv({ MITRIFY_SURPLUS_API_KEY: UPSTREAM_KEY, MITRIFY_SURPLUS_BASE_URL: up.url, MITRIFY_SURPLUS_APPROVED: "1", MITRIFY_GATEWAY_MAX_ATTEMPTS: "2" })),
      new MemoryStore(),
      { now: () => now, log: () => {} },
    );
    await gw.start();
    const server = createServer((req, res) => void gw.handle(req, res));
    const url = await listen(server);
    await admin(url, "/admin/prices", { method: "PUT", body: [price("surplus", "free-a", 0, 0), price("surplus", "free-b", 0, 0)] });
    await admin(url, "/admin/catalog/refresh", { body: {} });
    const key = ((await (await admin(url, "/admin/keys", { body: { name: "k" } })).json()) as { key: string }).key;
    await (await chat(url, key, AUTO)).text();
    let cooling = (await (await admin(url, "/admin/status")).json()).cooling as { model: string; secondsLeft: number }[];
    assert.ok(cooling.length >= 1 && cooling.every((c) => c.secondsLeft === 300), JSON.stringify(cooling));
    server.closeAllConnections();
    server.close();
    await up.close();
  });
});

describe("applying new rules to models judged under old ones", () => {
  it("reads the lists again once, drops models that no longer qualify, and then leaves things alone", async () => {
    let listCalls = 0;
    const up = await mockUpstream((req, res) => {
      if (req.url === "/models") {
        listCalls++;
        res.writeHead(200, { "content-type": "application/json" });
        return void res.end(
          JSON.stringify({
            data: [
              { id: "v/chat-one", context_length: 64000, pricing: { prompt: "0", completion: "0" }, architecture: { input_modalities: ["text"], output_modalities: ["text"] }, supported_parameters: ["max_tokens"] },
              { id: "v/music-one", context_length: 64000, pricing: { prompt: "0", completion: "0" }, architecture: { input_modalities: ["text"], output_modalities: ["text", "audio"] } },
            ],
          }),
        );
      }
      okRes(res);
    });
    const store = new MemoryStore();
    // What an earlier version stored: the music model wrongly marked as a chat model.
    await store.upsertPrice(entry({ provider: "openrouter", upstreamModel: "v/music-one", inputPerMTokUsd: 0, outputPerMTokUsd: 0, chatCapable: true }));
    const g = await startGateway(baseEnv({ MITRIFY_OPENROUTER_API_KEY: UPSTREAM_KEY, MITRIFY_OPENROUTER_BASE_URL: up.url, MITRIFY_OPENROUTER_APPROVED: "1" }), store);
    await g.gw.refreshIfRulesChanged();
    assert.equal(listCalls, 1);
    const snap = await (await admin(g.url, "/admin/catalog")).json();
    assert.deepEqual(snap.entries.map((e: { upstreamModel: string }) => e.upstreamModel), ["v/chat-one"]);
    await g.gw.refreshIfRulesChanged();
    assert.equal(listCalls, 1, "remembered: not read again");
    await g.close();
    await up.close();
  });

  it("if the list cannot be read it is tried again next time, not remembered", async () => {
    let fail = true;
    let listCalls = 0;
    const up = await mockUpstream((req, res) => {
      if (req.url === "/models") {
        listCalls++;
        if (fail) return void (res.writeHead(500), res.end("boom"));
        res.writeHead(200, { "content-type": "application/json" });
        return void res.end(JSON.stringify({ data: [{ id: "v/chat-one", context_length: 64000, pricing: { prompt: "0", completion: "0" }, supported_parameters: ["max_tokens"] }] }));
      }
      okRes(res);
    });
    const g = await startGateway(baseEnv({ MITRIFY_OPENROUTER_API_KEY: UPSTREAM_KEY, MITRIFY_OPENROUTER_BASE_URL: up.url, MITRIFY_OPENROUTER_APPROVED: "1" }));
    await g.gw.refreshIfRulesChanged();
    assert.equal(listCalls, 1);
    fail = false;
    await g.gw.refreshIfRulesChanged();
    assert.equal(listCalls, 2, "tried again");
    assert.deepEqual((await (await admin(g.url, "/admin/catalog")).json()).entries.map((e: { upstreamModel: string }) => e.upstreamModel), ["v/chat-one"]);
    await g.close();
    await up.close();
  });
});
