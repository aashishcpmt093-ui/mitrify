// Customer-facing Google Places fallback for the search bar.
//
// Behaviour (Task #72):
//   • For every text-based customer search, after our own DB results are
//     returned, the client also asks for live "from Google" suggestions.
//   • We hit Google Places Text Search (New) — same API used by the admin
//     bulk-import tool, just leaner (1 page, smaller field mask).
//   • Only places with BOTH a phone AND a lat/lng are surfaced.
//   • Phone numbers already known to us (registered users OR existing
//     pending_providers rows) are stripped so we never show a duplicate
//     of someone the customer can already reach via the verified section.
//   • Results are cached server-side for 24 h keyed by
//     (normalized query, lat~3dp, lng~3dp) — Google's per-call cost is
//     ~$0.032 so this is the single most important cost guardrail.
//   • Every fresh Google response is fire-and-forget saved into
//     pending_providers via the same `bulkCreateGooglePlaces` helper the
//     admin tool uses, so repeat searches gradually grow our own DB and
//     stop hitting Google at all once the admin verifies them.

import { type InsertCoAdmin, pendingProviders } from "@shared/schema";
import { storage } from "./storage";
import { findKnownPhones, normalizePhone as normalizePhoneShared } from "./phoneDedupe";
import { db } from "./db";
import { and, eq, or, ilike } from "drizzle-orm";
import bcrypt from "bcryptjs";

// ── In-memory 24 h LRU cache ──────────────────────────────────────────
//
// Map preserves insertion order in JS so we evict the oldest key when
// we exceed CACHE_MAX. We also lazy-evict expired entries on read.
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX = 500;

export type GoogleFallbackResult = {
  placeId: string;
  name: string;
  address: string;
  phone: string;
  latitude: number;
  longitude: number;
  rating: number | null;
  ratingCount: number | null;
  distanceKm: number | null;
};

type CacheEntry = { at: number; raw: RawPlace[] };
const CACHE = new Map<string, CacheEntry>();

function cacheKey(query: string, lat?: number, lng?: number): string {
  const q = query.trim().toLowerCase().replace(/\s+/g, " ");
  const la = lat != null ? lat.toFixed(3) : "-";
  const ln = lng != null ? lng.toFixed(3) : "-";
  return `${q}|${la}|${ln}`;
}

function cacheGet(key: string): RawPlace[] | null {
  const hit = CACHE.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    CACHE.delete(key);
    return null;
  }
  // Refresh LRU position so frequently-used keys survive eviction.
  CACHE.delete(key);
  CACHE.set(key, hit);
  return hit.raw;
}

function cacheSet(key: string, raw: RawPlace[]): void {
  CACHE.set(key, { at: Date.now(), raw });
  while (CACHE.size > CACHE_MAX) {
    const oldest = CACHE.keys().next().value;
    if (oldest === undefined) break;
    CACHE.delete(oldest);
  }
}

// ── Google call ───────────────────────────────────────────────────────

type RawPlace = {
  placeId: string;
  name: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  phone: string;
  rating: number | null;
  ratingCount: number | null;
};

// Hard cap on how far a Google result can be from the customer to be
// surfaced. Anything beyond this is geographically useless (we saw
// 11,000+ km USA results bleeding into Indian queries).
const MAX_DISTANCE_KM = 25;

async function callGooglePlaces(
  textQuery: string,
  lat: number,
  lng: number,
): Promise<RawPlace[]> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return [];
  const fieldMask = [
    "places.id",
    "places.displayName",
    "places.formattedAddress",
    "places.shortFormattedAddress",
    "places.location",
    "places.nationalPhoneNumber",
    "places.internationalPhoneNumber",
    "places.rating",
    "places.userRatingCount",
  ].join(",");
  // Single page only — for a customer query we want low latency, not
  // exhaustive coverage. The admin tool is the one that paginates.
  //
  // Text Search (New) only supports `rectangle` in `locationRestriction`;
  // `circle` is allowed in `locationBias`. We pass a circle bias so Google
  // strongly prefers nearby results, then enforce the 25 km cut-off
  // ourselves with a haversine check below — so far-away places (we saw
  // 11,000+ km USA results bleeding into Indian queries) can never reach
  // the customer.
  const r = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": fieldMask,
    },
    body: JSON.stringify({
      textQuery,
      regionCode: "IN",
      maxResultCount: 20,
      locationBias: {
        circle: {
          center: { latitude: lat, longitude: lng },
          radius: MAX_DISTANCE_KM * 1000,
        },
      },
    }),
  });
  if (!r.ok) return [];
  const j: any = await r.json();
  const arr: any[] = Array.isArray(j.places) ? j.places : [];
  return arr.map((p: any) => ({
    placeId: String(p.id || ""),
    name: p.displayName?.text || "",
    address: p.formattedAddress || p.shortFormattedAddress || "",
    latitude: p.location?.latitude ?? null,
    longitude: p.location?.longitude ?? null,
    phone: p.nationalPhoneNumber || p.internationalPhoneNumber || "",
    rating: typeof p.rating === "number" ? p.rating : null,
    ratingCount: typeof p.userRatingCount === "number" ? p.userRatingCount : null,
  }));
}

// ── Distance ──────────────────────────────────────────────────────────

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// ── Phone normalization (matches bulkCreateGooglePlaces) ─────────────
// Re-exported alias of the shared normalizer so this file's existing
// call sites stay readable.

const normalizePhone = normalizePhoneShared;

// ── Ensure system co-admin exists for `addedBy` attribution ──────────
//
// We need a stable `addedBy` value because pending_providers requires it.
// Auto-create on first use so the install doesn't need a manual seed.
const SYSTEM_COADMIN_USERNAME = "system_google_fallback";
let coAdminEnsured = false;

async function ensureSystemCoAdmin(): Promise<string> {
  if (coAdminEnsured) return SYSTEM_COADMIN_USERNAME;
  try {
    const existing = await storage.getCoAdmin(SYSTEM_COADMIN_USERNAME);
    if (!existing) {
      // Random un-loggable password — this account is never meant to log in.
      const randomPwd = (await import("crypto")).randomBytes(24).toString("hex");
      const hash = await bcrypt.hash(randomPwd, 10);
      const payload: InsertCoAdmin = {
        username: SYSTEM_COADMIN_USERNAME,
        password: hash,
        role: "coadmin",
        isActive: false,
      };
      await storage.createCoAdmin(payload);
    }
    coAdminEnsured = true;
  } catch {
    // Best-effort. If creation races and conflicts, the next call's
    // getCoAdmin will see the row and we'll succeed on retry.
  }
  return SYSTEM_COADMIN_USERNAME;
}

// ── Public entry point ───────────────────────────────────────────────

export async function searchGoogleFallback(opts: {
  query: string;
  lat?: number;
  lng?: number;
}): Promise<GoogleFallbackResult[]> {
  const query = (opts.query || "").trim();
  if (!query) return [];
  // Pure-numeric (phone) queries are handled by the dedicated phone
  // lookup endpoint — Google fallback would be misleading there.
  const digits = query.replace(/\D/g, "");
  if (digits.length >= 6 && digits === query.replace(/[\s\-\+]/g, "")) return [];
  if (!process.env.GOOGLE_PLACES_API_KEY) return [];
  // Without the customer's location we can't enforce the 25 km cap, so
  // any Google result we return would be geographically random
  // (e.g. an Indian customer searching "salon" was getting Oregon, USA).
  // Skip the fallback entirely until the client passes lat/lng.
  if (opts.lat == null || opts.lng == null) return [];

  const key = cacheKey(query, opts.lat, opts.lng);
  let raw = cacheGet(key);
  if (!raw) {
    // Bias the textQuery with "near me" so Google additionally weighs
    // proximity inside the restricted circle.
    const textQuery = `${query} near me`;
    try {
      raw = await callGooglePlaces(textQuery, opts.lat, opts.lng);
    } catch {
      raw = [];
    }
    cacheSet(key, raw);

    // Fire-and-forget: persist ANY place that has a phone (even if we
    // don't surface it to this customer due to dedupe) so the admin
    // tool can verify it and our own DB grows over time. Don't await —
    // customer response shouldn't wait on a write path.
    if (raw.length > 0) {
      void persistToPendingProviders(raw, query).catch(() => {});
    }
  }

  // Filter: must have phone + lat/lng AND be within the 25 km cap.
  // `locationBias` is soft, so Google can still return places outside
  // the circle when matches inside are sparse — this haversine check is
  // the actual hard cut-off the customer sees.
  const candidates = raw.filter((p) => {
    if (normalizePhone(p.phone).length < 10) return false;
    if (p.latitude == null || p.longitude == null) return false;
    const d = haversineKm(opts.lat as number, opts.lng as number, p.latitude, p.longitude);
    return d <= MAX_DISTANCE_KM;
  });
  if (candidates.length === 0) return [];

  // Dedupe against our own DB so we never show a number our app already
  // has (verified provider OR pending row). Same dedupe basis used by
  // bulkCreateGooglePlaces (last-10-digits of pendingProviders.mobile +
  // localUsers.phone). We only look up the candidate phones (≤20) instead
  // of pulling every known phone into memory — keeps server memory flat
  // and lets the DB use indexes as the table grows.
  const candidatePhones = Array.from(
    new Set(candidates.map((p) => normalizePhone(p.phone)).filter((n) => n.length === 10)),
  );
  const knownPhones = await findKnownPhones(candidatePhones);
  const dedup = candidates.filter((p) => !knownPhones.has(normalizePhone(p.phone)));

  // Add distance + sort (closest first) when we know the user's location.
  const out: GoogleFallbackResult[] = dedup.map((p) => {
    const distanceKm = (opts.lat != null && opts.lng != null && p.latitude != null && p.longitude != null)
      ? haversineKm(opts.lat, opts.lng, p.latitude, p.longitude)
      : null;
    return {
      placeId: p.placeId,
      name: p.name,
      address: p.address,
      phone: normalizePhone(p.phone),
      latitude: p.latitude as number,
      longitude: p.longitude as number,
      rating: p.rating,
      ratingCount: p.ratingCount,
      distanceKm,
    };
  });

  if (opts.lat != null && opts.lng != null) {
    out.sort((a, b) => {
      if (a.distanceKm == null && b.distanceKm == null) return 0;
      if (a.distanceKm == null) return 1;
      if (b.distanceKm == null) return -1;
      return a.distanceKm - b.distanceKm;
    });
  }
  return out;
}

// ── Saved Google leads search ─────────────────────────────────────────
//
// On the very first customer search for a service we hit Google, surface
// the results, AND background-save them into pending_providers attributed
// to `system_google_fallback`. The next time the same (or a similar)
// service is searched, we want those rows to surface in the MAIN result
// list — not in the "from Google" section — so the customer gets an
// instant, no-API-cost match. The Google fallback's existing phone
// dedupe will then strip any duplicates from the bottom Google section.
//
// Match rules: `serviceName` OR `name` ILIKE %query%, status='pending',
// addedBy=SYSTEM_COADMIN_USERNAME, must have phone + lat/lng, and
// haversine distance ≤ MAX_DISTANCE_KM.
export async function searchSavedGoogleLeads(opts: {
  query: string;
  lat?: number;
  lng?: number;
}): Promise<GoogleFallbackResult[]> {
  const q = (opts.query || "").trim();
  if (!q) return [];
  // Without coords we can't apply the 25 km cap, so we'd risk surfacing
  // a saved lead from another city. Same guard as the live Google path.
  // Reject NaN / non-finite (e.g. parseFloat("abc")) explicitly — otherwise
  // haversine returns NaN and `NaN > MAX_DISTANCE_KM` is false, which would
  // leak up to 200 nationwide leads through this open endpoint.
  if (
    !Number.isFinite(opts.lat as number) ||
    !Number.isFinite(opts.lng as number) ||
    Math.abs(opts.lat as number) > 90 ||
    Math.abs(opts.lng as number) > 180
  ) {
    return [];
  }
  const like = `%${q.toLowerCase()}%`;
  let rows: Array<{
    id: number;
    name: string;
    mobile: string | null;
    address: string | null;
    latitude: number | null;
    longitude: number | null;
    serviceName: string;
  }> = [];
  try {
    rows = await db
      .select({
        id: pendingProviders.id,
        name: pendingProviders.name,
        mobile: pendingProviders.mobile,
        address: pendingProviders.address,
        latitude: pendingProviders.latitude,
        longitude: pendingProviders.longitude,
        serviceName: pendingProviders.serviceName,
      })
      .from(pendingProviders)
      .where(
        and(
          eq(pendingProviders.addedBy, SYSTEM_COADMIN_USERNAME),
          eq(pendingProviders.status, "pending"),
          or(
            ilike(pendingProviders.serviceName, like),
            ilike(pendingProviders.name, like),
          ),
        ),
      )
      .limit(200);
  } catch {
    return [];
  }
  const out: GoogleFallbackResult[] = [];
  for (const r of rows) {
    const phone = normalizePhone(r.mobile || "");
    if (phone.length < 10) continue;
    if (r.latitude == null || r.longitude == null) continue;
    const distanceKm = haversineKm(opts.lat, opts.lng, r.latitude, r.longitude);
    if (!Number.isFinite(distanceKm) || distanceKm > MAX_DISTANCE_KM) continue;
    out.push({
      placeId: `pending:${r.id}`,
      name: r.name || "Unnamed Business",
      address: r.address || "",
      phone,
      latitude: r.latitude,
      longitude: r.longitude,
      rating: null,
      ratingCount: null,
      distanceKm,
    });
  }
  out.sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
  return out;
}

async function persistToPendingProviders(raw: RawPlace[], serviceName: string): Promise<void> {
  const records = raw
    .filter((p) => normalizePhone(p.phone).length >= 10 && p.latitude != null && p.longitude != null)
    .map((p) => ({
      name: p.name || "Unnamed Business",
      mobile: p.phone,
      serviceName,
      address: p.address,
      latitude: p.latitude as number,
      longitude: p.longitude as number,
    }));
  if (records.length === 0) return;
  const assignedTo = await ensureSystemCoAdmin();
  try {
    await storage.bulkCreateGooglePlaces(records, assignedTo, false);
  } catch {
    // Silent — never block customer response on background save.
  }
}
