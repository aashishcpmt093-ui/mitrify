// The pricing catalog: a daily ranking of the cheapest approved models across all providers.
//
// Prices come only from entries the owner verified against each provider's official pricing page or
// API (each entry carries its source URL and the date it was checked). The gateway never scrapes
// random websites and never invents a price. Every refresh is saved as a numbered snapshot, so it is
// always possible to say which models were in the pool on a given day.

import type { GatewayConfig } from "./config";
import type { CatalogSnapshot, PriceEntry, SnapshotEntry } from "./store";

export const AUTO_MODEL = "mitrify/auto-cheap";

/** Below this many tokens of history the observed input/output ratio is not trusted yet. */
export const MIN_OBSERVED_TOKENS = 100_000;

export function rankingWeights(totals: { input: number; output: number }) {
  if (totals.input + totals.output >= MIN_OBSERVED_TOKENS && totals.input > 0 && totals.output > 0) {
    const sum = totals.input + totals.output;
    return { input: totals.input / sum, output: totals.output / sum, source: "observed" as const };
  }
  return { input: 0.5, output: 0.5, source: "default" as const };
}

export function blendedPrice(p: { inputPerMTokUsd: number; outputPerMTokUsd: number }, w: { input: number; output: number }) {
  return p.inputPerMTokUsd * w.input + p.outputPerMTokUsd * w.output;
}

// Models whose names say they are not for chat (music, images, speech, safety filters...). Only used
// when the provider's price list did not say what the model reads and writes.
const NON_CHAT_NAME = /(lyria|imagen|veo|sora|image|video|audio|tts|whisper|speech|embed|moderation|rerank|guard|safety|transcri|ocr)/i;

// Never chosen automatically, whatever the price list says about them: models that are not for general
// chat or may not be used on behalf of other people. "stealth/..." models are OpenRouter's secret test
// models, whose terms forbid using them for third parties. A slug such as "extract" or "summarize" is a
// single-purpose endpoint that needs its own request format.
const NEVER_AUTO = /^stealth\/|\/(?:extract|summari[sz]e|classify|moderat\w*|embed\w*|rerank\w*)(?::.*)?$/i;

/** Is this imported model a text chat model? */
export function looksLikeChatModel(p: Pick<PriceEntry, "upstreamModel" | "chatCapable">): boolean {
  if (NEVER_AUTO.test(p.upstreamModel)) return false;
  return p.chatCapable === true || (p.chatCapable === null && !NON_CHAT_NAME.test(p.upstreamModel));
}

export const isFreePrice = (p: { inputPerMTokUsd: number; outputPerMTokUsd: number }) => p.inputPerMTokUsd === 0 && p.outputPerMTokUsd === 0;

export function buildSnapshot(
  prices: PriceEntry[],
  config: GatewayConfig,
  totals: { input: number; output: number },
  now: Date,
): Omit<CatalogSnapshot, "id"> {
  const weights = rankingWeights(totals);
  const providers = new Map(config.providers.map((p) => [p.id, p]));
  const maxAgeMs = config.maxPriceAgeDays * 24 * 60 * 60 * 1000;
  const excluded: CatalogSnapshot["excluded"] = [];
  const eligible: (SnapshotEntry & { priority: number })[] = [];

  for (const p of prices) {
    const prov = providers.get(p.provider);
    const reason = !prov
      ? "unknown provider"
      : prov.status !== "active"
        ? `provider ${prov.status}`
        : p.blocked
          ? "skipped by the owner"
          : !(p.enabled && p.qualityPassed) && !(config.autoSelect && p.auto)
            ? "not switched On + Pool, and not an automatic model"
            : !(p.enabled && p.qualityPassed) && !looksLikeChatModel(p)
              ? "not a chat model"
              : !(p.enabled && p.qualityPassed) && p.contextLength !== null && p.contextLength < config.minContext
                ? `context shorter than ${config.minContext} tokens`
                : now.getTime() - p.verifiedAt.getTime() > maxAgeMs
                  ? `price older than ${config.maxPriceAgeDays} days`
                  : !(p.inputPerMTokUsd >= 0 && p.outputPerMTokUsd >= 0)
                    ? "invalid price"
                    : null;
    if (reason) {
      excluded.push({ provider: p.provider, upstreamModel: p.upstreamModel, reason });
      continue;
    }
    eligible.push({
      provider: p.provider,
      upstreamModel: p.upstreamModel,
      blendedPerMTokUsd: Math.round(blendedPrice(p, weights) * 1e6) / 1e6,
      inputPerMTokUsd: p.inputPerMTokUsd,
      outputPerMTokUsd: p.outputPerMTokUsd,
      cachedInputPerMTokUsd: p.cachedInputPerMTokUsd,
      supportsStreaming: p.supportsStreaming,
      contextLength: p.contextLength,
      free: isFreePrice(p),
      supportsTools: p.supportsTools,
      priority: prov!.priority,
    });
  }

  eligible.sort(
    (a, b) =>
      a.blendedPerMTokUsd - b.blendedPerMTokUsd ||
      // Same price: models that take tools (a sign of a general assistant) first, then the longer context.
      Number(!!b.supportsTools) - Number(!!a.supportsTools) ||
      (b.contextLength ?? 0) - (a.contextLength ?? 0) ||
      a.priority - b.priority ||
      a.provider.localeCompare(b.provider) ||
      a.upstreamModel.localeCompare(b.upstreamModel),
  );
  // The pool is free models first, then paid ones. A number of places is always kept for paid models, so
  // however many free models there are, the cheapest paid ones stay behind them as the fallback.
  const freeOnes = eligible.filter((e) => e.free);
  const paidOnes = eligible.filter((e) => !e.free);
  const paidSlots = Math.min(paidOnes.length, config.poolPaid, config.poolSize);
  const freeSlots = Math.min(freeOnes.length, config.poolSize - paidSlots);
  const paidTake = Math.min(paidOnes.length, config.poolSize - freeSlots);
  const chosen = [...freeOnes.slice(0, freeSlots), ...paidOnes.slice(0, paidTake)];
  const chosenSet = new Set(chosen);
  for (const e of eligible) {
    if (!chosenSet.has(e)) excluded.push({ provider: e.provider, upstreamModel: e.upstreamModel, reason: `outside the pool of ${config.poolSize}` });
  }
  const entries = chosen.map(({ priority: _p, ...e }) => e);
  return { createdAt: now, weights, entries, excluded };
}

/** Validates a price entry sent by the admin. Returns an error message or null. */
export function validatePriceInput(body: unknown): { entry?: Omit<PriceEntry, "updatedAt">; error?: string } {
  if (!body || typeof body !== "object") return { error: "send a JSON object" };
  const b = body as Record<string, unknown>;
  const str = (k: string) => (typeof b[k] === "string" && (b[k] as string).trim() ? (b[k] as string).trim() : null);
  const price = (k: string) => (typeof b[k] === "number" && Number.isFinite(b[k]) && (b[k] as number) >= 0 ? (b[k] as number) : null);
  const provider = str("provider");
  const upstreamModel = str("upstreamModel");
  const sourceUrl = str("sourceUrl");
  const verifiedAtRaw = str("verifiedAt");
  const input = price("inputPerMTokUsd");
  const output = price("outputPerMTokUsd");
  if (!provider || !upstreamModel) return { error: "provider and upstreamModel are required" };
  if (input === null || output === null) return { error: "inputPerMTokUsd and outputPerMTokUsd must be numbers >= 0 (USD per 1M tokens)" };
  if (!sourceUrl || !/^https:\/\//.test(sourceUrl)) return { error: "sourceUrl must be the https link of the official price page" };
  const verifiedAt = verifiedAtRaw ? new Date(verifiedAtRaw) : null;
  if (!verifiedAt || Number.isNaN(verifiedAt.getTime())) return { error: "verifiedAt must be the date the price was checked (ISO date)" };
  if (b.currency !== undefined && b.currency !== "USD") return { error: "only USD prices are supported for now" };
  const cached = b.cachedInputPerMTokUsd === undefined || b.cachedInputPerMTokUsd === null ? null : price("cachedInputPerMTokUsd");
  if (b.cachedInputPerMTokUsd != null && cached === null) return { error: "cachedInputPerMTokUsd must be a number >= 0" };
  const ctx = typeof b.contextLength === "number" && b.contextLength > 0 ? Math.floor(b.contextLength) : null;
  return {
    entry: {
      provider,
      upstreamModel,
      inputPerMTokUsd: input,
      outputPerMTokUsd: output,
      cachedInputPerMTokUsd: cached,
      currency: "USD",
      sourceUrl,
      verifiedAt,
      contextLength: ctx,
      supportsStreaming: b.supportsStreaming !== false,
      supportsTools: b.supportsTools === true,
      qualityPassed: b.qualityPassed === true,
      enabled: b.enabled !== false,
      auto: false,
      chatCapable: null,
      blocked: b.blocked === true,
    },
  };
}
