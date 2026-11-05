// Lets the database be set with separate values instead of one long link.
//
// If DATABASE_URL is not set but PGHOST, PGUSER, PGPASSWORD and PGDATABASE are, this builds
// DATABASE_URL from them (the user name and password are encoded, so characters like @ # / are safe).
// These are the standard PG* names, and they are the same names Neon shows under
// "Connect" > "Parameters only", so each value can be copied across as it is.
//
// DATABASE_URL, when set, always wins and nothing here changes.

type Env = Record<string, string | undefined>;

const REQUIRED = ["PGHOST", "PGUSER", "PGPASSWORD", "PGDATABASE"] as const;

export function buildDatabaseUrl(env: Env): string | null {
  if (env.DATABASE_URL?.trim()) return null;
  const host = env.PGHOST?.trim();
  const user = env.PGUSER?.trim();
  const password = env.PGPASSWORD;
  const database = env.PGDATABASE?.trim();
  if (!host || !user || !password || !database) return null;
  const port = env.PGPORT?.trim() || "5432";
  const sslmode = env.PGSSLMODE?.trim() || "require";
  // Only a plain host name (no slashes, spaces, @ or ?), so the value cannot reshape the link.
  if (!/^[A-Za-z0-9.-]+$/.test(host) || !/^\d{1,5}$/.test(port) || !/^[a-z-]+$/.test(sslmode)) return null;
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${encodeURIComponent(database)}?sslmode=${sslmode}`;
}

/** Names (never values) of the PG* settings that are missing, when only some are given. */
export function missingParts(env: Env): string[] {
  if (env.DATABASE_URL?.trim()) return [];
  const given = REQUIRED.filter((k) => env[k]?.trim());
  return given.length > 0 && given.length < REQUIRED.length ? REQUIRED.filter((k) => !env[k]?.trim()) : [];
}

export function applyDatabaseUrlFromParts(env: Env = process.env): void {
  const url = buildDatabaseUrl(env);
  if (url) {
    env.DATABASE_URL = url;
    console.log("[db] DATABASE_URL was built from PGHOST / PGUSER / PGPASSWORD / PGDATABASE.");
    return;
  }
  const missing = missingParts(env);
  if (missing.length) {
    console.warn(`[db] Database settings are incomplete, missing: ${missing.join(", ")}. The database stays off.`);
  } else if (!env.DATABASE_URL?.trim() && REQUIRED.some((k) => env[k]?.trim())) {
    console.warn("[db] PGHOST, PGPORT or PGSSLMODE has an invalid value. The database stays off.");
  }
}

applyDatabaseUrlFromParts();
