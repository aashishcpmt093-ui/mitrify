import { createHash, timingSafeEqual } from "crypto";
import type { NextFunction, Request, Response } from "express";

// Owner-only mode for the whole Mitrify site.
//
// Off by default. When MITRIFY_ADMIN_ONLY=1, nobody can open any page or call any API unless they
// signed in with the admin ID and password from the server settings (ADMIN_ID / ADMIN_PASSWORD).
// Visitors are sent to /admin/login. It is checked on the server, so hiding buttons is not what
// protects the site. Doctors, staff, patients and customers cannot sign in while it is on.
//
// Not covered by this gate: gateway.mitrify.com (it has its own keys and is mounted before this).

export const MIN_ADMIN_PASSWORD_LENGTH = 10;

export function adminOnlyEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.MITRIFY_ADMIN_ONLY === "1";
}

// Only what is needed to sign in (or recover the password) stays open.
const OPEN_API = new Set([
  "/api/admin/login",
  "/api/admin/logout",
  "/api/admin/me",
  "/api/admin/check",
  "/api/admin/send-reset-otp",
  "/api/admin/reset-password",
]);

// The sign-in page itself, the platform health check, and the built site files (scripts, styles,
// images). The built files are the same for everyone and hold no data.
const ASSET = /^\/(?:assets\/.+|[^/]+\.(?:js|mjs|css|map|svg|png|jpe?g|webp|gif|ico|woff2?|ttf|otf|webmanifest))$/i;

function isAdminSession(req: Request): boolean {
  return (req.session as { adminAuth?: boolean } | undefined)?.adminAuth === true;
}

export function adminOnlyGate(req: Request, res: Response, next: NextFunction) {
  const path = req.path;
  const read = req.method === "GET" || req.method === "HEAD";

  if (path === "/health" && read) return next();
  if (isAdminSession(req)) return next();
  if (OPEN_API.has(path)) return next();
  if (read && (path === "/admin/login" || ASSET.test(path))) return next();

  res.set("Cache-Control", "no-store");
  if (path.startsWith("/api/")) {
    return res.status(403).json({ message: "This site is private. Only the owner can sign in." });
  }
  if (read) return res.redirect(302, "/admin/login");
  return res.status(403).send("Forbidden");
}

/** For the doctor's AI assistant, which is mounted before sessions exist: closed while owner-only. */
export function blockWhileAdminOnly(_req: Request, res: Response, next: NextFunction) {
  if (!adminOnlyEnabled()) return next();
  res.set("Cache-Control", "no-store");
  return res.status(403).json({ message: "This site is private. Only the owner can sign in." });
}

/** Compares two strings in constant time, without leaking their lengths. */
export function safeEqual(a: unknown, b: unknown): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const ha = createHash("sha256").update(a, "utf8").digest();
  const hb = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(ha, hb);
}
