import { createHmac, timingSafeEqual } from "crypto";

// Signed sign-in tokens for the API portal: base64url(payload).base64url(HMAC-SHA256).
// The payload holds the customer id and an expiry; the signature covers the payload exactly.
// A token proves who signed in, but the customer is looked up again on every request, so a disabled
// account stops working at once.

export interface TokenPayload {
  sub: string;
  exp: number; // seconds since the epoch
  typ: "portal";
}

const sign = (body: string, secret: string) => createHmac("sha256", secret).update(body, "utf8").digest();

export function signToken(sub: string, secret: string, ttlSec: number, nowMs = Date.now()): string {
  const payload: TokenPayload = { sub, exp: Math.floor(nowMs / 1000) + ttlSec, typ: "portal" };
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${body}.${sign(body, secret).toString("base64url")}`;
}

/** The customer id inside a valid, unexpired token, or null. */
export function verifyToken(token: string, secret: string, nowMs = Date.now()): string | null {
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const given = Buffer.from(parts[1], "base64url");
  const expected = sign(parts[0], secret);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const p = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")) as Partial<TokenPayload>;
    if (p.typ !== "portal" || typeof p.sub !== "string" || typeof p.exp !== "number") return null;
    return p.exp * 1000 > nowMs ? p.sub : null;
  } catch {
    return null;
  }
}
