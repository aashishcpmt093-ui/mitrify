import { createHash, randomBytes, timingSafeEqual } from "crypto";

// Client API keys and the owner's setup code.
//
// Keys are 32 random bytes (256 bits). Only their sha256 is stored; a fast hash is fine here because
// the input is high-entropy random data, not a password a person chose.

export const KEY_PREFIX = "mtf_live_";

export function generateApiKey(): string {
  return KEY_PREFIX + randomBytes(32).toString("base64url");
}

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key, "utf8").digest("hex");
}

export function displayPrefix(key: string): string {
  return key.slice(0, KEY_PREFIX.length + 6);
}

export function looksLikeApiKey(value: string): boolean {
  return value.startsWith(KEY_PREFIX) && /^[A-Za-z0-9_-]{40,80}$/.test(value.slice(KEY_PREFIX.length));
}

/** Constant-time comparison of the presented setup code with the configured one. */
export function setupCodeMatches(presented: string | undefined, configured: string | null): boolean {
  if (!configured || typeof presented !== "string" || presented.length === 0) return false;
  // Compare digests so the comparison does not leak the length of the configured code.
  const a = createHash("sha256").update(presented, "utf8").digest();
  const b = createHash("sha256").update(configured, "utf8").digest();
  return timingSafeEqual(a, b);
}

/** Pulls the bearer token from an Authorization header. */
export function bearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const m = /^Bearer\s+(\S+)\s*$/i.exec(header);
  return m ? m[1] : null;
}
