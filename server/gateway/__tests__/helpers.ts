import { createServer, type IncomingMessage, type Server, type ServerResponse } from "http";
import type { AddressInfo } from "net";
import { loadConfig } from "../config";
import { Gateway } from "../gateway";
import { MemoryStore } from "../store";

export const SETUP_CODE = "test-setup-code-0123456789abcdef-XYZ";
export const UPSTREAM_KEY = "sk-upstream-SECRET-never-leak-123";
export const UPSTREAM_KEY_B = "sk-upstream-B-SECRET-never-leak-456";

export interface Seen {
  method: string;
  url: string;
  headers: IncomingMessage["headers"];
  body: Buffer;
}

export type Behaviour = (req: Seen, res: ServerResponse) => void | Promise<void>;

export async function listen(server: Server): Promise<string> {
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

/** A fake OpenAI-compatible provider that records what it received. */
export async function mockUpstream(behaviour: Behaviour) {
  const seen: Seen[] = [];
  const closed: boolean[] = [];
  const state = { behaviour };
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const s = { method: req.method!, url: req.url!, headers: req.headers, body: Buffer.concat(chunks) };
      seen.push(s);
      const idx = closed.length;
      closed.push(false);
      res.on("close", () => (closed[idx] = true));
      void state.behaviour(s, res);
    });
  });
  const url = await listen(server);
  return { url, seen, closed, state, close: () => new Promise<void>((r) => { server.closeAllConnections(); server.close(() => r()); }) };
}

export function baseEnv(extra: Record<string, string> = {}): Record<string, string> {
  return {
    MITRIFY_GATEWAY_ENABLED: "1",
    MITRIFY_GATEWAY_SETUP_CODE: SETUP_CODE,
    MITRIFY_GATEWAY_DAILY_BUDGET_USD: "10",
    MITRIFY_GATEWAY_ALLOW_HTTP_UPSTREAM: "1",
    // Tests use "surplus" as a stand-in provider that may have free models; the real rule has its own test.
    MITRIFY_SURPLUS_NO_FREE_MODELS: "0",
    // Older tests assume a paid request is never repeated; the real default (on) has its own tests.
    MITRIFY_GATEWAY_RETRY_PAID: "0",
    ...extra,
  };
}

export async function startGateway(env: Record<string, string>, store = new MemoryStore()) {
  const logs: string[] = [];
  const gw = new Gateway(loadConfig(env), store, { log: (m) => logs.push(m) });
  await gw.start();
  const server = createServer((req, res) => void gw.handle(req, res));
  const url = await listen(server);
  return {
    gw,
    store,
    url,
    logs,
    close: () => new Promise<void>((r) => { server.closeAllConnections(); server.close(() => r()); }),
  };
}

export function admin(url: string, path: string, init: { method?: string; body?: unknown; code?: string } = {}) {
  return fetch(url + path, {
    method: init.method ?? (init.body === undefined ? "GET" : "POST"),
    headers: { "x-mitrify-setup-code": init.code ?? SETUP_CODE, "content-type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

export async function createKey(url: string, body: Record<string, unknown> = { name: "navbharatai-chat" }) {
  const r = await admin(url, "/admin/keys", { body });
  if (r.status !== 201) throw new Error(`key creation failed: ${r.status} ${await r.text()}`);
  return (await r.json()) as { id: string; key: string };
}

export function price(provider: string, upstreamModel: string, input: number, output: number, extra: Record<string, unknown> = {}) {
  return {
    provider,
    upstreamModel,
    inputPerMTokUsd: input,
    outputPerMTokUsd: output,
    sourceUrl: `https://example.invalid/${provider}/pricing`,
    verifiedAt: new Date().toISOString(),
    qualityPassed: true,
    ...extra,
  };
}

export function chat(url: string, key: string, body: string | Buffer, headers: Record<string, string> = {}) {
  return fetch(url + "/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json", ...headers },
    body,
  });
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
