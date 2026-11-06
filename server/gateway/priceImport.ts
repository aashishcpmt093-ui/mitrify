import type { ProviderConfig } from "./config";
import type { GatewayStore, PriceEntry } from "./store";

// Reads a provider's own published model list and prices (OpenRouter: GET <base>/models) and keeps
// the price table up to date from it. Prices come only from that official endpoint; each entry
// records the address it was read from and when.
//
// New models arrive switched OFF for named calls. The automatic mode may still choose them (see catalog.ts). Models already known keep the owner's switches and only get fresh prices.

export interface ImportedModel {
  id: string;
  contextLength: number | null;
  inputPerMTokUsd: number;
  outputPerMTokUsd: number;
  cachedInputPerMTokUsd: number | null;
  supportsTools: boolean;
  /** Reads and writes text, as far as the price list says; null when it does not say. */
  chatCapable: boolean | null;
}

const MODEL_ID = /^[A-Za-z0-9._:/-]{1,200}$/;
const MAX_MODELS = 3000;
const MAX_BYTES = 20 * 1024 * 1024;

/** A per-token price (number or numeric string) as USD per million tokens, or null when unusable. */
function perMillion(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  // Negative values (for example -1 on routers) mean "price varies"; they are not a price.
  if (!Number.isFinite(n) || n < 0) return null;
  const m = Math.round(n * 1e6 * 1e6) / 1e6;
  return m <= 99_999_999 ? m : null;
}

/**
 * Is this a general chat model? Both checks must agree, whichever the price list gives:
 *  - it reads text and writes ONLY text (a music or image model that also writes some text is not a chat model);
 *  - it takes the usual chat settings (max_tokens or temperature), which task-specific endpoints do not.
 * null when the list says nothing about either.
 */
function chatCapableFrom(arch: any, supported: unknown): boolean | null {
  let byModality: boolean | null = null;
  if (arch && typeof arch === "object") {
    const lower = (v: unknown) => (Array.isArray(v) ? v.filter((x) => typeof x === "string").map((x) => x.toLowerCase()) : null);
    const ins = lower(arch.input_modalities);
    const outs = lower(arch.output_modalities);
    if (ins && outs) byModality = ins.includes("text") && outs.length > 0 && outs.every((x) => x === "text");
    else if (typeof arch.modality === "string" && arch.modality.includes("->")) {
      const [a, b] = arch.modality.toLowerCase().split("->");
      byModality = a.includes("text") && b.trim() === "text";
    }
  }
  // An empty list is "unknown", not "supports nothing".
  const byParams = Array.isArray(supported) && supported.length > 0 ? supported.includes("max_tokens") || supported.includes("temperature") : null;
  if (byModality === false || byParams === false) return false;
  if (byModality === null && byParams === null) return null;
  return true;
}

export function parseModelList(json: unknown): ImportedModel[] {
  const data = (json as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) return [];
  const out: ImportedModel[] = [];
  for (const m of data.slice(0, MAX_MODELS)) {
    const o = m as Record<string, any> | null;
    if (!o || typeof o.id !== "string" || !MODEL_ID.test(o.id)) continue;
    const input = perMillion(o.pricing?.prompt);
    const output = perMillion(o.pricing?.completion);
    if (input === null || output === null) continue;
    const cached = perMillion(o.pricing?.input_cache_read);
    out.push({
      id: o.id,
      contextLength: typeof o.context_length === "number" && o.context_length > 0 ? Math.floor(o.context_length) : null,
      inputPerMTokUsd: input,
      outputPerMTokUsd: output,
      cachedInputPerMTokUsd: cached,
      supportsTools: Array.isArray(o.supported_parameters) && o.supported_parameters.includes("tools"),
      chatCapable: chatCapableFrom(o.architecture, o.supported_parameters),
    });
  }
  return out;
}

export function supportsImport(providerId: string): boolean {
  return providerId === "openrouter";
}

export async function importPrices(
  provider: ProviderConfig,
  store: GatewayStore,
  fetchImpl: typeof fetch,
  now: Date,
): Promise<{ added: number; updated: number; skipped: number; sourceUrl: string }> {
  if (!supportsImport(provider.id)) throw new Error(`Price import is not available for ${provider.id}.`);
  if (provider.status !== "active" || !provider.baseUrl || !provider.apiKey) throw new Error(`${provider.label} is not ready (${provider.statusReason}).`);
  const sourceUrl = `${provider.baseUrl}/models`;
  const res = await fetchImpl(sourceUrl, {
    headers: { authorization: `Bearer ${provider.apiKey}`, accept: "application/json", "user-agent": "mitrify-gateway/1" },
    signal: AbortSignal.timeout(30_000),
    redirect: "error",
  });
  if (!res.ok) throw new Error(`${provider.label} answered ${res.status} for its model list.`);
  const text = await res.text();
  if (text.length > MAX_BYTES) throw new Error("The model list is unexpectedly large; nothing was imported.");
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("The model list was not valid JSON; nothing was imported.");
  }
  const models = parseModelList(json);
  const known = new Map((await store.listPrices()).filter((p) => p.provider === provider.id).map((p) => [p.upstreamModel, p]));
  let added = 0;
  let updated = 0;
  for (const m of models) {
    const old = known.get(m.id);
    const entry: PriceEntry = {
      provider: provider.id,
      upstreamModel: m.id,
      inputPerMTokUsd: m.inputPerMTokUsd,
      outputPerMTokUsd: m.outputPerMTokUsd,
      cachedInputPerMTokUsd: m.cachedInputPerMTokUsd,
      currency: "USD",
      sourceUrl,
      verifiedAt: now,
      contextLength: m.contextLength,
      supportsStreaming: old?.supportsStreaming ?? true,
      supportsTools: m.supportsTools,
      // The owner's choices are kept. New models start switched off for named calls; the automatic mode
      // may still pick them (free first, then the cheapest) unless the owner skips them.
      qualityPassed: old?.qualityPassed ?? false,
      enabled: old?.enabled ?? false,
      auto: true,
      chatCapable: m.chatCapable,
      blocked: old?.blocked ?? false,
      updatedAt: now,
    };
    await store.upsertPrice(entry);
    if (old) updated++;
    else added++;
  }
  return { added, updated, skipped: Math.max(0, (Array.isArray((json as any)?.data) ? (json as any).data.length : 0) - models.length), sourceUrl };
}
