import { randomBytes } from "crypto";
import type { IncomingMessage, ServerResponse } from "http";
import bcrypt from "bcryptjs";
import type { Gateway } from "./gateway";
import { publicKey } from "./gateway";
import { BodyTooLargeError, clientIp, readRawBody, sendError, sendJson } from "./http";
import { bearerToken } from "./keys";
import { Lockout } from "./limits";
import type { CustomerRecord } from "./store";
import { signToken, verifyToken } from "./token";

// The API portal: accounts for the people the owner sells API access to.
//
//  * /portal-api/*  is what the customer's page (mitrify.com/?portal=api) calls: sign in, see balance,
//    create or revoke their own keys, see their own usage, change their password.
//  * /admin/customers/*  is for the owner (setup code): create accounts, add credit, switch off.
//
// There is no public sign-up. Only the owner can create an account, and a customer can only ever see
// and change what belongs to that customer.

const TOKEN_TTL_SEC = 12 * 3600;
const MIN_PASSWORD = 10;
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

export function publicCustomer(c: CustomerRecord) {
  return { id: c.id, email: c.email, name: c.name, balanceUsd: c.balanceUsd, createdAt: c.createdAt, disabledAt: c.disabledAt };
}

const normEmail = (v: unknown) => (typeof v === "string" ? v.trim().toLowerCase() : "");

export class PortalApi {
  private ipLock: Lockout;
  private emailLock: Lockout;
  // Compared against when the e-mail is unknown, so a wrong e-mail and a wrong password take the same time.
  private dummyHash = bcrypt.hashSync("not-a-real-password", 10);

  constructor(private gw: Gateway) {
    this.ipLock = new Lockout(gw.now, 10, 15 * 60_000, 1000, 60 * 60_000);
    this.emailLock = new Lockout(gw.now, 5, 15 * 60_000, 1000, 60 * 60_000);
  }

  private async body(req: IncomingMessage): Promise<Record<string, unknown> | null> {
    try {
      const raw = await readRawBody(req, 64 * 1024);
      const v = raw.length ? JSON.parse(raw.toString("utf8")) : {};
      return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
    } catch (e) {
      if (e instanceof BodyTooLargeError) return null;
      return null;
    }
  }

  // ── Customer side ──────────────────────────────────────────────────────────────────────────────

  async handle(req: IncomingMessage, res: ServerResponse, path: string): Promise<void> {
    const cfg = this.gw.config;
    if (!cfg.portalSecret) {
      return sendError(res, 503, "portal_disabled", cfg.portalProblem ?? "API portal accounts are off.");
    }
    const sub = path.slice("/portal-api".length) || "/";
    const method = req.method ?? "GET";
    const ip = clientIp(req, cfg.trustProxy);

    if (method === "POST" && sub === "/login") return this.login(req, res, ip);

    // The owner's tools, reachable from the portal page on any host. Same rules as /admin: the
    // setup code header, the lockout and the optional IP allowlist all apply.
    if (sub === "/owner" || sub.startsWith("/owner/")) {
      return this.gw.handleAdmin(req, res, "/admin" + sub.slice("/owner".length));
    }

    const token = bearerToken(req.headers.authorization);
    const id = token ? verifyToken(token, cfg.portalSecret, this.gw.now()) : null;
    const customer = id ? await this.gw.store.getCustomer(id) : null;
    if (!customer || customer.disabledAt) return sendError(res, 401, "not_signed_in", "Please sign in again.");

    const seg = sub.split("/").filter(Boolean);
    if (method === "GET" && sub === "/me") {
      return sendJson(res, 200, {
        ...publicCustomer(customer),
        apiBaseUrl: cfg.publicBaseUrl,
        markupPercent: cfg.resaleMarkupPercent,
        keyLimit: cfg.maxKeysPerCustomer,
      });
    }
    if (method === "GET" && sub === "/keys") {
      return sendJson(res, 200, { keys: (await this.gw.store.listClientsForCustomer(customer.id)).map(publicKey) });
    }
    if (method === "POST" && sub === "/keys") return this.createKey(req, res, customer, ip);
    if (method === "POST" && seg[0] === "keys" && seg[1] && seg[2] === "revoke") return this.revokeKey(res, customer, seg[1], ip);
    if (method === "GET" && sub === "/usage") return this.usage(req, res, customer);
    if (method === "POST" && sub === "/password") return this.changePassword(req, res, customer, ip);
    return sendError(res, 404, "not_found", "Unknown path.");
  }

  private async login(req: IncomingMessage, res: ServerResponse, ip: string) {
    const b = await this.body(req);
    const email = normEmail(b?.email);
    const password = typeof b?.password === "string" ? b.password : "";
    const wait = Math.max(this.ipLock.blocked(ip), email ? this.emailLock.blocked(email) : 0);
    if (wait > 0) {
      return sendError(res, 429, "locked_out", "Too many wrong tries. Please try again later.", { "retry-after": String(Math.ceil(wait / 1000)) });
    }
    const customer = email && EMAIL.test(email) && email.length <= 254 ? await this.gw.store.getCustomerByEmail(email) : null;
    // Always run one bcrypt comparison, whether or not the account exists.
    const ok = await bcrypt.compare(password.slice(0, 200), customer?.passwordHash ?? this.dummyHash);
    if (!customer || !ok || customer.disabledAt) {
      this.ipLock.fail(ip);
      if (email) this.emailLock.fail(email);
      await this.gw.audit("portal", "customer_login_failed", ip, {});
      return sendError(res, 401, "invalid_login", "Wrong email or password.");
    }
    this.ipLock.succeed(ip);
    this.emailLock.succeed(email);
    await this.gw.audit(`customer:${customer.id}`, "customer_login", ip, {});
    return sendJson(res, 200, { token: signToken(customer.id, this.gw.config.portalSecret!, TOKEN_TTL_SEC, this.gw.now()), customer: publicCustomer(customer) });
  }

  private async createKey(req: IncomingMessage, res: ServerResponse, customer: CustomerRecord, ip: string) {
    const b = await this.body(req);
    if (!b) return sendError(res, 400, "invalid_request", "The body must be JSON.");
    const name = typeof b.name === "string" ? b.name.trim() : "";
    if (!name || name.length > 60) return sendError(res, 400, "invalid_request", "Give the key a name of 1-60 characters.");
    const budget = b.dailyBudgetUsd === undefined || b.dailyBudgetUsd === null || b.dailyBudgetUsd === "" ? null : Number(b.dailyBudgetUsd);
    if (budget !== null && !(Number.isFinite(budget) && budget > 0 && budget <= 100_000)) {
      return sendError(res, 400, "invalid_request", "dailyBudgetUsd must be a number above 0, or left empty.");
    }
    const now = this.gw.now();
    const active = (await this.gw.store.listClientsForCustomer(customer.id)).filter(
      (k) => !k.revokedAt && (!k.expiresAt || k.expiresAt.getTime() > now),
    );
    if (active.length >= this.gw.config.maxKeysPerCustomer) {
      return sendError(res, 409, "key_limit", `You can have at most ${this.gw.config.maxKeysPerCustomer} active keys. Revoke one first.`);
    }
    const { record, key } = await this.gw.issueKey({
      name,
      scopes: ["chat:write", "models:read"],
      dailyBudgetUsd: budget,
      rpm: 120,
      expiresAt: new Date(now + 365 * 86400_000),
      rotatedFrom: null,
      customerId: customer.id,
      actor: `customer:${customer.id}`,
      ip,
    });
    return sendJson(res, 201, { ...publicKey(record), key, warning: "This is the only time the key is shown. Copy it now and keep it secret." });
  }

  private async revokeKey(res: ServerResponse, customer: CustomerRecord, keyId: string, ip: string) {
    const k = await this.gw.store.getClient(keyId);
    // A customer can only touch their own keys; anything else looks like it does not exist.
    if (!k || k.customerId !== customer.id) return sendError(res, 404, "not_found", "No such key.");
    await this.gw.store.updateClient(k.id, { revokedAt: new Date(this.gw.now()) });
    this.gw.invalidateCaches();
    await this.gw.audit(`customer:${customer.id}`, "key_revoked", ip, { id: k.id, keyPrefix: k.keyPrefix });
    return sendJson(res, 200, { id: k.id, revoked: true });
  }

  private async usage(req: IncomingMessage, res: ServerResponse, customer: CustomerRecord) {
    const url = new URL(req.url ?? "/", "http://portal.local");
    const hours = Math.min(Math.max(Number(url.searchParams.get("hours")) || 24, 1), 24 * 31);
    const keys = await this.gw.store.listClientsForCustomer(customer.id);
    const names = new Map(keys.map((k) => [k.id, k.name]));
    const rows = await this.gw.store.listUsageForClients(
      keys.map((k) => k.id),
      new Date(this.gw.now() - hours * 3600_000),
      200,
    );
    const charged = rows.reduce((s, r) => s + (r.billedCostUsd ?? 0), 0);
    return sendJson(res, 200, {
      hours,
      chargedUsd: Math.round(charged * 1e8) / 1e8,
      requestsWithUnknownCost: rows.filter((r) => r.billedCostUsd === null && r.httpStatus < 400).length,
      rows: rows.map((r) => ({
        requestId: r.requestId,
        at: r.createdAt,
        key: names.get(r.clientId) ?? "",
        provider: r.provider,
        model: r.model,
        mode: r.mode,
        outcome: r.outcome,
        inputTokens: r.inputTokens,
        outputTokens: r.outputTokens,
        cachedTokens: r.cachedTokens,
        chargedUsd: r.billedCostUsd,
        latencyMs: r.latencyMs,
      })),
    });
  }

  private async changePassword(req: IncomingMessage, res: ServerResponse, customer: CustomerRecord, ip: string) {
    const b = await this.body(req);
    const current = typeof b?.current === "string" ? b.current : "";
    const next = typeof b?.next === "string" ? b.next : "";
    if (!(await bcrypt.compare(current.slice(0, 200), customer.passwordHash))) {
      return sendError(res, 401, "invalid_login", "The current password is wrong.");
    }
    if (next.length < MIN_PASSWORD || next.length > 200) {
      return sendError(res, 400, "weak_password", `The new password must be ${MIN_PASSWORD}-200 characters.`);
    }
    await this.gw.store.updateCustomer(customer.id, { passwordHash: await bcrypt.hash(next, 10) });
    await this.gw.audit(`customer:${customer.id}`, "customer_password_changed", ip, {});
    return sendJson(res, 200, { changed: true });
  }

  // ── Owner side (already checked: setup code) ───────────────────────────────────────────────────

  async admin(req: IncomingMessage, res: ServerResponse, seg: string[], body: unknown, ip: string): Promise<void> {
    const method = req.method ?? "GET";
    const b = (body && typeof body === "object" && !Array.isArray(body) ? body : {}) as Record<string, unknown>;
    const store = this.gw.store;

    if (seg.length === 2 && method === "GET") {
      return sendJson(res, 200, { customers: (await store.listCustomers()).map(publicCustomer), markupPercent: this.gw.config.resaleMarkupPercent });
    }
    if (seg.length === 2 && method === "POST") {
      const email = normEmail(b.email);
      const name = typeof b.name === "string" ? b.name.trim() : "";
      if (!EMAIL.test(email) || email.length > 254) return sendError(res, 400, "invalid_request", "Send a valid email.");
      if (!name || name.length > 100) return sendError(res, 400, "invalid_request", "Send a name of 1-100 characters.");
      const given = typeof b.password === "string" ? b.password : null;
      if (given !== null && (given.length < MIN_PASSWORD || given.length > 200)) {
        return sendError(res, 400, "weak_password", `The password must be ${MIN_PASSWORD}-200 characters, or leave it out to generate one.`);
      }
      const password = given ?? randomBytes(12).toString("base64url");
      const c: CustomerRecord = {
        id: crypto.randomUUID(),
        email,
        name,
        passwordHash: await bcrypt.hash(password, 10),
        balanceUsd: 0,
        createdAt: new Date(this.gw.now()),
        disabledAt: null,
      };
      if (!(await store.createCustomer(c))) return sendError(res, 409, "email_taken", "That email already has an account.");
      await this.gw.audit("owner", "customer_created", ip, { id: c.id, email });
      return sendJson(res, 201, {
        customer: publicCustomer(c),
        ...(given === null ? { password, warning: "This password is shown only now. Give it to the customer; they can change it after signing in." } : {}),
      });
    }

    const id = seg[2];
    const action = seg[3];
    const customer = id ? await store.getCustomer(id) : null;
    if (!customer) return sendError(res, 404, "not_found", "No such customer.");

    if (action === "ledger" && method === "GET") {
      return sendJson(res, 200, { customer: publicCustomer(customer), entries: await store.listLedger(customer.id, 200) });
    }
    if ((action === "credit" || action === "adjust") && method === "POST") {
      const amount = typeof b.amountUsd === "number" ? b.amountUsd : NaN;
      const note = typeof b.note === "string" ? b.note.trim().slice(0, 200) : "";
      const okAmount = Number.isFinite(amount) && Math.abs(amount) <= 100_000 && (action === "credit" ? amount > 0 : amount !== 0);
      if (!okAmount) {
        return sendError(res, 400, "invalid_request", action === "credit" ? "amountUsd must be a number above 0 (up to 100000)." : "amountUsd must be a non-zero number (up to 100000 either way).");
      }
      const delta = Math.round(amount * 1e8) / 1e8;
      const after = await store.adjustBalance(customer.id, delta, action === "credit" ? "credit" : "adjust", "", note);
      await this.gw.audit("owner", action === "credit" ? "customer_credited" : "customer_adjusted", ip, { id: customer.id, amountUsd: delta, note });
      return sendJson(res, 200, { id: customer.id, balanceUsd: after });
    }
    if (action === "disable" && method === "POST") {
      if (typeof b.disabled !== "boolean") return sendError(res, 400, "invalid_request", 'Send {"disabled": true} or false.');
      await store.updateCustomer(customer.id, { disabledAt: b.disabled ? new Date(this.gw.now()) : null });
      await this.gw.audit("owner", b.disabled ? "customer_disabled" : "customer_enabled", ip, { id: customer.id });
      return sendJson(res, 200, { id: customer.id, disabled: b.disabled });
    }
    if (action === "password" && method === "POST") {
      const given = typeof b.password === "string" ? b.password : null;
      if (given !== null && (given.length < MIN_PASSWORD || given.length > 200)) {
        return sendError(res, 400, "weak_password", `The password must be ${MIN_PASSWORD}-200 characters, or leave it out to generate one.`);
      }
      const password = given ?? randomBytes(12).toString("base64url");
      await store.updateCustomer(customer.id, { passwordHash: await bcrypt.hash(password, 10) });
      await this.gw.audit("owner", "customer_password_reset", ip, { id: customer.id });
      return sendJson(res, 200, { id: customer.id, ...(given === null ? { password } : {}) });
    }
    return sendError(res, 404, "not_found", "Unknown admin path.");
  }
}
