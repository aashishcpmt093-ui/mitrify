import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import { UPSTREAM_KEY, admin, baseEnv, chat, createKey, mockUpstream, price, startGateway } from "./helpers";

// A reply must reach the client whole, however long it is or however slowly it arrives. The gateway adds no
// length limit of its own and does not cut or reorder anything.

const WORDS = Array.from({ length: 4000 }, (_, i) => `word${i}`);
const FULL = WORDS.join(" ");

function sse(deltas: string[], finish = "stop") {
  const events = deltas.map((d) => `data: ${JSON.stringify({ choices: [{ delta: { content: d } }] })}\n\n`);
  events.push(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: finish }] })}\n\n`);
  events.push(`data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 5, completion_tokens: deltas.length } })}\n\n`);
  events.push("data: [DONE]\n\n");
  return events;
}
const textOf = (body: string) =>
  body
    .split("\n")
    .filter((l) => l.startsWith("data: {"))
    .map((l) => JSON.parse(l.slice(6)).choices?.[0]?.delta?.content ?? "")
    .join("");

async function setup(model: string, inP: number, outP: number, handler: Parameters<typeof mockUpstream>[0]) {
  const up = await mockUpstream(handler);
  const g = await startGateway(baseEnv({ MITRIFY_SURPLUS_API_KEY: UPSTREAM_KEY, MITRIFY_SURPLUS_BASE_URL: up.url, MITRIFY_SURPLUS_APPROVED: "1", MITRIFY_SURPLUS_NO_FREE_MODELS: "0" }));
  await admin(g.url, "/admin/prices", { method: "PUT", body: [price("surplus", model, inP, outP, { enabled: true })] });
  await admin(g.url, "/admin/catalog/refresh", { body: {} });
  const key = (await createKey(g.url)).key;
  return { up, g, key, close: async () => (await g.close(), await up.close()) };
}

describe("long and slow replies arrive whole", () => {
  for (const [label, model, inP, outP] of [["paid model", "m-paid", 0.1, 0.2], ["free model (reply is checked before it is passed on)", "m-free", 0, 0]] as const) {
    it(`${label}: a long plain reply, byte for byte`, async () => {
      const body = JSON.stringify({ choices: [{ message: { content: FULL }, finish_reason: "stop" }], usage: { prompt_tokens: 5, completion_tokens: 4000 } });
      const t = await setup(model, inP, outP, (_req, res) => (res.writeHead(200, { "content-type": "application/json" }), res.end(body)));
      try {
        for (const m of [model, "mitrify/auto-cheap"]) {
          const r = await chat(t.g.url, t.key, JSON.stringify({ model: m, messages: [] }));
          assert.equal(r.status, 200);
          assert.equal(await r.text(), body);
        }
      } finally {
        await t.close();
      }
    });

    it(`${label}: a long streamed reply, every word in order`, async () => {
      const events = sse(WORDS.map((w) => w + " "));
      const t = await setup(model, inP, outP, (_req, res) => {
        res.writeHead(200, { "content-type": "text/event-stream" });
        res.end(events.join(""));
      });
      try {
        for (const m of [model, "mitrify/auto-cheap"]) {
          const r = await chat(t.g.url, t.key, JSON.stringify({ model: m, stream: true, stream_options: { include_usage: true }, messages: [] }));
          const text = await r.text();
          assert.equal(text, events.join(""));
          assert.equal(textOf(text), WORDS.map((w) => w + " ").join(""));
        }
      } finally {
        await t.close();
      }
    });

    it(`${label}: a slow stream (words trickle in over several seconds) is not cut`, async () => {
      const slow = WORDS.slice(0, 40).map((w) => w + " ");
      const events = sse(slow);
      const t = await setup(model, inP, outP, async (_req, res) => {
        res.writeHead(200, { "content-type": "text/event-stream" });
        for (const e of events) {
          res.write(e);
          await new Promise((r) => setTimeout(r, 120));
        }
        res.end();
      });
      try {
        const r = await chat(t.g.url, t.key, JSON.stringify({ model: "mitrify/auto-cheap", stream: true, stream_options: { include_usage: true }, messages: [] }));
        const text = await r.text();
        assert.equal(text, events.join(""));
        assert.equal(textOf(text), slow.join(""));
      } finally {
        await t.close();
      }
    });
  }
});

describe("huge replies arrive whole", () => {
  const sha = (b: string | Buffer) => createHash("sha256").update(b).digest("hex");

  async function huge(model: string, run: (t: Awaited<ReturnType<typeof setup>>) => Promise<void>, handler: Parameters<typeof mockUpstream>[0]) {
    const t = await setup(model, 0.1, 0.2, handler);
    try {
      await run(t);
    } finally {
      await t.close();
    }
  }

  it("a one-million-word plain reply (about 7 MB), byte for byte, and billed from its usage", async () => {
    const text = Array.from({ length: 1_000_000 }, (_, i) => `w${i}`).join(" ");
    const body = JSON.stringify({ choices: [{ message: { content: text }, finish_reason: "stop" }], usage: { prompt_tokens: 5, completion_tokens: 1_000_000 } });
    const want = sha(body);
    await huge("m-big", async (t) => {
      const r = await chat(t.g.url, t.key, '{"model":"m-big","messages":[]}');
      assert.equal(r.status, 200);
      assert.equal(sha(Buffer.from(await r.arrayBuffer())), want);
      assert.equal(t.g.store.usage.at(-1)!.outputTokens, 1_000_000);
    }, (_req, res) => (res.writeHead(200, { "content-type": "application/json" }), res.end(body)));
  });

  it("a one-million-word streamed reply (100,000 events), byte for byte and in order", async () => {
    const events: string[] = [];
    for (let i = 0; i < 100_000; i++) events.push(`data: {"choices":[{"delta":{"content":"${Array.from({ length: 10 }, (_, j) => `w${i * 10 + j}`).join(" ")} "}}]}\n\n`);
    events.push('data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n', 'data: {"choices":[],"usage":{"prompt_tokens":5,"completion_tokens":1000000}}\n\n', "data: [DONE]\n\n");
    const all = events.join("");
    const want = sha(all);
    await huge("m-big", async (t) => {
      const r = await chat(t.g.url, t.key, '{"model":"mitrify/auto-cheap","stream":true,"stream_options":{"include_usage":true},"messages":[]}');
      assert.equal(r.status, 200);
      assert.equal(sha(Buffer.from(await r.arrayBuffer())), want);
      assert.equal(t.g.store.usage.at(-1)!.outputTokens, 1_000_000);
      assert.equal(t.g.store.usage.at(-1)!.outcome, "completed");
    }, async (_req, res) => {
      res.writeHead(200, { "content-type": "text/event-stream" });
      for (let i = 0; i < events.length; i += 2000) {
        if (!res.write(events.slice(i, i + 2000).join(""))) await new Promise((r) => res.once("drain", r));
      }
      res.end();
    });
  });

  it("a plain reply bigger than the 32 MB the gateway keeps a copy of for billing still arrives whole", async () => {
    const big = "x".repeat(40 * 1024 * 1024);
    const body = `{"choices":[{"message":{"content":"${big}"},"finish_reason":"stop"}],"usage":{"prompt_tokens":5,"completion_tokens":10000000}}`;
    const want = sha(body);
    await huge("m-big", async (t) => {
      const r = await chat(t.g.url, t.key, '{"model":"m-big","messages":[]}');
      assert.equal(r.status, 200);
      assert.equal(sha(Buffer.from(await r.arrayBuffer())), want);
    }, (_req, res) => (res.writeHead(200, { "content-type": "application/json" }), res.end(body)));
  });
});
