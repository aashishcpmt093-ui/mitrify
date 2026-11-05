import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { loadConfig } from "../config";
import { parseModelList } from "../priceImport";
import { UPSTREAM_KEY, admin, baseEnv, chat, mockUpstream, sleep, startGateway } from "./helpers";

const SECRET = "portal-secret-0123456789-abcdefghijklmnopqrstuv";

// A model list in the shape OpenRouter documents: prices are USD per token, as strings.
const LIST = {
  data: [
    { id: "vendor/cheap-model", context_length: 32000, pricing: { prompt: "0.0000001", completion: "0.0000003", input_cache_read: "0.00000005" }, supported_parameters: ["tools", "temperature"] },
    { id: "vendor/pricey-model", context_length: 200000, pricing: { prompt: "0.000005", completion: "0.000015" }, supported_parameters: [] },
    { id: "openrouter/auto", pricing: { prompt: "-1", completion: "-1" } },
    { id: "vendor/free-model:free", pricing: { prompt: "0", completion: "0" } },
    { id: "bad id with spaces", pricing: { prompt: "0.1", completion: "0.1" } },
    { id: "vendor/no-pricing" },
    { id: "vendor/junk-price", pricing: { prompt: "abc", completion: "0.1" } },
    "not an object",
  ],
};

describe("price list parsing", () => {
  it("turns per-token prices into dollars per million tokens and skips what is not a real price", () => {
    const m = parseModelList(LIST);
    assert.deepEqual(m.map((x) => x.id), ["vendor/cheap-model", "vendor/pricey-model", "vendor/free-model:free"]);
    assert.equal(m[0].inputPerMTokUsd, 0.1);
    assert.equal(m[0].outputPerMTokUsd, 0.3);
    assert.equal(m[0].cachedInputPerMTokUsd, 0.05);
    assert.equal(m[0].contextLength, 32000);
    assert.equal(m[0].supportsTools, true);
    assert.equal(m[1].inputPerMTokUsd, 5);
    assert.equal(m[1].outputPerMTokUsd, 15);
    assert.equal(m[1].supportsTools, false);
    assert.equal(m[2].inputPerMTokUsd, 0);
  });
  it("copes with garbage", () => {
    assert.deepEqual(parseModelList(null), []);
    assert.deepEqual(parseModelList({ data: "x" }), []);
    assert.deepEqual(parseModelList({}), []);
  });
});

describe("OpenRouter in the gateway", () => {
  it("has its documented address built in and needs only a key and the owner's approval", () => {
    const c = loadConfig({ MITRIFY_OPENROUTER_API_KEY: "k", MITRIFY_OPENROUTER_APPROVED: "1" });
    const p = c.providers.find((x) => x.id === "openrouter")!;
    assert.equal(p.baseUrl, "https://openrouter.ai/api/v1");
    assert.equal(p.label, "OpenRouter");
    assert.equal(p.status, "active");
    assert.equal(p.resaleApproved, false, "reselling is never assumed");
    assert.equal(loadConfig({ MITRIFY_OPENROUTER_API_KEY: "k" }).providers.find((x) => x.id === "openrouter")!.status, "pending_approval");
  });

  describe("importing prices", () => {
    let up: Awaited<ReturnType<typeof mockUpstream>>;
    let g: Awaited<ReturnType<typeof startGateway>>;
    let listBehaviour: "ok" | "fail" | "junk" = "ok";
    let list = LIST;

    before(async () => {
      up = await mockUpstream((req, res) => {
        if (req.url === "/models") {
          if (listBehaviour === "fail") {
            res.writeHead(500);
            return void res.end("boom");
          }
          res.writeHead(200, { "content-type": "application/json" });
          return void res.end(listBehaviour === "junk" ? "<html>nope" : JSON.stringify(list));
        }
        res.writeHead(200, { "content-type": "application/json" });
        res.end('{"choices":[{"message":{"content":"ok"}}],"usage":{"prompt_tokens":1000,"completion_tokens":1000}}');
      });
      g = await startGateway(
        baseEnv({
          MITRIFY_PORTAL_SECRET: SECRET,
          MITRIFY_OPENROUTER_API_KEY: UPSTREAM_KEY,
          MITRIFY_OPENROUTER_BASE_URL: up.url,
          MITRIFY_OPENROUTER_APPROVED: "1",
        }),
      );
    });
    after(async () => {
      await g.close();
      await up.close();
    });

    const prices = async () => (await (await admin(g.url, "/admin/prices")).json()).prices as { upstreamModel: string; enabled: boolean; qualityPassed: boolean; inputPerMTokUsd: number; sourceUrl: string }[];

    it("brings new models in switched off, with the address and date they were read from", async () => {
      const r = await admin(g.url, "/admin/prices/import", { body: { provider: "openrouter" } });
      assert.equal(r.status, 200);
      const j = await r.json();
      assert.equal(j.added, 3);
      assert.equal(j.skipped, 5);
      const all = await prices();
      assert.equal(all.length, 3);
      assert.ok(all.every((p) => p.enabled === false && p.qualityPassed === false), "default deny");
      assert.ok(all.every((p) => p.sourceUrl === `${up.url}/models`));
      // Switched-off models cannot be called and are not listed.
      const key = ((await (await admin(g.url, "/admin/keys", { body: { name: "k" } })).json()) as { key: string }).key;
      assert.equal((await chat(g.url, key, '{"model":"vendor/cheap-model"}')).status, 404);
      const ids = (await (await fetch(g.url + "/v1/models", { headers: { authorization: `Bearer ${key}` } })).json()).data.map((m: { id: string }) => m.id);
      assert.deepEqual(ids, ["mitrify/auto-cheap"]);
    });

    it("the owner switches models on, and only a checked model reaches the cheapest pool", async () => {
      const key = ((await (await admin(g.url, "/admin/keys", { body: { name: "k2" } })).json()) as { key: string }).key;
      assert.equal((await admin(g.url, "/admin/prices/flags", { body: { provider: "openrouter", upstreamModel: "vendor/cheap-model", enabled: "yes" } })).status, 400);
      assert.equal((await admin(g.url, "/admin/prices/flags", { body: { provider: "openrouter", upstreamModel: "nope", enabled: true } })).status, 404);
      assert.equal((await admin(g.url, "/admin/prices/flags", { body: { provider: "openrouter", upstreamModel: "vendor/cheap-model", enabled: true } })).status, 200);
      const ok = await chat(g.url, key, '{"model":"vendor/cheap-model","messages":[]}');
      assert.equal(ok.status, 200);
      await ok.text();

      let snap = await (await admin(g.url, "/admin/catalog/refresh", { body: {} })).json();
      assert.deepEqual(snap.entries, [], "enabled but not quality-checked: not in the pool");
      await admin(g.url, "/admin/prices/flags", { body: { provider: "openrouter", upstreamModel: "vendor/cheap-model", qualityPassed: true } });
      snap = await (await admin(g.url, "/admin/catalog/refresh", { body: {} })).json();
      assert.deepEqual(snap.entries.map((e: { upstreamModel: string }) => e.upstreamModel), ["vendor/cheap-model"]);
      assert.equal(snap.entries[0].inputPerMTokUsd, 0.1);
    });

    it("importing again updates prices and keeps the owner's switches", async () => {
      list = { data: [{ ...LIST.data[0], pricing: { prompt: "0.0000002", completion: "0.0000004" } }, LIST.data[1]] } as typeof LIST;
      const r = await (await admin(g.url, "/admin/prices/import", { body: { provider: "openrouter" } })).json();
      assert.equal(r.updated, 2);
      assert.equal(r.added, 0);
      const cheap = (await prices()).find((p) => p.upstreamModel === "vendor/cheap-model")!;
      assert.equal(cheap.inputPerMTokUsd, 0.2);
      assert.equal(cheap.enabled, true);
      assert.equal(cheap.qualityPassed, true);
      list = LIST;
    });

    it("a failing or broken list changes nothing and says so", async () => {
      const before = JSON.stringify(await prices());
      listBehaviour = "fail";
      assert.equal((await admin(g.url, "/admin/prices/import", { body: { provider: "openrouter" } })).status, 502);
      listBehaviour = "junk";
      assert.equal((await admin(g.url, "/admin/prices/import", { body: { provider: "openrouter" } })).status, 502);
      listBehaviour = "ok";
      assert.equal(JSON.stringify(await prices()), before);
      assert.equal((await admin(g.url, "/admin/prices/import", { body: { provider: "surplus" } })).status, 400);
      assert.equal((await admin(g.url, "/admin/prices/import", { body: {} })).status, 400);
    });

    it("customers never reach OpenRouter unless the owner marks it approved for resale", async () => {
      const c = await (await admin(g.url, "/admin/customers", { body: { email: "cust@example.com", name: "C" } })).json();
      await admin(g.url, `/admin/customers/${c.customer.id}/credit`, { body: { amountUsd: 5 } });
      const login = await (await fetch(g.url + "/portal-api/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "cust@example.com", password: c.password }) })).json();
      const k = await (await fetch(g.url + "/portal-api/keys", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${login.token}` }, body: JSON.stringify({ name: "app" }) })).json();
      up.seen.length = 0;
      assert.equal((await chat(g.url, k.key, '{"model":"vendor/cheap-model","messages":[]}')).status, 404);
      assert.equal((await chat(g.url, k.key, '{"model":"mitrify/auto-cheap","messages":[]}')).status, 503);
      await sleep(20);
      assert.equal(up.seen.length, 0, "nothing reached OpenRouter for the customer");
    });
  });
});
