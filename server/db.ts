import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

// Do not throw here: a missing DATABASE_URL must not stop the process from starting,
// otherwise the platform answers 503 and the frontend cannot be served at all.
if (!process.env.DATABASE_URL) {
  console.warn("DATABASE_URL is not set: database features are disabled, the frontend still runs.");
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
});

pool.on("error", (err) => {
  console.error("DB pool error (server kept alive):", err.message);
});

export const db = drizzle(pool, { schema });
