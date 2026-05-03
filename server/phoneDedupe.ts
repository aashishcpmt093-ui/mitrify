// Shared phone-dedupe helper for the Google fallback path (customer
// search) and `bulkCreateGooglePlaces` (admin import + fire-and-forget
// background save).
//
// Both call sites need to answer the same question: "of these N
// normalized last-10-digit numbers I'm about to surface or insert,
// which ones do we already know about?". Earlier versions did this by
// pulling every phone from `pending_providers`, `local_users` and
// `providers.mobileNumbers` into Node memory on every request — fine
// for hundreds of rows, ruinous as the table grows.
//
// This helper instead asks the database directly, scoped to just the
// candidate phone list (≤20 per Google response). To keep latency flat
// as the table grows we add expression B-tree indexes on the normalized
// last-10-digit form for the two high-volume tables (pending_providers,
// local_users), so the lookup is an index range scan rather than a
// sequential scan. `providers.mobile_numbers` is a text[] of one row
// per verified, onboarded provider — that table grows with humans, not
// with API calls, so an unnest scan stays cheap and we don't add a more
// complex GIN expression index for it.

import { sql } from "drizzle-orm";
import { db } from "./db";

export function normalizePhone(p: string | null | undefined): string {
  const digits = (p || "").replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

type PhoneRow = { n: string | null };

// Returns the subset of `candidates` that already exist in any of the
// dedupe-source tables, expressed as last-10-digit normalized phones.
//
// Each per-table query references the indexed expression directly so
// the planner can use the expression indexes created by
// migrations/0008_phone_dedupe_indexes.sql. We issue them sequentially
// against the shared pool to keep the contention story simple — each
// query is a small index lookup so total latency is dominated by
// network round trips, not CPU.
export async function findKnownPhones(candidates: string[]): Promise<Set<string>> {
  const known = new Set<string>();
  const wanted = Array.from(new Set(candidates.filter((c) => c.length === 10)));
  if (wanted.length === 0) return known;

  try {
    const pendingHits = await db.execute<PhoneRow>(sql`
      SELECT DISTINCT right(regexp_replace(coalesce(mobile, ''), '[^0-9]', '', 'g'), 10) AS n
        FROM pending_providers
        WHERE right(regexp_replace(coalesce(mobile, ''), '[^0-9]', '', 'g'), 10) = ANY(${wanted}::text[])
    `);
    for (const row of pendingHits.rows) {
      if (row.n) known.add(row.n);
    }

    const userHits = await db.execute<PhoneRow>(sql`
      SELECT DISTINCT right(regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g'), 10) AS n
        FROM local_users
        WHERE right(regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g'), 10) = ANY(${wanted}::text[])
    `);
    for (const row of userHits.rows) {
      if (row.n) known.add(row.n);
    }

    // providers.mobile_numbers is text[]; a single verified provider
    // can carry several lines. We unnest and normalize on the DB side
    // so only matching rows cross the wire. This table is small (one
    // row per onboarded provider) so an unindexed scan is acceptable.
    const providerHits = await db.execute<PhoneRow>(sql`
      SELECT DISTINCT right(regexp_replace(coalesce(m, ''), '[^0-9]', '', 'g'), 10) AS n
        FROM providers, unnest(mobile_numbers) AS m
        WHERE right(regexp_replace(coalesce(m, ''), '[^0-9]', '', 'g'), 10) = ANY(${wanted}::text[])
    `);
    for (const row of providerHits.rows) {
      if (row.n) known.add(row.n);
    }
  } catch {
    // Lookup failure: return whatever we collected so far. Better to
    // potentially show one duplicate than to drop the entire response.
  }

  return known;
}
