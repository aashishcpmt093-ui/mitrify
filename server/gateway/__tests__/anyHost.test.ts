import assert from "node:assert/strict";
import { request, createServer } from "node:http";
import { describe, it } from "node:test";
import express from "express";
import { loadConfig } from "../config";
import { createGatewayMiddleware } from "../index";
import { MemoryStore } from "../store";
import { SETUP_CODE, UPSTREAM_KEY, baseEnv, listen, mockUpstream, price } from "./helpers";

const REPLY = '{"choices":[{"message":{"content":"namaste"}}],"usage":{"prompt_tokens":1000,"completion_tokens":1000}}';

/** A request with a Host header of our choosing (fetch cannot set one). */
function call(url: string, path: string, host: string, init: { method?: string; headers?: Record<string, string>; body?: string } = {}) {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const r = request(url + path, { method: init.method ?? "GET", headers: { host, ...init.headers } }, (res) => {
      let b = "";
      res.on("data", (c) => (b += c));
      res.on("end", () => resolve({ status: res.statusCode!, body: b }));
    });
    r.on("error", reject);
    r.end(init.body);
  });
}

describe("the API answers on the website's own address (https://mitrify.com/v1)", () => {
  it("/v1 works on any host with a key, while the admin paths and the marketplace stay where they were", async () => {
    const up = await mockUpstream((_req, res) => (res.writeHead(200, { "content-type": "application/json" }), res.end(REPLY)));
    const store = new MemoryStore();
    const app = express();
    app.use(
      createGatewayMiddleware({
        config: loadConfig(baseEnv({ MITRIFY_SURPLUS_API_KEY: UPSTREAM_KEY, MITRIFY_SURPLUS_BASE_URL: up.url, MITRIFY_SURPLUS_APPROVED: "1", MITRIFY_GATEWAY_HOST: "gateway.mitrify.com" })),
        store,
      }),
    );
    app.use(express.json());
    app.get("/", (_req, res) => res.send("marketplace home"));
    app.get("/healthz", (_req, res) => res.send("marketplace healthz"));
    app.all("/admin/keys", (_req, res) => res.send("marketplace admin page"));
    app.get("/v2/anything", (_req, res) => res.send("marketplace v2"));
    const server = createServer(app);
    const url = await listen(server);
    const json = { "content-type": "application/json" };
    const owner = { ...json, "x-mitrify-setup-code": SETUP_CODE };

    // Keys and prices are made on the gateway's own host, as before.
    await call(url, "/admin/prices", "gateway.mitrify.com", { method: "PUT", headers: owner, body: JSON.stringify([price("surplus", "m", 1, 2)]) });
    const made = await call(url, "/admin/keys", "gateway.mitrify.com", { method: "POST", headers: owner, body: JSON.stringify({ name: "navbharatai-chat" }) });
    const key = (JSON.parse(made.body) as { key: string }).key;

    // On the website's own host: no key, no answer.
    for (const [method, path] of [["GET", "/v1/models"], ["POST", "/v1/chat/completions"]] as const) {
      const r = await call(url, path, "mitrify.com", { method, headers: json, body: method === "POST" ? '{"model":"m"}' : undefined });
      assert.equal(r.status, 401, `${method} ${path} without a key`);
      assert.match(r.body, /"source":"mitrify"/);
    }
    // With the key, a normal OpenAI-style call works at https://<website>/v1.
    const ok = await call(url, "/v1/chat/completions", "mitrify.com", { method: "POST", headers: { ...json, authorization: `Bearer ${key}` }, body: '{"model":"m","messages":[]}' });
    assert.equal(ok.status, 200);
    assert.equal(ok.body, REPLY);
    const models = await call(url, "/v1/models", "mitrify.com", { headers: { authorization: `Bearer ${key}` } });
    assert.equal(models.status, 200);
    assert.ok(JSON.parse(models.body).data.some((d: { id: string }) => d.id === "m"));

    // Not exposed on the website's host: the admin paths and the health check belong to the marketplace there.
    assert.equal((await call(url, "/admin/keys", "mitrify.com", { method: "POST", headers: owner, body: "{}" })).body, "marketplace admin page");
    assert.equal((await call(url, "/healthz", "mitrify.com")).body, "marketplace healthz");
    assert.equal((await call(url, "/", "mitrify.com")).body, "marketplace home");
    assert.equal((await call(url, "/v2/anything", "mitrify.com")).body, "marketplace v2");
    // ...and the owner's tools stay behind the setup code even by the other route.
    assert.equal((await call(url, "/portal-api/owner/keys", "mitrify.com")).status, 401);
    server.closeAllConnections();
    server.close();
    await up.close();
  });

  it("the address shown to customers defaults to the one the page was opened on", () => {
    assert.equal(loadConfig({}).publicBaseUrl, null);
    assert.equal(loadConfig({ MITRIFY_GATEWAY_PUBLIC_URL: "https://mitrify.com/v1" }).publicBaseUrl, "https://mitrify.com/v1");
  });
});
