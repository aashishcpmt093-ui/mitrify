import { lookupDictionary } from "./tag-dictionary";
import { storage } from "../storage";
import crypto from "crypto";

const MAX_TAGS = 10;
const MIN_TAGS_BEFORE_AI = 5;
const GEMINI_MODEL = "gemini-flash-latest";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

function getGeminiKey(): string | undefined {
  return process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
}

function normaliseTag(t: string): string {
  return t
    .toLowerCase()
    .trim()
    .replace(/^#+/, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\-]/g, "")
    .slice(0, 40);
}

function mergeAndCap(existing: string[], incoming: string[], cap = MAX_TAGS): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of existing || []) {
    if (typeof t !== "string" || !t.trim()) continue;
    const key = normaliseTag(t);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= cap) return out;
  }
  for (const t of incoming || []) {
    if (out.length >= cap) break;
    const norm = normaliseTag(t);
    if (!norm || norm.length < 2) continue;
    if (seen.has(norm)) continue;
    seen.add(norm);
    out.push(norm);
  }
  return out.slice(0, cap);
}

async function callGemini(serviceName: string, description: string | null): Promise<string[]> {
  const key = getGeminiKey();
  if (!key) return [];

  const prompt = [
    "You generate short hashtags for an Indian local-services marketplace called Mitrify.",
    "Service / profession:",
    `  ${serviceName}`,
    description ? `Provider's own description:\n  ${description}` : "",
    "",
    "Rules:",
    "- Return ONLY a JSON array of 8 to 10 strings, no prose, no markdown.",
    "- Each tag is 1-3 words, lowercase, hyphen-separated (e.g. \"bike-mechanic\", \"ac-repair\").",
    "- Mix Hinglish (Hindi written in English letters, e.g. \"bijli-mistri\", \"nal-thik\") and English so customers searching in either find this provider.",
    "- Tags must describe the provider's WORK or sub-services people might search for, not the city.",
    "- No emojis, no '#' prefix, no duplicates.",
  ].filter(Boolean).join("\n");

  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.4,
      maxOutputTokens: 256,
      responseMimeType: "application/json",
    },
  };

  const doFetch = async () => {
    const resp = await fetch(GEMINI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-goog-api-key": key,
      },
      body: JSON.stringify(body),
    });
    if (resp.status === 429) {
      const err: any = new Error("rate-limited");
      err.rateLimited = true;
      throw err;
    }
    if (!resp.ok) {
      const txt = await resp.text().catch(() => "");
      throw new Error(`Gemini ${resp.status}: ${txt.slice(0, 200)}`);
    }
    return resp.json();
  };

  let data: any;
  try {
    data = await doFetch();
  } catch (err: any) {
    if (err?.rateLimited) {
      await new Promise(r => setTimeout(r, 1500));
      data = await doFetch();
    } else {
      throw err;
    }
  }

  const text: string =
    data?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text || "").join("").trim() || "";
  if (!text) return [];

  let arr: any;
  try {
    arr = JSON.parse(text);
  } catch {
    const m = text.match(/\[[\s\S]*\]/);
    if (m) {
      try { arr = JSON.parse(m[0]); } catch { arr = null; }
    }
  }
  if (!Array.isArray(arr)) return [];
  return arr.filter((x: any) => typeof x === "string");
}

export type TagSource = "dictionary" | "ai" | "hybrid" | "skipped";

export interface TagResult {
  finalTags: string[];
  newTagsAdded: number;
  source: TagSource;
}

export async function generateTagsForProvider(
  serviceName: string,
  description: string | null,
  existingTags: string[]
): Promise<TagResult> {
  const cleanService = (serviceName || "").trim();
  if (!cleanService) {
    return { finalTags: existingTags || [], newTagsAdded: 0, source: "skipped" };
  }

  const dict = lookupDictionary(cleanService, description || undefined);
  let aiTags: string[] = [];
  let source: TagSource = "skipped";

  if (dict.length >= MIN_TAGS_BEFORE_AI) {
    source = "dictionary";
  } else if (getGeminiKey()) {
    try {
      aiTags = await callGemini(cleanService, description);
      if (aiTags.length > 0) {
        source = dict.length > 0 ? "hybrid" : "ai";
      } else {
        source = dict.length > 0 ? "dictionary" : "skipped";
      }
    } catch (err: any) {
      console.warn("[auto-tags] Gemini call failed:", err?.message || err);
      source = dict.length > 0 ? "dictionary" : "skipped";
    }
  } else if (dict.length > 0) {
    source = "dictionary";
  }

  const merged = mergeAndCap(existingTags || [], [...dict, ...aiTags]);
  const existingNorm = new Set((existingTags || []).filter(Boolean).map(normaliseTag));
  let added = 0;
  for (const t of merged) {
    if (!existingNorm.has(normaliseTag(t))) added++;
  }
  if (added === 0 && source !== "skipped") source = "skipped";
  return { finalTags: merged, newTagsAdded: added, source };
}

// ─── Job runner ──────────────────────────────────────────────────────────
// Hybrid persistence model:
//   • In-memory `JOBS` map → fast updates from worker loops, polled by UI.
//   • Postgres `tag_jobs` table → survives restart so the admin can resume
//     polling a job whose progress was made in a previous server lifetime.
// DB writes are throttled (every 5 processed providers + always on done) so
// we don't hammer the database with one row update per provider.

export interface JobStatus {
  jobId: string;
  total: number;
  processed: number;
  fromDict: number;
  fromAi: number;
  fromHybrid: number;
  skipped: number;
  failed: number;
  done: boolean;
  startedAt: number;
  finishedAt?: number;
  geminiAvailable: boolean;
  dryRun: boolean;
  errorSample: string[];
}

const JOBS = new Map<string, JobStatus>();
const CONCURRENCY = 5;
const DB_WRITE_EVERY = 5; // processed-count interval to flush to DB

// Per-job promise chain so throttled flushes never overwrite a later
// (more-progressed) write with an earlier one. Without this, two concurrent
// `void flushToDb(status)` calls could land out of order and leave
// `done=true`/`processed=N` getting stomped by an earlier `done=false` write.
const FLUSH_CHAIN = new Map<string, Promise<void>>();

function rowToStatus(row: any): JobStatus {
  return {
    jobId: row.jobId,
    total: row.total ?? 0,
    processed: row.processed ?? 0,
    fromDict: row.fromDict ?? 0,
    fromAi: row.fromAi ?? 0,
    fromHybrid: row.fromHybrid ?? 0,
    skipped: row.skipped ?? 0,
    failed: row.failed ?? 0,
    done: !!row.done,
    startedAt: row.startedAt ? new Date(row.startedAt).getTime() : Date.now(),
    finishedAt: row.finishedAt ? new Date(row.finishedAt).getTime() : undefined,
    geminiAvailable: !!row.geminiAvailable,
    dryRun: !!row.dryRun,
    errorSample: Array.isArray(row.errorSample) ? row.errorSample : [],
  };
}

function queueFlush(status: JobStatus): Promise<void> {
  // Snapshot counters at enqueue time so the actual write reflects the state
  // when the flush was requested, even if more updates have happened by the
  // time this link in the chain runs.
  const snap = {
    processed: status.processed,
    fromDict: status.fromDict,
    fromAi: status.fromAi,
    fromHybrid: status.fromHybrid,
    skipped: status.skipped,
    failed: status.failed,
    done: status.done,
    finishedAt: status.finishedAt ? new Date(status.finishedAt) : null,
    errorSample: [...status.errorSample],
  };
  const prev = FLUSH_CHAIN.get(status.jobId) || Promise.resolve();
  const next = prev.catch(() => {}).then(async () => {
    try {
      await storage.updateTagJob(status.jobId, snap);
    } catch (err: any) {
      console.warn("[auto-tags] DB flush failed:", err?.message || err);
    }
  });
  FLUSH_CHAIN.set(status.jobId, next);
  // Best-effort cleanup so the map doesn't grow unbounded.
  next.finally(() => {
    if (FLUSH_CHAIN.get(status.jobId) === next) FLUSH_CHAIN.delete(status.jobId);
  });
  return next;
}

/** Returns the jobId of any currently-running (not done) job, or null.
 *  Reads from DB so it survives a server restart. */
export async function getActiveJobId(): Promise<string | null> {
  const memEntries = Array.from(JOBS.entries());
  for (const [id, s] of memEntries) {
    if (!s.done) return id;
  }
  const row = await storage.getActiveTagJob();
  return row?.jobId ?? null;
}

/** Read job status. Prefers in-memory (fresh), falls back to DB so polling
 *  works after a server restart (UI sees "done" with whatever counts the
 *  worker last flushed before going down). */
export async function getJobStatus(jobId: string): Promise<JobStatus | null> {
  const mem = JOBS.get(jobId);
  if (mem) return mem;
  const row = await storage.getTagJob(jobId);
  return row ? rowToStatus(row) : null;
}

/** Latest job (active or recently-finished) within `maxAgeSeconds`. Used by
 *  the UI's resume probe so an admin who refreshes after a server restart
 *  still sees what happened to their last run (e.g. "marked failed: server
 *  restart") instead of getting a blank slate. */
export async function getLatestJob(maxAgeSeconds: number): Promise<JobStatus | null> {
  const memEntries = Array.from(JOBS.entries());
  let bestMem: JobStatus | null = null;
  for (const [, s] of memEntries) {
    if (!bestMem || s.startedAt > bestMem.startedAt) bestMem = s;
  }
  const row = await storage.getLatestTagJob(maxAgeSeconds);
  if (!row) return bestMem;
  if (bestMem && bestMem.startedAt >= new Date(row.startedAt as any).getTime()) return bestMem;
  return rowToStatus(row);
}

/** Heartbeat threshold: a `done=false` row whose `updated_at` is older than
 *  this is considered orphaned (worker process died). The active worker
 *  loop flushes every 5 processed providers, which under realistic
 *  concurrency (5 workers, even a slow ~10s/provider) updates `updated_at`
 *  well within 60s — so 120s gives plenty of headroom and avoids
 *  false-positives in multi-instance deployments. */
const STALE_HEARTBEAT_SECONDS = 120;

async function sweepStaleJobs(): Promise<void> {
  try {
    const n = await storage.markStaleTagJobsFailed(STALE_HEARTBEAT_SECONDS);
    if (n > 0) {
      console.log(`[auto-tags] swept ${n} stale tag job(s) (heartbeat > ${STALE_HEARTBEAT_SECONDS}s, marked failed)`);
    }
  } catch (err: any) {
    console.warn("[auto-tags] sweepStaleJobs failed:", err?.message || err);
  }
}

let sweepTimer: NodeJS.Timeout | null = null;

/** Start the stale-job recovery loop. Runs once immediately (so a row whose
 *  worker died long enough ago is finalised at boot) and then every 60s. We
 *  intentionally do NOT mark every `done=false` row failed at boot — in a
 *  multi-instance deployment another live instance may still own the
 *  in-flight job. Heartbeat-based detection is safe across both single and
 *  multi-instance setups. Idempotent: safe to call multiple times. */
export async function recoverStaleJobs(): Promise<void> {
  await sweepStaleJobs();
  if (!sweepTimer) {
    sweepTimer = setInterval(() => { void sweepStaleJobs(); }, 60_000);
    if (typeof sweepTimer.unref === "function") sweepTimer.unref();
  }
}

/** Start a backfill job. Returns the jobId immediately and runs in the
 *  background. Persists to DB so progress survives a server restart. */
export async function startAutoTagJob(opts: { dryRun?: boolean; limit?: number }): Promise<string> {
  const jobId = crypto.randomBytes(6).toString("hex");
  const all = await storage.getAllProviders();
  const active = all.filter((p: any) => p?.isActive !== false);
  const slice = typeof opts.limit === "number" && opts.limit > 0 ? active.slice(0, opts.limit) : active;

  const status: JobStatus = {
    jobId,
    total: slice.length,
    processed: 0,
    fromDict: 0,
    fromAi: 0,
    fromHybrid: 0,
    skipped: 0,
    failed: 0,
    done: false,
    startedAt: Date.now(),
    geminiAvailable: !!getGeminiKey(),
    dryRun: !!opts.dryRun,
    errorSample: [],
  };
  // Persist FIRST so a DB failure doesn't leave a phantom in-memory job that
  // blocks future starts (since `getActiveJobId` checks the in-memory map).
  try {
    await storage.createTagJob({
      jobId,
      total: slice.length,
      dryRun: !!opts.dryRun,
      geminiAvailable: !!getGeminiKey(),
    });
  } catch (err: any) {
    console.error("[auto-tags] failed to persist new job:", err?.message || err);
    throw err;
  }
  JOBS.set(jobId, status);

  // Background runner.
  (async () => {
    let idx = 0;
    let lastFlushed = 0;
    const next = () => (idx < slice.length ? slice[idx++] : null);

    const worker = async () => {
      while (true) {
        const p = next();
        if (!p) return;
        try {
          const result = await generateTagsForProvider(
            p.serviceName,
            p.description || null,
            (p.hashtags as string[]) || [],
          );
          if (!opts.dryRun && result.newTagsAdded > 0) {
            await storage.updateProvider(p.userId, { hashtags: result.finalTags });
          }
          if (result.source === "dictionary") status.fromDict++;
          else if (result.source === "ai") status.fromAi++;
          else if (result.source === "hybrid") status.fromHybrid++;
          else status.skipped++;
        } catch (err: any) {
          status.failed++;
          if (status.errorSample.length < 5) {
            status.errorSample.push(`${p.serviceName}: ${(err?.message || "error").slice(0, 100)}`);
          }
        } finally {
          status.processed++;
          // Throttled DB flush via per-job serialized chain — see queueFlush.
          if (status.processed - lastFlushed >= DB_WRITE_EVERY) {
            lastFlushed = status.processed;
            void queueFlush(status);
          }
        }
      }
    };

    await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
    status.done = true;
    status.finishedAt = Date.now();
    await queueFlush(status); // awaits prior flushes too, so final state wins

    // GC in-memory slot after 30 min — DB row stays for resume-after-restart.
    setTimeout(() => JOBS.delete(jobId), 30 * 60 * 1000);
  })().catch(async err => {
    console.error("[auto-tags] job runner crashed:", err);
    status.done = true;
    status.finishedAt = Date.now();
    if (status.errorSample.length < 5) {
      status.errorSample.push(`runner crash: ${String(err?.message || err).slice(0, 100)}`);
    }
    await queueFlush(status);
  });

  return jobId;
}
