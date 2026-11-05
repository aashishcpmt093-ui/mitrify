import { randomUUID } from "crypto";
import type { IncomingMessage, ServerResponse } from "http";
import { AUTO_MODEL, buildSnapshot, validatePriceInput } from "./catalog";
import { describeProvider, type GatewayConfig, type ProviderConfig } from "./config";
import { BodyTooLargeError, clientIp, readRawBody, sendError, sendJson } from "./http";
import { JsonScanError, findTopLevelModel, replaceTopLevelModel } from "./jsonModel";
import { bearerToken, displayPrefix, generateApiKey, hashApiKey, looksLikeApiKey, setupCodeMatches } from "./keys";
import { CircuitBreaker, Lockout, QueueFullError, QueueTimeoutError, RateLimiter, Semaphore } from "./limits";
import { PortalApi } from "./portal";
import { importPrices, supportsImport } from "./priceImport";
import type { CatalogSnapshot, ClientRecord, CustomerRecord, GatewayStore, PriceEntry, UsageRow } from "./store";
import { SseWatcher, costUsd, readUsage, type Usage } from "./usage";

// The Mitrify AI Gateway.
//
//   NavBharatAI ──(Mitrify key)──▶ gateway.mitrify.com ──(provider key)──▶ provider ──▶ model
//
// Rules this file keeps:
//  * The request body is forwarded as raw bytes. Pinned mode sends it unchanged; auto-cheap mode
//    changes only the bytes of the top-level "model" value (see jsonModel.ts).
//  * The response body is passed back unchanged and in order, chunk by chunk, never buffered whole
//    when streaming, never cached.
//  * No client header is forwarded upstream. Only the provider's key, content-type and accept go.
//  * A request is retried on another pool model only when the provider refused it before any work
//    could have started (connection refused, 429, 503). Never after a response has begun.
//  * A stream that breaks midway is cut off (the connection is closed without a clean end), so the
//    client can never mistake a partial answer for a finished one.

export const SCOPES = ["chat:write", "models:read"] as const;

const RETRYABLE_STATUS = new Set([429, 503]);
// Connection-level failures where the provider certainly never received the request.
const RETRYABLE_NET = new Set(["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "UND_ERR_CONNECT_TIMEOUT"]);

type Log = (msg: string) => void;

interface Candidate {
  provider: ProviderConfig;
  upstreamModel: string;
  price: { inputPerMTokUsd: number; outputPerMTokUsd: number; cachedInputPerMTokUsd: number | null } | null;
}

interface AuthedClient {
  record: ClientRecord;
  /** The API portal customer who owns the key, when there is one. */
  customer: CustomerRecord | null;
}

function startOfUtcDay(t: number) {
  const d = new Date(t);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function publicClient(c: ClientRecord) {
  return {
    id: c.id,
    name: c.name,
    keyPrefix: c.keyPrefix,
    scopes: c.scopes,
    dailyBudgetUsd: c.dailyBudgetUsd,
    rpm: c.rpm,
    createdAt: c.createdAt,
    expiresAt: c.expiresAt,
    revokedAt: c.revokedAt,
    rotatedFrom: c.rotatedFrom,
    lastUsedAt: c.lastUsedAt,
    customerId: c.customerId,
  };
}

export function publicKey(c: ClientRecord) {
  return publicClient(c);
}

export interface GatewayDeps {
  fetch?: typeof fetch;
  now?: () => number;
  log?: Log;
}

export class Gateway {
  readonly portal: PortalApi;
  readonly semaphores = new Map<string, Semaphore>();
  readonly breakers = new Map<string, CircuitBreaker>();
  private rate: RateLimiter;
  private lockout: Lockout;
  private fetchImpl: typeof fetch;
  readonly now: () => number;
  readonly log: Log;
  private inflight = 0;
  private snapshot: CatalogSnapshot | null = null;
  private clientCache = new Map<string, { at: number; rec: ClientRecord | null }>();
  private settingsCache: { at: number; kill: boolean; disabled: Set<string> } | null = null;
  private spend: { day: number; at: number; global: number; perClient: Map<string, number> } | null = null;
  private pricesCache: { at: number; list: PriceEntry[] } | null = null;

  constructor(
    readonly config: GatewayConfig,
    readonly store: GatewayStore,
    deps: GatewayDeps = {},
  ) {
    this.fetchImpl = deps.fetch ?? fetch;
    this.now = deps.now ?? Date.now;
    this.log = deps.log ?? ((m) => console.log(`[gateway] ${m}`));
    this.portal = new PortalApi(this);
    this.rate = new RateLimiter(this.now);
    this.lockout = new Lockout(this.now);
    for (const p of config.providers) {
      this.semaphores.set(p.id, new Semaphore(p.maxConcurrency, p.maxQueue, config.queueTimeoutMs));
      this.breakers.set(p.id, new CircuitBreaker(5, 60_000, this.now));
    }
  }

  async start() {
    await this.store.init();
    this.snapshot = await this.store.latestSnapshot();
  }

  // ── Routing of incoming requests ───────────────────────────────────────────────────────────────

  async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const path = (req.url ?? "/").split("?")[0];
    try {
      if (path === "/healthz") return sendJson(res, 200, { status: "ok" });
      if (path.startsWith("/v1/")) return await this.handleClient(req, res, path);
      if (path === "/portal-api" || path.startsWith("/portal-api/")) return await this.portal.handle(req, res, path);
      if (path === "/admin" || path.startsWith("/admin/")) return await this.handleAdmin(req, res, path);
      return sendError(res, 404, "not_found", "Unknown path.");
    } catch (err) {
      this.log(`internal error on ${req.method} ${path}: ${(err as Error)?.name ?? "Error"}`);
      if (!res.headersSent) sendError(res, 500, "internal_error", "Internal gateway error.");
      else res.destroy();
    }
  }

  // ── Switches, clients, budgets ─────────────────────────────────────────────────────────────────

  private async switches() {
    const t = this.now();
    if (this.settingsCache && t - this.settingsCache.at < 5_000) return this.settingsCache;
    const kill = (await this.store.getSetting<boolean>("kill.global")) === true;
    const disabled = new Set<string>();
    for (const p of this.config.providers) {
      if ((await this.store.getSetting<boolean>(`provider.disabled.${p.id}`)) === true) disabled.add(p.id);
    }
    this.settingsCache = { at: t, kill, disabled };
    return this.settingsCache;
  }

  invalidateCaches() {
    this.settingsCache = null;
    this.clientCache.clear();
    this.pricesCache = null;
  }

  private async findClient(hash: string) {
    const t = this.now();
    const hit = this.clientCache.get(hash);
    if (hit && t - hit.at < 10_000) return hit.rec;
    const rec = await this.store.findClientByHash(hash);
    this.clientCache.set(hash, { at: t, rec });
    if (this.clientCache.size > 1000) this.clientCache.clear();
    return rec;
  }

  private async spentToday(clientId: string) {
    const t = this.now();
    const day = startOfUtcDay(t).getTime();
    if (!this.spend || this.spend.day !== day || t - this.spend.at > 15_000) {
      const since = new Date(day);
      const global = await this.store.spentSince(since);
      const perClient = new Map<string, number>();
      if (this.spend && this.spend.day === day) {
        for (const id of this.spend.perClient.keys()) perClient.set(id, await this.store.spentSince(since, id));
      }
      this.spend = { day, at: t, global, perClient };
    }
    if (!this.spend.perClient.has(clientId)) {
      this.spend.perClient.set(clientId, await this.store.spentSince(new Date(day), clientId));
    }
    return { global: this.spend.global, client: this.spend.perClient.get(clientId)! };
  }

  private addSpend(clientId: string, usd: number) {
    if (!this.spend || usd <= 0) return;
    this.spend.global += usd;
    this.spend.perClient.set(clientId, (this.spend.perClient.get(clientId) ?? 0) + usd);
  }

  private async prices() {
    const t = this.now();
    if (this.pricesCache && t - this.pricesCache.at < 30_000) return this.pricesCache.list;
    const list = await this.store.listPrices();
    this.pricesCache = { at: t, list };
    return list;
  }

  private providerUsable(p: ProviderConfig, disabled: Set<string>) {
    return p.status === "active" && !disabled.has(p.id);
  }

  // ── Client API (/v1/*) ─────────────────────────────────────────────────────────────────────────

  private async authenticateClient(req: IncomingMessage, res: ServerResponse, scope: string): Promise<AuthedClient | null> {
    const sw = await this.switches();
    if (this.config.envKillSwitch || sw.kill) {
      sendError(res, 503, "gateway_disabled", "The Mitrify gateway is switched off by the owner.");
      return null;
    }
    const token = bearerToken(req.headers.authorization);
    if (!token || !looksLikeApiKey(token)) {
      sendError(res, 401, "invalid_api_key", "Send a Mitrify API key as: Authorization: Bearer mtf_live_...");
      return null;
    }
    const rec = await this.findClient(hashApiKey(token));
    const t = this.now();
    if (!rec || rec.revokedAt || (rec.expiresAt && rec.expiresAt.getTime() <= t)) {
      sendError(res, 401, "invalid_api_key", "This API key is not valid, has expired or was revoked.");
      return null;
    }
    if (!rec.scopes.includes(scope)) {
      sendError(res, 403, "insufficient_scope", `This API key does not have the ${scope} permission.`);
      return null;
    }
    let customer: CustomerRecord | null = null;
    if (rec.customerId) {
      customer = await this.store.getCustomer(rec.customerId);
      if (!customer || customer.disabledAt) {
        sendError(res, 403, "account_disabled", "This account is switched off. Please contact the owner.");
        return null;
      }
    }
    const r = this.rate.take(rec.id, rec.rpm);
    if (!r.ok) {
      sendError(res, 429, "rate_limited", "Too many requests for this API key.", { "retry-after": String(r.retryAfterSec) });
      return null;
    }
    if (!rec.lastUsedAt || t - rec.lastUsedAt.getTime() > 60_000) {
      rec.lastUsedAt = new Date(t);
      this.store.updateClient(rec.id, { lastUsedAt: rec.lastUsedAt }).catch(() => {});
    }
    return { record: rec, customer };
  }

  private async handleClient(req: IncomingMessage, res: ServerResponse, path: string) {
    if (path === "/v1/models") {
      if (req.method !== "GET") return sendError(res, 405, "method_not_allowed", "Use GET.");
      const c = await this.authenticateClient(req, res, "models:read");
      if (!c) return;
      return this.listModels(res, !!c.customer);
    }
    if (path === "/v1/chat/completions") {
      if (req.method !== "POST") return sendError(res, 405, "method_not_allowed", "Use POST.");
      const c = await this.authenticateClient(req, res, "chat:write");
      if (!c) return;
      return this.chat(req, res, c);
    }
    return sendError(res, 404, "not_found", "Only /v1/chat/completions and /v1/models are available in this pilot.");
  }

  private async listModels(res: ServerResponse, resale: boolean) {
    const sw = await this.switches();
    const usable = new Map(
      this.config.providers.filter((p) => this.providerUsable(p, sw.disabled) && (!resale || p.resaleApproved)).map((p) => [p.id, p]),
    );
    const data = (await this.prices())
      .filter((p) => p.enabled && usable.has(p.provider))
      .map((p) => ({ id: p.upstreamModel, object: "model", owned_by: p.provider, mitrify_provider: p.provider }));
    data.unshift({ id: AUTO_MODEL, object: "model", owned_by: "mitrify", mitrify_provider: "auto" });
    sendJson(res, 200, { object: "list", data });
  }

  private async chat(req: IncomingMessage, res: ServerResponse, client: AuthedClient) {
    const started = this.now();
    const requestId = randomUUID();
    const ct = String(req.headers["content-type"] ?? "");
    if (!/^application\/json\b/i.test(ct)) return sendError(res, 415, "unsupported_media_type", "Send Content-Type: application/json.");

    let raw: Buffer;
    try {
      raw = await readRawBody(req, this.config.maxBodyBytes);
    } catch (e) {
      if (e instanceof BodyTooLargeError) {
        return sendError(res, 413, "request_too_large", `The request body is larger than ${this.config.maxBodyBytes} bytes.`);
      }
      throw e;
    }

    // Read-only look at the request. This parsed copy is never forwarded.
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw.toString("utf8"));
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
      // Rejects bodies the two parsers could read differently (for example two "model" keys).
      findTopLevelModel(raw);
    } catch (e) {
      const msg = e instanceof JsonScanError ? e.message : "the body is not valid JSON";
      return sendError(res, 400, "invalid_request", `Invalid request: ${msg}.`);
    }
    const model = parsed.model;
    if (typeof model !== "string" || !model) return sendError(res, 400, "invalid_request", 'The request needs a "model" string.');
    const stream = parsed.stream === true;
    if (stream && this.config.requireStreamUsage) {
      const so = parsed.stream_options as { include_usage?: unknown } | undefined;
      if (!so || so.include_usage !== true) {
        return sendError(
          res,
          400,
          "usage_required",
          'Streaming requests must include "stream_options": {"include_usage": true} so the cost can be billed. Mitrify does not add it for you.',
        );
      }
    }

    // Budgets: refuse before anything is sent.
    if (this.config.globalDailyBudgetUsd === null) {
      return sendError(res, 503, "budget_not_configured", "The owner has not set MITRIFY_GATEWAY_DAILY_BUDGET_USD yet.");
    }
    const spent = await this.spentToday(client.record.id);
    if (spent.global >= this.config.globalDailyBudgetUsd) {
      return sendError(res, 429, "budget_exceeded", "Today's gateway budget is used up.", { "retry-after": "3600" });
    }
    if (client.record.dailyBudgetUsd !== null && spent.client >= client.record.dailyBudgetUsd) {
      return sendError(res, 429, "budget_exceeded", "Today's budget for this API key is used up.", { "retry-after": "3600" });
    }

    // A customer needs credit left. (Requests already running can take it slightly below zero.)
    if (client.customer && client.customer.balanceUsd <= 0) {
      return sendError(res, 402, "insufficient_balance", "No credit left on this account. Please ask the owner to add credit.");
    }

    // Choose the route before forwarding. It does not change while the request runs.
    const mode: UsageRow["mode"] = model === AUTO_MODEL ? "auto-cheap" : "pinned";
    const route = await this.route(mode, model, stream, req.headers["x-mitrify-provider"], !!client.customer);
    if ("error" in route) return sendError(res, route.status, route.code, route.error);

    if (this.inflight >= this.config.maxInflight) {
      return sendError(res, 503, "gateway_busy", "The gateway is at its connection limit, try again shortly.", { "retry-after": "5" });
    }
    this.inflight++;
    try {
      await this.forward({ req, res, client, raw, requestId, model, mode, stream, started, candidates: route.candidates });
    } finally {
      this.inflight--;
    }
  }

  private async route(
    mode: UsageRow["mode"],
    model: string,
    stream: boolean,
    providerHeader: string | string[] | undefined,
    resaleOnly: boolean,
  ): Promise<{ candidates: Candidate[] } | { status: number; code: string; error: string }> {
    const sw = await this.switches();
    const byId = new Map(this.config.providers.map((p) => [p.id, p]));

    if (mode === "auto-cheap") {
      const snap = this.snapshot;
      if (!snap || snap.entries.length === 0) {
        return { status: 503, code: "pool_empty", error: "The cheapest-model pool is empty. The owner must add verified prices." };
      }
      const candidates: Candidate[] = [];
      for (const e of snap.entries) {
        const p = byId.get(e.provider);
        if (!p || !this.providerUsable(p, sw.disabled)) continue;
        if (resaleOnly && !p.resaleApproved) continue;
        if (stream && !e.supportsStreaming) continue;
        if (!this.breakers.get(p.id)!.available()) continue;
        candidates.push({ provider: p, upstreamModel: e.upstreamModel, price: e });
        if (candidates.length >= this.config.maxAttempts) break;
      }
      if (candidates.length === 0) {
        return { status: 503, code: "no_provider_available", error: "No model in today's pool is available right now." };
      }
      return { candidates };
    }

    // Pinned: the exact model the client named, at a provider that lists it. No fallback.
    const wanted = typeof providerHeader === "string" ? providerHeader.trim().toLowerCase() : null;
    if (wanted && !byId.has(wanted)) return { status: 400, code: "unknown_provider", error: `Unknown provider "${wanted}".` };
    const matches = (await this.prices()).filter(
      (p) =>
        p.enabled &&
        p.upstreamModel === model &&
        (!wanted || p.provider === wanted) &&
        byId.has(p.provider) &&
        this.providerUsable(byId.get(p.provider)!, sw.disabled) &&
        (!resaleOnly || byId.get(p.provider)!.resaleApproved),
    );
    if (matches.length === 0) {
      return { status: 404, code: "model_not_available", error: `Model "${model}" is not enabled at any active provider.` };
    }
    if (matches.length > 1) {
      return {
        status: 400,
        code: "ambiguous_model",
        error: `Model "${model}" is offered by ${matches.map((m) => m.provider).join(", ")}. Send the X-Mitrify-Provider header to choose one.`,
      };
    }
    const m = matches[0];
    return { candidates: [{ provider: byId.get(m.provider)!, upstreamModel: m.upstreamModel, price: m }] };
  }

  private async forward(o: {
    req: IncomingMessage;
    res: ServerResponse;
    client: AuthedClient;
    raw: Buffer;
    requestId: string;
    model: string;
    mode: UsageRow["mode"];
    stream: boolean;
    started: number;
    candidates: Candidate[];
  }) {
    const { req, res, client, raw, requestId, mode } = o;
    const clientGone = new AbortController();
    res.on("close", () => {
      if (!res.writableFinished) clientGone.abort();
    });
    req.on("error", () => clientGone.abort());

    let attempts = 0;
    let lastError: { status: number; code: string; message: string; retryAfter?: number } | null = null;

    for (let i = 0; i < o.candidates.length; i++) {
      const cand = o.candidates[i];
      const isLast = i === o.candidates.length - 1;
      const breaker = this.breakers.get(cand.provider.id)!;
      if (!breaker.allow()) {
        lastError = { status: 503, code: "provider_unavailable", message: "The provider is temporarily unavailable." };
        continue;
      }

      let release: () => void;
      try {
        release = await this.semaphores.get(cand.provider.id)!.acquire(clientGone.signal);
      } catch (e) {
        breaker.release(); // nothing was sent: give back a half-open trial, count nothing
        if (e instanceof QueueFullError || e instanceof QueueTimeoutError) {
          lastError = { status: 429, code: "provider_busy", message: "The provider is at its concurrency limit.", retryAfter: e.retryAfterSec };
          continue;
        }
        return this.record(o, cand, attempts, 499, "cancelled", null, null);
      }

      attempts++;
      const body = mode === "auto-cheap" ? replaceTopLevelModel(raw, cand.upstreamModel) : raw;
      const upstream = new AbortController();
      let abortReason: "client" | "first_byte_timeout" | "idle_timeout" | "total_timeout" | null = null;
      const abort = (why: NonNullable<typeof abortReason>) => {
        if (!abortReason) abortReason = why;
        upstream.abort();
      };
      const onClientGone = () => abort("client");
      clientGone.signal.addEventListener("abort", onClientGone);
      const totalTimer = setTimeout(() => abort("total_timeout"), this.config.totalTimeoutMs);
      let timer = setTimeout(() => abort("first_byte_timeout"), this.config.firstByteTimeoutMs);
      const cleanup = () => {
        clearTimeout(timer);
        clearTimeout(totalTimer);
        clientGone.signal.removeEventListener("abort", onClientGone);
        release();
      };

      let up: Response;
      try {
        up = await this.fetchImpl(`${cand.provider.baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${cand.provider.apiKey}`,
            "content-type": "application/json",
            accept: o.stream ? "text/event-stream" : "application/json",
            "accept-encoding": "identity",
            "user-agent": "mitrify-gateway/1",
          },
          body,
          signal: upstream.signal,
          redirect: "error",
        });
      } catch (e) {
        cleanup();
        if (abortReason === "client") return this.record(o, cand, attempts, 499, "cancelled", null, null);
        breaker.failure();
        const code = ((e as { cause?: { code?: string } })?.cause?.code ?? "") as string;
        const timedOut = abortReason === "first_byte_timeout" || abortReason === "total_timeout";
        // Only failures where the provider certainly never received the request may move on.
        if (!timedOut && RETRYABLE_NET.has(code) && !isLast) {
          lastError = { status: 502, code: "upstream_unreachable", message: "Could not reach the provider." };
          continue;
        }
        const status = timedOut ? 504 : 502;
        sendError(
          res,
          status,
          timedOut ? "upstream_timeout" : "upstream_unreachable",
          timedOut ? "The provider did not answer in time." : "Could not reach the provider.",
          this.routeHeaders(requestId, cand, mode, attempts),
        );
        return this.record(o, cand, attempts, status, timedOut ? "upstream_timeout" : "upstream_error", null, null);
      }

      if (RETRYABLE_STATUS.has(up.status) && !isLast) {
        // Refused before generation started: safe to try the next model in the pool.
        if (up.status === 503) breaker.failure();
        else breaker.success();
        await up.body?.cancel().catch(() => {});
        cleanup();
        lastError = { status: up.status, code: "upstream_refused", message: `The provider answered ${up.status}.` };
        continue;
      }

      // Committed: this response goes back to the client as it is.
      const firstByteMs = this.now() - o.started;
      const headers: Record<string, string> = this.routeHeaders(requestId, cand, mode, attempts);
      const upCt = up.headers.get("content-type");
      if (upCt) headers["content-type"] = upCt;
      headers["cache-control"] = up.headers.get("cache-control") ?? "no-store";
      const upReqId = up.headers.get("x-request-id");
      if (upReqId && /^[\x21-\x7e]{1,200}$/.test(upReqId)) headers["x-upstream-request-id"] = upReqId;
      const retryAfter = up.headers.get("retry-after");
      if (retryAfter && /^[\x21-\x7e ]{1,64}$/.test(retryAfter)) headers["retry-after"] = retryAfter;
      const sse = !!upCt && /^text\/event-stream/i.test(upCt);
      if (sse) headers["x-accel-buffering"] = "no";
      res.writeHead(up.status, headers);
      if (sse) res.flushHeaders();

      const watcher = sse ? new SseWatcher() : null;
      const copy: Buffer[] = [];
      let copySize = 0;
      let outcome = "completed";
      clearTimeout(timer);
      timer = setTimeout(() => abort("idle_timeout"), this.config.idleTimeoutMs);

      try {
        if (up.body) {
          const reader = up.body.getReader();
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            clearTimeout(timer);
            timer = setTimeout(() => abort("idle_timeout"), this.config.idleTimeoutMs);
            if (watcher) watcher.feed(value);
            else if (copySize < 32 * 1024 * 1024) {
              copy.push(Buffer.from(value));
              copySize += value.length;
            }
            if (!res.write(value)) {
              await new Promise<void>((resolve) => {
                const done = () => {
                  res.off("drain", done);
                  res.off("close", done);
                  resolve();
                };
                res.on("drain", done);
                res.on("close", done);
              });
            }
            if (clientGone.signal.aborted) throw new Error("client gone");
          }
        }
      } catch {
        outcome = abortReason === "client" || clientGone.signal.aborted ? "cancelled" : "failed_midstream";
      }
      cleanup();

      if (outcome !== "completed") {
        if (outcome === "failed_midstream") breaker.failure();
        // Close without a clean end so the client cannot take a partial answer as complete.
        res.destroy();
        this.log(`request ${requestId} ${outcome}${abortReason ? ` (${abortReason})` : ""} at ${cand.provider.id}`);
        let usage: Usage | null = null;
        if (watcher) {
          watcher.end();
          usage = watcher.usage;
        }
        return this.record(o, cand, attempts, up.status, outcome, usage, firstByteMs);
      }

      res.end();
      let usage: Usage | null = null;
      if (watcher) {
        watcher.end();
        usage = watcher.usage;
        if (up.ok && !watcher.sawDone && !watcher.sawFinishReason) outcome = "ended_without_done";
      } else if (up.ok) {
        try {
          usage = readUsage(JSON.parse(Buffer.concat(copy).toString("utf8")));
        } catch {
          usage = null;
        }
      }
      if (!up.ok) outcome = "upstream_error";
      if (up.status >= 500) breaker.failure();
      else breaker.success();
      return this.record(o, cand, attempts, up.status, outcome, usage, firstByteMs);
    }

    // Every candidate refused before starting.
    const err = lastError ?? { status: 503, code: "no_provider_available", message: "No provider is available right now." };
    sendError(res, err.status, err.code, err.message, err.retryAfter ? { "retry-after": String(err.retryAfter) } : {});
    const last = o.candidates[o.candidates.length - 1];
    return this.record(o, last, attempts, err.status, "rejected", null, null);
  }

  private routeHeaders(requestId: string, cand: Candidate, mode: string, attempts: number): Record<string, string> {
    return {
      "x-mitrify-request-id": requestId,
      "x-mitrify-provider": cand.provider.id,
      "x-mitrify-model": encodeURIComponent(cand.upstreamModel),
      "x-mitrify-mode": mode,
      "x-mitrify-attempts": String(attempts),
    };
  }

  private async record(
    o: { client: AuthedClient; requestId: string; model: string; mode: UsageRow["mode"]; started: number },
    cand: Candidate,
    attempts: number,
    httpStatus: number,
    outcome: string,
    usage: Usage | null,
    firstByteMs: number | null,
  ) {
    const est = usage && cand.price ? costUsd(usage, cand.price) : null;
    const row: UsageRow = {
      requestId: o.requestId,
      clientId: o.client.record.id,
      provider: cand.provider.id,
      model: cand.upstreamModel,
      requestedModel: o.model,
      mode: o.mode,
      httpStatus,
      outcome,
      inputTokens: usage?.inputTokens ?? null,
      outputTokens: usage?.outputTokens ?? null,
      cachedTokens: usage?.cachedTokens ?? null,
      usageSource: usage ? "upstream" : "missing",
      estimatedCostUsd: est,
      reconciledCostUsd: null,
      billedCostUsd: null,
      currency: "USD",
      billingStatus: est === null ? "unknown" : "estimated",
      latencyMs: this.now() - o.started,
      firstByteMs,
      attempts,
      createdAt: new Date(this.now()),
    };
    if (est) this.addSpend(row.clientId, est);
    // Portal customers pay the listed price plus the explicit markup (0% unless the owner sets one).
    // A request whose cost is unknown is not charged; it is marked unknown for the owner to settle.
    const customer = o.client.customer;
    if (customer && est !== null) {
      row.billedCostUsd = Math.round(est * (1 + this.config.resaleMarkupPercent / 100) * 1e8) / 1e8;
    }
    this.log(
      `${row.requestId} client=${o.client.record.name} ${row.provider}/${row.model} status=${httpStatus} ${outcome} ` +
        `in=${row.inputTokens ?? "?"} out=${row.outputTokens ?? "?"} cost=${est ?? "unknown"} ${row.latencyMs}ms`,
    );
    try {
      await this.store.insertUsage(row);
    } catch (e) {
      this.log(`could not save usage for ${row.requestId}: ${(e as Error).message}`);
    }
    if (customer && row.billedCostUsd) {
      try {
        const left = await this.store.adjustBalance(customer.id, -row.billedCostUsd, "debit", row.requestId, "");
        if (left === null) this.log(`customer ${customer.id} not found when charging ${row.requestId}`);
      } catch (e) {
        this.log(`could not charge ${row.requestId}: ${(e as Error).message}`);
      }
    }
  }

  // ── Catalog ────────────────────────────────────────────────────────────────────────────────────

  async refreshCatalog(): Promise<CatalogSnapshot> {
    const t = this.now();
    const prices = await this.store.listPrices();
    const totals = await this.store.tokenTotalsSince(new Date(t - 7 * 24 * 60 * 60 * 1000));
    const snap = await this.store.saveSnapshot(buildSnapshot(prices, this.config, totals, new Date(t)));
    this.snapshot = snap;
    this.pricesCache = null;
    this.log(`catalog snapshot #${snap.id}: ${snap.entries.length} models in the pool (${snap.weights.source} weights)`);
    return snap;
  }

  /** Refreshes when there is no snapshot or the latest is a day old. Keeps the old one on failure. */
  async refreshCatalogIfDue() {
    const latest = this.snapshot;
    if (latest && this.now() - latest.createdAt.getTime() < 24 * 60 * 60 * 1000) return;
    // Fresh prices first (providers that publish them), then the pool. Either step failing keeps the old data.
    for (const p of this.config.providers) {
      if (!supportsImport(p.id) || p.status !== "active") continue;
      try {
        const r = await importPrices(p, this.store, this.fetchImpl, new Date(this.now()));
        this.log(`prices from ${p.id}: ${r.added} new, ${r.updated} updated`);
      } catch (e) {
        this.log(`price import from ${p.id} failed, keeping the old prices: ${(e as Error).message}`);
      }
    }
    try {
      await this.refreshCatalog();
    } catch (e) {
      this.log(`catalog refresh failed, keeping the previous pool: ${(e as Error).message}`);
    }
  }

  async probeProvider(p: ProviderConfig): Promise<{ ok: boolean; status: number | null; detail: string }> {
    if (p.status !== "active" || !p.healthPath) return { ok: false, status: null, detail: "no active probe configured" };
    try {
      const r = await this.fetchImpl(`${p.baseUrl}${p.healthPath.startsWith("/") ? "" : "/"}${p.healthPath}`, {
        headers: { authorization: `Bearer ${p.apiKey}`, "user-agent": "mitrify-gateway/1" },
        signal: AbortSignal.timeout(10_000),
        redirect: "error",
      });
      await r.body?.cancel().catch(() => {});
      if (r.ok) this.breakers.get(p.id)!.success();
      else if (r.status >= 500) this.breakers.get(p.id)!.failure();
      return { ok: r.ok, status: r.status, detail: r.ok ? "ok" : "provider answered with an error" };
    } catch {
      this.breakers.get(p.id)!.failure();
      return { ok: false, status: null, detail: "provider unreachable" };
    }
  }

  // ── Admin API (/admin/*) — needs the owner's setup code ────────────────────────────────────────

  async handleAdmin(req: IncomingMessage, res: ServerResponse, path: string) {
    const ip = clientIp(req, this.config.trustProxy);
    if (this.config.adminIps.length && !this.config.adminIps.includes(ip.toLowerCase())) {
      return sendError(res, 403, "forbidden", "Admin access is not allowed from this address.");
    }
    if (!this.config.setupCode) {
      return sendError(res, 503, "admin_disabled", this.config.setupCodeProblem ?? "Admin is disabled.");
    }
    const wait = this.lockout.blocked(ip);
    if (wait > 0) {
      return sendError(res, 429, "locked_out", "Too many wrong setup codes. Try again later.", {
        "retry-after": String(Math.ceil(wait / 1000)),
      });
    }
    const presented = req.headers["x-mitrify-setup-code"];
    if (!setupCodeMatches(typeof presented === "string" ? presented : undefined, this.config.setupCode)) {
      this.lockout.fail(ip);
      await this.audit("unknown", "admin_auth_failed", ip, { path });
      return sendError(res, 401, "invalid_setup_code", "Send the owner's setup code in the X-Mitrify-Setup-Code header.");
    }
    this.lockout.succeed(ip);

    // "Try a message": the owner sends a normal chat request through the real gateway path (routing,
    // budgets, usage and cost are all recorded), as a built-in test client. The body is not read here;
    // chat() reads it as raw bytes, exactly as for any other client.
    if (req.method === "POST" && path === "/admin/try") {
      const client = await this.ownerTestClient(ip);
      await this.audit("owner", "try_message", ip, {});
      return this.chat(req, res, { record: client, customer: null });
    }

    let body: unknown = null;
    if (req.method === "POST" || req.method === "PUT") {
      try {
        const raw = await readRawBody(req, 256 * 1024);
        body = raw.length ? JSON.parse(raw.toString("utf8")) : {};
      } catch {
        return sendError(res, 400, "invalid_request", "The body must be JSON, at most 256 KB.");
      }
    }
    const url = new URL(req.url ?? "/", "http://gateway.local");
    const seg = path.split("/").filter(Boolean); // ["admin", ...]
    const m = `${req.method} /${seg.slice(1).join("/")}`;

    if (m === "GET /status") return sendJson(res, 200, await this.status());
    if (m === "GET /keys") return sendJson(res, 200, { keys: (await this.store.listClients()).map(publicClient) });
    if (m === "POST /keys") return this.createKey(res, body, ip);
    if (seg[1] === "keys" && seg[2] && seg[3] === "revoke" && req.method === "POST") return this.revokeKey(res, seg[2], ip);
    if (seg[1] === "keys" && seg[2] && seg[3] === "rotate" && req.method === "POST") return this.rotateKey(res, seg[2], ip);
    if (m === "POST /kill") {
      const on = (body as { enabled?: unknown })?.enabled;
      if (typeof on !== "boolean") return sendError(res, 400, "invalid_request", 'Send {"enabled": true} to switch the gateway off, false to switch it on.');
      await this.store.setSetting("kill.global", on);
      this.invalidateCaches();
      await this.audit("owner", on ? "kill_switch_on" : "kill_switch_off", ip, {});
      return sendJson(res, 200, { killSwitch: on });
    }
    if (seg[1] === "providers" && seg[2] && seg[3] === "disable" && req.method === "POST") {
      const p = this.config.providers.find((x) => x.id === seg[2]);
      const on = (body as { disabled?: unknown })?.disabled;
      if (!p) return sendError(res, 404, "not_found", "Unknown provider.");
      if (typeof on !== "boolean") return sendError(res, 400, "invalid_request", 'Send {"disabled": true} or false.');
      await this.store.setSetting(`provider.disabled.${p.id}`, on);
      this.invalidateCaches();
      await this.audit("owner", on ? "provider_disabled" : "provider_enabled", ip, { provider: p.id });
      return sendJson(res, 200, { provider: p.id, disabled: on });
    }
    if (seg[1] === "providers" && seg[2] && seg[3] === "health" && req.method === "POST") {
      const p = this.config.providers.find((x) => x.id === seg[2]);
      if (!p) return sendError(res, 404, "not_found", "Unknown provider.");
      return sendJson(res, 200, { provider: p.id, ...(await this.probeProvider(p)) });
    }
    if (m === "GET /prices") return sendJson(res, 200, { prices: await this.store.listPrices() });
    if (m === "PUT /prices") {
      const items = Array.isArray(body) ? body : [body];
      const saved: string[] = [];
      for (const item of items) {
        const v = validatePriceInput(item);
        if (v.error) return sendError(res, 400, "invalid_price", `${v.error}. Nothing after entry ${saved.length + 1} was saved.`);
        if (!this.config.providers.some((p) => p.id === v.entry!.provider)) {
          return sendError(res, 400, "invalid_price", `Unknown provider "${v.entry!.provider}".`);
        }
        await this.store.upsertPrice({ ...v.entry!, updatedAt: new Date(this.now()) });
        saved.push(`${v.entry!.provider}/${v.entry!.upstreamModel}`);
      }
      this.pricesCache = null;
      await this.audit("owner", "prices_updated", ip, { entries: saved });
      return sendJson(res, 200, { saved, note: "Run POST /admin/catalog/refresh to rebuild today's pool now." });
    }
    if (m === "POST /prices/import") {
      const id = typeof (body as { provider?: unknown })?.provider === "string" ? (body as { provider: string }).provider : "";
      const p = this.config.providers.find((x) => x.id === id);
      if (!p || !supportsImport(p.id)) return sendError(res, 400, "invalid_request", "That provider has no price list to import. Add its prices by hand.");
      try {
        const r = await importPrices(p, this.store, this.fetchImpl, new Date(this.now()));
        this.pricesCache = null;
        await this.audit("owner", "prices_imported", ip, { provider: p.id, added: r.added, updated: r.updated });
        return sendJson(res, 200, { ...r, note: "New models are switched off. Switch on the ones you want, then rebuild the pool." });
      } catch (e) {
        return sendError(res, 502, "import_failed", (e as Error).message);
      }
    }
    if (m === "POST /prices/flags") {
      const b = (body ?? {}) as Record<string, unknown>;
      const cur = (await this.store.listPrices()).find((x) => x.provider === b.provider && x.upstreamModel === b.upstreamModel);
      if (!cur) return sendError(res, 404, "not_found", "No such price entry.");
      for (const k of ["enabled", "qualityPassed"] as const) {
        if (b[k] !== undefined && typeof b[k] !== "boolean") return sendError(res, 400, "invalid_request", `${k} must be true or false.`);
      }
      const next = {
        ...cur,
        enabled: typeof b.enabled === "boolean" ? b.enabled : cur.enabled,
        qualityPassed: typeof b.qualityPassed === "boolean" ? b.qualityPassed : cur.qualityPassed,
        updatedAt: new Date(this.now()),
      };
      await this.store.upsertPrice(next);
      this.pricesCache = null;
      await this.audit("owner", "price_flags_changed", ip, { provider: cur.provider, model: cur.upstreamModel, enabled: next.enabled, qualityPassed: next.qualityPassed });
      return sendJson(res, 200, { provider: cur.provider, upstreamModel: cur.upstreamModel, enabled: next.enabled, qualityPassed: next.qualityPassed });
    }
    if (m === "POST /catalog/refresh") {
      const snap = await this.refreshCatalog();
      await this.audit("owner", "catalog_refreshed", ip, { snapshot: snap.id });
      return sendJson(res, 200, snap);
    }
    if (m === "GET /catalog") return sendJson(res, 200, this.snapshot ?? { entries: [], note: "no snapshot yet" });
    if (m === "GET /usage") {
      const hours = Math.min(Math.max(Number(url.searchParams.get("hours")) || 24, 1), 24 * 31);
      const since = new Date(this.now() - hours * 3600_000);
      const rows = await this.store.listUsage(since, 500);
      const known = rows.filter((r) => r.billingStatus !== "unknown");
      return sendJson(res, 200, {
        since,
        totalKnownCostUsd: Math.round(known.reduce((s, r) => s + (r.reconciledCostUsd ?? r.estimatedCostUsd ?? 0), 0) * 1e8) / 1e8,
        requestsWithUnknownCost: rows.length - known.length,
        markup: "0%",
        rows,
      });
    }
    if (seg[1] === "usage" && seg[2] && seg[3] === "reconcile" && req.method === "POST") {
      const cost = (body as { costUsd?: unknown })?.costUsd;
      if (typeof cost !== "number" || !Number.isFinite(cost) || cost < 0) {
        return sendError(res, 400, "invalid_request", 'Send {"costUsd": <the provider\'s billed amount>}.');
      }
      const ok = await this.store.reconcileUsage(seg[2], cost);
      if (!ok) return sendError(res, 404, "not_found", "No such request id.");
      this.spend = null;
      await this.audit("owner", "usage_reconciled", ip, { requestId: seg[2], costUsd: cost });
      return sendJson(res, 200, { requestId: seg[2], reconciledCostUsd: cost });
    }
    if (seg[1] === "customers") return this.portal.admin(req, res, seg, body, ip);
    if (m === "GET /audit") return sendJson(res, 200, { events: await this.store.listAudit(200) });
    return sendError(res, 404, "not_found", "Unknown admin path.");
  }

  private async status() {
    const sw = await this.switches();
    const day = startOfUtcDay(this.now());
    return {
      enabled: this.config.enabled,
      killSwitch: { env: this.config.envKillSwitch, admin: sw.kill },
      setupCodeConfigured: !!this.config.setupCode,
      dailyBudgetUsd: this.config.globalDailyBudgetUsd,
      spentTodayUsd: await this.store.spentSince(day),
      inflight: this.inflight,
      providers: this.config.providers.map((p) => ({
        ...describeProvider(p),
        disabledByAdmin: sw.disabled.has(p.id),
        circuit: this.breakers.get(p.id)!.state,
        inUse: this.semaphores.get(p.id)!.inUse,
        queued: this.semaphores.get(p.id)!.queued,
      })),
      catalog: this.snapshot
        ? { snapshot: this.snapshot.id, createdAt: this.snapshot.createdAt, models: this.snapshot.entries.length }
        : null,
    };
  }

  /** The built-in client behind "Try a message". Its key is never shown or kept: it can only be used from here. */
  private async ownerTestClient(ip: string): Promise<ClientRecord> {
    const name = "owner-test (page)";
    const found = (await this.store.listClients()).find((c) => c.name === name && !c.revokedAt && c.customerId === null);
    if (found) return found;
    const { record } = await this.issueKey({
      name,
      scopes: ["chat:write"],
      dailyBudgetUsd: null,
      rpm: 60,
      expiresAt: null,
      rotatedFrom: null,
      customerId: null,
      actor: "owner",
      ip,
    });
    return record;
  }

  /** Creates and stores a key. The key itself is returned once and never stored. */
  async issueKey(o: {
    name: string;
    scopes: string[];
    dailyBudgetUsd: number | null;
    rpm: number;
    expiresAt: Date | null;
    rotatedFrom: string | null;
    customerId: string | null;
    actor: string;
    ip: string;
  }): Promise<{ record: ClientRecord; key: string }> {
    const key = generateApiKey();
    const record: ClientRecord = {
      id: randomUUID(),
      name: o.name,
      keyHash: hashApiKey(key),
      keyPrefix: displayPrefix(key),
      scopes: o.scopes,
      dailyBudgetUsd: o.dailyBudgetUsd,
      rpm: o.rpm,
      createdAt: new Date(this.now()),
      expiresAt: o.expiresAt,
      revokedAt: null,
      rotatedFrom: o.rotatedFrom,
      lastUsedAt: null,
      customerId: o.customerId,
    };
    await this.store.createClient(record);
    await this.audit(o.actor, o.rotatedFrom ? "key_rotated" : "key_created", o.ip, {
      id: record.id,
      name: o.name,
      keyPrefix: record.keyPrefix,
      customerId: o.customerId,
    });
    return { record, key };
  }

  private async createKey(res: ServerResponse, body: unknown, ip: string, rotatedFrom: ClientRecord | null = null) {
    const b = (body ?? {}) as Record<string, unknown>;
    const name = rotatedFrom?.name ?? (typeof b.name === "string" ? b.name.trim() : "");
    if (!name || name.length > 100) return sendError(res, 400, "invalid_request", 'Send {"name": "navbharatai-chat"} (1-100 characters).');
    const scopes = rotatedFrom?.scopes ?? (Array.isArray(b.scopes) ? b.scopes : [...SCOPES]);
    if (!scopes.length || scopes.some((s) => !(SCOPES as readonly string[]).includes(s as string))) {
      return sendError(res, 400, "invalid_request", `scopes may contain only: ${SCOPES.join(", ")}.`);
    }
    const budget = rotatedFrom ? rotatedFrom.dailyBudgetUsd : b.dailyBudgetUsd === undefined || b.dailyBudgetUsd === null ? null : Number(b.dailyBudgetUsd);
    if (budget !== null && !(Number.isFinite(budget) && budget >= 0)) return sendError(res, 400, "invalid_request", "dailyBudgetUsd must be a number >= 0.");
    const rpm = rotatedFrom?.rpm ?? (b.rpm === undefined ? 600 : Number(b.rpm));
    if (!Number.isInteger(rpm) || rpm < 1 || rpm > 100_000) return sendError(res, 400, "invalid_request", "rpm must be a whole number from 1 to 100000.");
    const days = rotatedFrom ? null : b.expiresInDays === undefined ? 365 : Number(b.expiresInDays);
    if (days !== null && !(Number.isFinite(days) && days > 0 && days <= 3650)) return sendError(res, 400, "invalid_request", "expiresInDays must be 1-3650.");

    const { record, key } = await this.issueKey({
      name,
      scopes: scopes as string[],
      dailyBudgetUsd: budget,
      rpm,
      expiresAt: rotatedFrom ? rotatedFrom.expiresAt : new Date(this.now() + days! * 86400_000),
      rotatedFrom: rotatedFrom?.id ?? null,
      customerId: rotatedFrom?.customerId ?? null,
      actor: "owner",
      ip,
    });
    return sendJson(res, 201, {
      ...publicClient(record),
      key,
      warning: "This is the only time the key is shown. Store it in NavBharatAI's server settings, never in an app or browser.",
    });
  }

  private async revokeKey(res: ServerResponse, id: string, ip: string) {
    const c = await this.store.getClient(id);
    if (!c) return sendError(res, 404, "not_found", "No such key.");
    await this.store.updateClient(id, { revokedAt: new Date(this.now()) });
    this.invalidateCaches();
    await this.audit("owner", "key_revoked", ip, { id, name: c.name, keyPrefix: c.keyPrefix });
    return sendJson(res, 200, { id, revoked: true });
  }

  private async rotateKey(res: ServerResponse, id: string, ip: string) {
    const c = await this.store.getClient(id);
    if (!c || c.revokedAt) return sendError(res, 404, "not_found", "No such active key.");
    const graceEnd = new Date(this.now() + this.config.keyRotationGraceHours * 3600_000);
    const oldEnd = c.expiresAt && c.expiresAt < graceEnd ? c.expiresAt : graceEnd;
    await this.store.updateClient(id, { expiresAt: oldEnd });
    this.invalidateCaches();
    return this.createKey(res, {}, ip, c);
  }

  async audit(actor: string, action: string, ip: string, detail: Record<string, unknown>) {
    try {
      await this.store.insertAudit({ at: new Date(this.now()), actor, action, ip, detail });
    } catch (e) {
      this.log(`could not write audit event ${action}: ${(e as Error).message}`);
    }
  }
}
