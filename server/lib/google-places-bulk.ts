// Bulk Google Places fetch — scans a city via a circle grid using the
// Google Places API (New) Text Search with `locationRestriction.circle`
// to break past the per-query 60-result hard cap. Dedupes by `placeId`
// AND by `(normalizedAddress, city)` so the same business returned
// from two overlapping circles only appears once. Reports live progress
// via an in-memory job map (same pattern as `auto-tags.ts`'s `JOBS`).
//
// Persistence: progress is intentionally NOT persisted to DB — these
// jobs finish in minutes and a server restart cancels them. The full
// `places` array lives in memory and is sent down on every status poll.
import crypto from "crypto";

export interface GpPlace {
  placeId: string;
  name: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  phone: string;
  website: string;
  rating: number | null;
  ratingCount: number | null;
}

export interface BulkJobStatus {
  jobId: string;
  city: string;
  service: string;
  target: number;
  /** Total raw places returned by API across all cells (before dedupe). */
  fetched: number;
  /** Unique places kept after placeId + (address,city) dedupe — = places.length. */
  unique: number;
  /** Duplicates skipped (already-seen placeId or address). */
  dupSkipped: number;
  /** Total `searchText` calls made (including anchor lookup + pagination). */
  apiCalls: number;
  cellsScanned: number;
  totalCells: number;
  currentArea: string;
  done: boolean;
  cancelled: boolean;
  error?: string;
  startedAt: number;
  finishedAt?: number;
  places: GpPlace[];
}

const JOBS = new Map<string, BulkJobStatus>();

// Tuning constants. Conservative defaults to keep API cost predictable
// and stay well within Google's QPS limits.
const CONCURRENCY = 3;
const MAX_PER_CELL_PAGES = 3;             // Google: max 3 pages × 20 = 60 per query
const HARD_CAP = 6000;
const ANCHOR_DEFAULT_BBOX_KM = 30;        // fallback when viewport not returned
const CELL_RADIUS_M = 4000;
const CELL_SPACING_KM = 5;
const PAGE_TOKEN_DELAY_MS = 800;          // Google requires brief delay before nextPageToken is valid
const JOB_GC_AFTER_MS = 30 * 60 * 1000;
// Early-stop threshold: after this many cells with cellsScanned > MIN_BEFORE_STOP,
// if `emptyRatio` exceeds EMPTY_RATIO_STOP we abandon the rest of the grid.
// We deliberately use a *cumulative ratio* rather than the previous "consecutive
// empty cells" heuristic, because workers complete out-of-order under
// concurrency and a non-atomic shared counter produced wildly wrong "consecutive"
// counts (could prematurely stop a run that still had results to find).
const MIN_CELLS_BEFORE_EARLY_STOP = 12;
const EMPTY_RATIO_STOP = 0.85;

// Per-admin rate limit. In-memory map of `{ adminKey -> [timestampMs] }`.
// Survives within one process lifetime; resets on restart (acceptable —
// the safety cap is to avoid accidental cost spikes from rapid clicks).
const ADMIN_RUNS = new Map<string, number[]>();
const RUNS_PER_DAY = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

export function checkRateLimit(adminKey: string): { ok: boolean; runsToday: number; max: number } {
  const now = Date.now();
  const arr = (ADMIN_RUNS.get(adminKey) || []).filter(t => now - t < DAY_MS);
  ADMIN_RUNS.set(adminKey, arr);
  return { ok: arr.length < RUNS_PER_DAY, runsToday: arr.length, max: RUNS_PER_DAY };
}

function recordRun(adminKey: string): void {
  const arr = ADMIN_RUNS.get(adminKey) || [];
  arr.push(Date.now());
  ADMIN_RUNS.set(adminKey, arr);
}

function normaliseAddress(a: string): string {
  return (a || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.,;:]+$/g, "")
    .trim();
}

const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.shortFormattedAddress",
  "places.location",
  "places.nationalPhoneNumber",
  "places.internationalPhoneNumber",
  "places.websiteUri",
  "places.rating",
  "places.userRatingCount",
  "nextPageToken",
].join(",");

const ANCHOR_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.location",
  "places.viewport",
  "places.formattedAddress",
].join(",");

async function callPlacesText(body: any, apiKey: string, fieldMask = FIELD_MASK, attempt = 0): Promise<any> {
  const resp = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": fieldMask,
    },
    body: JSON.stringify(body),
  });
  if ((resp.status === 429 || resp.status >= 500) && attempt < 3) {
    await new Promise(r => setTimeout(r, 500 * Math.pow(2, attempt)));
    return callPlacesText(body, apiKey, fieldMask, attempt + 1);
  }
  const data: any = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(data?.error?.message || `Places API ${resp.status}`);
  }
  return data;
}

function mapPlace(p: any): GpPlace {
  return {
    placeId: p.id,
    name: p.displayName?.text || "",
    address: p.formattedAddress || p.shortFormattedAddress || "",
    latitude: p.location?.latitude ?? null,
    longitude: p.location?.longitude ?? null,
    phone: p.nationalPhoneNumber || p.internationalPhoneNumber || "",
    website: p.websiteUri || "",
    rating: p.rating ?? null,
    ratingCount: p.userRatingCount ?? null,
  };
}

interface CityAnchor {
  center: { lat: number; lng: number };
  bboxKm: { width: number; height: number };
}

async function getCityAnchor(city: string, apiKey: string): Promise<CityAnchor> {
  const data = await callPlacesText(
    { textQuery: `${city}, India`, regionCode: "IN", maxResultCount: 1 },
    apiKey,
    ANCHOR_FIELD_MASK,
  );
  const first = (data.places || [])[0];
  if (!first?.location) {
    throw new Error(`City "${city}" not found on Google Places`);
  }
  const lat: number = first.location.latitude;
  const lng: number = first.location.longitude;
  const vp = first.viewport;
  let widthKm = ANCHOR_DEFAULT_BBOX_KM;
  let heightKm = ANCHOR_DEFAULT_BBOX_KM;
  if (vp?.high && vp?.low) {
    const cosLat = Math.cos((lat * Math.PI) / 180);
    heightKm = Math.abs(vp.high.latitude - vp.low.latitude) * 111;
    widthKm = Math.abs(vp.high.longitude - vp.low.longitude) * 111 * cosLat;
    // Clamp so a tiny city doesn't generate 1 cell and a huge metro doesn't
    // generate 10k cells (cost runaway).
    heightKm = Math.max(10, Math.min(80, heightKm));
    widthKm = Math.max(10, Math.min(80, widthKm));
  }
  return { center: { lat, lng }, bboxKm: { width: widthKm, height: heightKm } };
}

function generateGrid(
  center: { lat: number; lng: number },
  bboxKm: { width: number; height: number },
  spacingKm: number,
): Array<{ lat: number; lng: number }> {
  const cols = Math.max(1, Math.ceil(bboxKm.width / spacingKm));
  const rows = Math.max(1, Math.ceil(bboxKm.height / spacingKm));
  const cosLat = Math.cos((center.lat * Math.PI) / 180);
  const out: Array<{ lat: number; lng: number }> = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const dLat = ((r - (rows - 1) / 2) * spacingKm) / 111;
      const dLng = ((c - (cols - 1) / 2) * spacingKm) / (111 * Math.max(0.1, cosLat));
      out.push({ lat: center.lat + dLat, lng: center.lng + dLng });
    }
  }
  return out;
}

export function getBulkJobStatus(jobId: string): BulkJobStatus | null {
  return JOBS.get(jobId) || null;
}

export function cancelBulkJob(jobId: string): boolean {
  const j = JOBS.get(jobId);
  if (!j || j.done) return false;
  j.cancelled = true;
  return true;
}

export interface StartBulkOpts {
  adminKey: string;
  city: string;
  service: string;
  target: number;
}

export async function startGoogleBulkSearch(opts: StartBulkOpts): Promise<string> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_PLACES_API_KEY not configured");
  const target = Math.min(HARD_CAP, Math.max(1, Math.floor(opts.target)));
  const city = opts.city.trim();
  const service = opts.service.trim();
  if (!city || !service) throw new Error("city aur service dono required hain");

  const jobId = crypto.randomBytes(6).toString("hex");
  const status: BulkJobStatus = {
    jobId,
    city,
    service,
    target,
    fetched: 0,
    unique: 0,
    dupSkipped: 0,
    apiCalls: 0,
    cellsScanned: 0,
    totalCells: 0,
    currentArea: "Anchor lookup…",
    done: false,
    cancelled: false,
    startedAt: Date.now(),
    places: [],
  };
  JOBS.set(jobId, status);
  setTimeout(() => JOBS.delete(jobId), JOB_GC_AFTER_MS);

  // Background runner — fire-and-forget.
  (async () => {
    try {
      const anchor = await getCityAnchor(city, apiKey);
      status.apiCalls++;
      // Only charge against the daily quota once anchor lookup succeeds —
      // otherwise a typo'd city or a transient Google failure burns a run
      // for nothing.
      recordRun(opts.adminKey);
      const grid = generateGrid(anchor.center, anchor.bboxKm, CELL_SPACING_KM);
      status.totalCells = grid.length;
      status.currentArea = `Anchor: ${anchor.center.lat.toFixed(3)}, ${anchor.center.lng.toFixed(3)} — ${grid.length} cells`;

      const placeIds = new Set<string>();
      const addrSet = new Set<string>();
      const cityNorm = city.toLowerCase();
      // Cumulative empty-cell counter (deterministic across concurrent workers).
      let emptyCells = 0;
      let cellIdx = 0;
      const next = () => (cellIdx < grid.length ? { idx: cellIdx, cell: grid[cellIdx++] } : null);
      const shouldEarlyStop = () =>
        status.cellsScanned >= MIN_CELLS_BEFORE_EARLY_STOP &&
        emptyCells / status.cellsScanned >= EMPTY_RATIO_STOP;

      const scanCell = async (cell: { lat: number; lng: number }, idx: number): Promise<number> => {
        let pageToken: string | undefined;
        let cellAdded = 0;
        for (let page = 0; page < MAX_PER_CELL_PAGES; page++) {
          if (status.cancelled || status.unique >= target) return cellAdded;
          const body: any = {
            textQuery: `${service} in ${city}`,
            regionCode: "IN",
            maxResultCount: 20,
            locationRestriction: {
              circle: {
                center: { latitude: cell.lat, longitude: cell.lng },
                radius: CELL_RADIUS_M,
              },
            },
          };
          if (pageToken) body.pageToken = pageToken;
          let data: any;
          try {
            data = await callPlacesText(body, apiKey);
          } catch (e: any) {
            // Per-cell errors must not crash the whole job — log and move on.
            console.warn(`[gp-bulk] cell ${idx} page ${page} failed:`, e?.message || e);
            return cellAdded;
          }
          status.apiCalls++;
          const places = (data.places || []).map(mapPlace);
          status.fetched += places.length;
          for (const p of places) {
            if (status.unique >= target) break;
            if (!p.placeId) continue;
            if (placeIds.has(p.placeId)) { status.dupSkipped++; continue; }
            const addrKey = normaliseAddress(p.address) + "|" + cityNorm;
            // Only treat as address-dup when address is non-empty — otherwise
            // every "no address" place would collide on "|city".
            if (addrKey.length > cityNorm.length + 1 && addrSet.has(addrKey)) {
              status.dupSkipped++; continue;
            }
            placeIds.add(p.placeId);
            if (addrKey.length > cityNorm.length + 1) addrSet.add(addrKey);
            status.places.push(p);
            status.unique++;
            cellAdded++;
          }
          pageToken = data.nextPageToken;
          if (!pageToken) break;
          await new Promise(r => setTimeout(r, PAGE_TOKEN_DELAY_MS));
        }
        return cellAdded;
      };

      const worker = async () => {
        while (true) {
          if (status.cancelled || status.unique >= target) return;
          if (shouldEarlyStop()) return;
          const item = next();
          if (!item) return;
          status.currentArea =
            `${item.cell.lat.toFixed(3)}, ${item.cell.lng.toFixed(3)} — cell ${item.idx + 1}/${grid.length}`;
          const added = await scanCell(item.cell, item.idx);
          status.cellsScanned++;
          if (added === 0) emptyCells++;
        }
      };

      await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

      const reason = status.cancelled
        ? "Cancelled"
        : status.unique >= target
          ? "Target reached"
          : shouldEarlyStop()
            ? `Early stop (${emptyCells}/${status.cellsScanned} cells empty)`
            : "Grid exhausted";
      status.currentArea = reason;
      status.done = true;
      status.finishedAt = Date.now();
      console.log(
        `[gp-bulk] ${jobId} ${reason}: ${status.unique}/${target} unique, ` +
        `${status.cellsScanned}/${grid.length} cells, ${status.apiCalls} API calls, ` +
        `${Math.round((Date.now() - status.startedAt) / 1000)}s — city="${city}" service="${service}"`,
      );
    } catch (err: any) {
      status.error = err?.message || "Bulk search failed";
      status.done = true;
      status.finishedAt = Date.now();
      console.error(`[gp-bulk] ${jobId} crashed:`, err);
    }
  })();

  return jobId;
}
