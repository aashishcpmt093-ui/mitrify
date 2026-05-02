import { lookupDictionary } from "./tag-dictionary";
import { storage } from "../storage";
import crypto from "crypto";

const MAX_TAGS = 10;
const MIN_TAGS_BEFORE_AI = 5;
const GEMINI_MODEL = "gemini-2.0-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

/** Lower-case, trim, collapse whitespace, strip a leading '#'. */
function normaliseTag(t: string): string {
  return t
    .toLowerCase()
    .trim()
    .replace(/^#+/, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\-]/g, "")
    .slice(0, 40);
}

/** Merge two tag arrays case-insensitively, preserving the FIRST occurrence's casing,
 *  capped at `cap`. */
function mergeAndCap(existing: string[], incoming: string[], cap = MAX_TAGS): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (raw: string) => {
    const norm = normaliseTag(raw);
    if (!norm || norm.length < 2) return;
    if (seen.has(norm)) return;
    seen.add(norm);
    out.push(norm);
  };
  for (const t of existing || []) push(t);
  for (const t of incoming || []) {
    if (out.length >= cap) break;
    push(t);
  }
  return out.slice(0, cap);
}

async function callGemini(serviceName: string, description: string | null): Promise<string[]> {
  const key = process.env.GEMINI_API_KEY;
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
    const resp = await fetch(`${GEMINI_URL}?key=${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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

/**
 * Build a merged hashtag list for one provider. Always preserves existing tags;
 * dictionary first, Gemini fallback when key present and < MIN_TAGS_BEFORE_AI
 * fresh tags came from the dictionary (or no dictionary match at all).
 */
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
  } else if (process.env.GEMINI_API_KEY) {
    try {
      aiTags = await callGemini(cleanService, description);
      source = dict.length > 0 ? "hybrid" : "ai";
    } catch (err: any) {
      console.warn("[auto-tags] Gemini call failed:", err?.message || err);
      source = dict.length > 0 ? "dictionary" : "skipped";
    }
  } else if (dict.length > 0) {
    source = "dictionary";
  }

  const beforeCount = (existingTags || []).filter(Boolean).length;
  const merged = mergeAndCap(existingTags || [], [...dict, ...aiTags]);
  const added = Math.max(0, merged.length - beforeCount);
  if (added === 0 && source !== "skipped") source = "skipped";
  return { finalTags: merged, newTagsAdded: added, source };
}

// ---------- Job runner (in-memory progress for polling) ----------

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
const CONCURRENCY = 4;

export function getJobStatus(jobId: string): JobStatus | null {
  return JOBS.get(jobId) || null;
}

/** Start a backfill job. Returns the jobId immediately and runs in the background. */
export async function startAutoTagJob(opts: { dryRun?: boolean; limit?: number }): Promise<string> {
  const jobId = crypto.randomBytes(6).toString("hex");
  const all = await storage.getAllProviders();
  const slice = typeof opts.limit === "number" && opts.limit > 0 ? all.slice(0, opts.limit) : all;

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
    geminiAvailable: !!process.env.GEMINI_API_KEY,
    dryRun: !!opts.dryRun,
    errorSample: [],
  };
  JOBS.set(jobId, status);

  // background runner
  (async () => {
    let idx = 0;
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
        }
      }
    };

    await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
    status.done = true;
    status.finishedAt = Date.now();

    // Garbage-collect old jobs after 30 minutes
    setTimeout(() => JOBS.delete(jobId), 30 * 60 * 1000);
  })().catch(err => {
    console.error("[auto-tags] job runner crashed:", err);
    status.done = true;
    status.finishedAt = Date.now();
  });

  return jobId;
}
