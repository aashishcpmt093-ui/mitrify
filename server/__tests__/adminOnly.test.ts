import assert from "node:assert/strict";
import { describe, it } from "node:test";
import express from "express";
import session from "express-session";
import { createServer } from "http";
import type { AddressInfo } from "net";
import { adminOnlyEnabled, adminOnlyGate, blockWhileAdminOnly, safeEqual } from "../adminOnly";

async function start() {
  const app = express();
  app.use(session({ secret: "test-secret", resave: false, saveUninitialized: false }));
  app.use(adminOnlyGate);
  app.use(express.json());
  app.post("/api/admin/login", (req, res) => {
    (req.session as any).adminAuth = req.body?.password === "right";
    res.json({ ok: true });
  });
  app.get("/api/admin/check", (req, res) => res.json({ isAdmin: (req.session as any).adminAuth === true }));
  app.get("/health", (_req, res) => res.send("ok"));
  app.get("/admin/login", (_req, res) => res.send("login page"));
  app.get("/assets/app.js", (_req, res) => res.send("js"));
  app.get("/favicon.ico", (_req, res) => res.send("icon"));
  app.get("/", (_req, res) => res.send("home"));
  app.get("/api/profiles/me", (_req, res) => res.json({ secret: "profile" }));
  app.post("/api/jobs", (_req, res) => res.json({ created: true }));
  app.get("/admin/dashboard", (_req, res) => res.send("dashboard"));
  app.use("/api/clinic-ai", blockWhileAdminOnly, (_req, res) => res.json({ ai: true }));
  const server = createServer(app);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { url, close: () => { server.closeAllConnections(); server.close(); } };
}

describe("owner-only gate", () => {
  it("sends visitors to the admin login and refuses their API calls", async () => {
    const s = await start();
    const page = await fetch(s.url + "/", { redirect: "manual" });
    assert.equal(page.status, 302);
    assert.equal(page.headers.get("location"), "/admin/login");
    assert.equal((await fetch(s.url + "/admin/dashboard", { redirect: "manual" })).status, 302);
    const api = await fetch(s.url + "/api/profiles/me");
    assert.equal(api.status, 403);
    assert.ok(!(await api.text()).includes("profile"));
    assert.equal((await fetch(s.url + "/api/jobs", { method: "POST", body: "{}", headers: { "content-type": "application/json" } })).status, 403);
    assert.equal((await fetch(s.url + "/random", { method: "POST" })).status, 403);
    s.close();
  });

  it("keeps the sign-in page, its files and the health check open", async () => {
    const s = await start();
    for (const p of ["/admin/login", "/assets/app.js", "/favicon.ico", "/health"]) {
      assert.equal((await fetch(s.url + p, { redirect: "manual" })).status, 200, p);
    }
    assert.equal((await fetch(s.url + "/api/admin/check")).status, 200);
    s.close();
  });

  it("does not let a file extension trick open a private path", async () => {
    const s = await start();
    for (const p of ["/api/profiles/me.js", "/api/profiles/me/x.png", "/admin/dashboard.css", "/index.html", "/assets"]) {
      const r = await fetch(s.url + p, { redirect: "manual" });
      assert.notEqual(r.status, 200, p);
    }
    s.close();
  });

  it("a wrong password gives no access; the right one opens everything", async () => {
    const s = await start();
    const post = (password: string, cookie?: string) =>
      fetch(s.url + "/api/admin/login", { method: "POST", body: JSON.stringify({ password }), headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) } });
    const bad = await post("wrong");
    const badCookie = bad.headers.get("set-cookie")?.split(";")[0];
    assert.equal((await fetch(s.url + "/api/profiles/me", { headers: badCookie ? { cookie: badCookie } : {} })).status, 403);
    const good = await post("right");
    const cookie = good.headers.get("set-cookie")!.split(";")[0];
    assert.equal((await fetch(s.url + "/api/profiles/me", { headers: { cookie } })).status, 200);
    assert.equal((await fetch(s.url + "/", { headers: { cookie } })).status, 200);
    s.close();
  });

  it("closes the AI assistant, which has no session, while owner-only is on", async () => {
    const s = await start();
    process.env.MITRIFY_ADMIN_ONLY = "1";
    try {
      assert.equal((await fetch(s.url + "/api/clinic-ai/ask")).status, 403);
    } finally {
      delete process.env.MITRIFY_ADMIN_ONLY;
    }
    s.close();
  });
});

describe("owner-only switch and helpers", () => {
  it("is off unless MITRIFY_ADMIN_ONLY is exactly 1", () => {
    assert.equal(adminOnlyEnabled({}), false);
    assert.equal(adminOnlyEnabled({ MITRIFY_ADMIN_ONLY: "true" }), false);
    assert.equal(adminOnlyEnabled({ MITRIFY_ADMIN_ONLY: "1" }), true);
  });
  it("safeEqual compares strings only", () => {
    assert.ok(safeEqual("abc", "abc"));
    assert.ok(!safeEqual("abc", "abd"));
    assert.ok(!safeEqual("abc", "abcd"));
    assert.ok(!safeEqual(undefined, "abc"));
    assert.ok(!safeEqual({ $ne: "x" }, "abc"));
    assert.ok(!safeEqual(["abc"], "abc"));
  });
});
