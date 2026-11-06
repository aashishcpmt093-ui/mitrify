#!/usr/bin/env node
// Sends many chat requests to a Mitrify gateway at once and prints what happened.
//
//   MITRIFY_API_KEY=... node scripts/load-test.mjs                  # 20 requests at once, to https://mitrify.com/v1
//   MITRIFY_API_KEY=... N=1000 CONFIRM=1 node scripts/load-test.mjs # a thousand at once
//
// Settings (environment):  MITRIFY_API_KEY (required, never printed)  MITRIFY_BASE_URL (default https://mitrify.com/v1)
//   N (requests, default 20)   CONCURRENCY (at once, default N)   STREAM=1 (ask for streaming)   MAX_TOKENS (default 8)
//   MODEL (default mitrify/auto-cheap)   CONFIRM=1 (needed above 50 requests)
//
// Every request spends a little: free models first, then the cheapest paid ones. Keep MAX_TOKENS small.
// The script prints only counts, times, status codes and the names of the models that answered.

const key = process.env.MITRIFY_API_KEY;
if (!key) {
  console.error("Set MITRIFY_API_KEY in the environment (the key is never printed). Nothing was sent.");
  process.exit(1);
}
const base = (process.env.MITRIFY_BASE_URL || "https://mitrify.com/v1").replace(/\/+$/, "");
const N = Math.max(1, Number(process.env.N) || 20);
const CONCURRENCY = Math.max(1, Number(process.env.CONCURRENCY) || N);
const STREAM = process.env.STREAM === "1";
const MAX_TOKENS = Math.max(1, Number(process.env.MAX_TOKENS) || 8);
const MODEL = process.env.MODEL || "mitrify/auto-cheap";
if (N > 50 && process.env.CONFIRM !== "1") {
  console.error(`That is ${N} requests, which spends real money on paid models. Run again with CONFIRM=1 if you mean it. Nothing was sent.`);
  process.exit(1);
}

const body = JSON.stringify({
  model: MODEL,
  messages: [{ role: "user", content: "Reply with the single word: ok" }],
  max_tokens: MAX_TOKENS,
  ...(STREAM ? { stream: true, stream_options: { include_usage: true } } : {}),
});

const statuses = new Map();
const models = new Map();
const attempts = new Map();
const errors = new Map();
const times = [];
let next = 0;

async function one() {
  const t0 = performance.now();
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body,
    });
    const text = await res.text(); // the whole answer, so the time includes the full reply
    statuses.set(res.status, (statuses.get(res.status) ?? 0) + 1);
    const m = decodeURIComponent(res.headers.get("x-mitrify-model") ?? "(none)");
    models.set(m, (models.get(m) ?? 0) + 1);
    const a = res.headers.get("x-mitrify-attempts") ?? "?";
    attempts.set(a, (attempts.get(a) ?? 0) + 1);
    if (!res.ok) {
      let msg = text.slice(0, 120);
      try {
        msg = JSON.parse(text)?.error?.message ?? msg;
      } catch {}
      errors.set(`${res.status} ${msg}`, (errors.get(`${res.status} ${msg}`) ?? 0) + 1);
    }
  } catch (e) {
    statuses.set("network error", (statuses.get("network error") ?? 0) + 1);
    errors.set(String(e?.cause?.code ?? e?.message ?? e).slice(0, 100), (errors.get(String(e?.cause?.code ?? e?.message ?? e).slice(0, 100)) ?? 0) + 1);
  }
  times.push(performance.now() - t0);
}

async function worker() {
  while (next < N) {
    next++;
    await one();
  }
}

const started = performance.now();
await Promise.all(Array.from({ length: Math.min(CONCURRENCY, N) }, worker));
const total = (performance.now() - started) / 1000;
times.sort((a, b) => a - b);
const pct = (p) => Math.round(times[Math.min(times.length - 1, Math.floor((p / 100) * times.length))] ?? 0);
const show = (m) => [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `  ${v} x ${k}`).join("\n");

console.log(`Sent ${N} requests, ${Math.min(CONCURRENCY, N)} at a time${STREAM ? ", streaming" : ""}, to ${base}`);
console.log(`Finished in ${total.toFixed(1)} s (${(N / total).toFixed(1)} requests per second)`);
console.log(`Time for one request: median ${pct(50)} ms, 95th ${pct(95)} ms, slowest ${pct(100)} ms`);
console.log("Status codes:\n" + show(statuses));
console.log("Answered by:\n" + show(models));
console.log("Attempts per request:\n" + show(attempts));
if (errors.size) console.log("Errors seen:\n" + show(errors));
process.exit(statuses.get(200) === N ? 0 : 2);
