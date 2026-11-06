// Reads token usage from upstream responses (without changing them) and prices it.
// When the provider reports no usage, the cost is recorded as unknown, never guessed.

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  /** The amount the provider itself says it charged (USD), when it reports one (Surplus: usage.buyer_cost_micro). */
  reportedCostUsd?: number;
}

export interface Price {
  inputPerMTokUsd: number;
  outputPerMTokUsd: number;
  cachedInputPerMTokUsd: number | null;
}

const n = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);

/** OpenAI-style usage ({prompt_tokens, completion_tokens}) or {input_tokens, output_tokens}. */
export function readUsage(obj: unknown): Usage | null {
  if (!obj || typeof obj !== "object") return null;
  const u = (obj as Record<string, unknown>).usage as Record<string, unknown> | null | undefined;
  if (!u || typeof u !== "object") return null;
  const input = n(u.prompt_tokens) ?? n(u.input_tokens);
  const output = n(u.completion_tokens) ?? n(u.output_tokens);
  if (input === null || output === null) return null;
  const details = (u.prompt_tokens_details ?? u.input_tokens_details) as Record<string, unknown> | undefined;
  const cached = n(details?.cached_tokens) ?? n(u.cache_read_input_tokens) ?? 0;
  const micro = n(u.buyer_cost_micro);
  return {
    inputTokens: input,
    outputTokens: output,
    cachedTokens: Math.min(cached, input),
    ...(micro !== null ? { reportedCostUsd: Math.round(micro) / 1_000_000 } : {}),
  };
}

/** A 200 reply whose body is an error (Surplus does this for long non-streaming calls that fail). */
export function isErrorBody(obj: unknown): boolean {
  if (!obj || typeof obj !== "object") return false;
  const o = obj as Record<string, unknown>;
  return o.error != null && !Array.isArray(o.choices);
}

/** Cost in USD (zero markup: exactly the provider's listed price). */
export function costUsd(u: Usage, p: Price): number {
  const cachedPrice = p.cachedInputPerMTokUsd ?? p.inputPerMTokUsd;
  const uncached = u.inputTokens - u.cachedTokens;
  const c = (uncached * p.inputPerMTokUsd + u.cachedTokens * cachedPrice + u.outputTokens * p.outputPerMTokUsd) / 1_000_000;
  return Math.round(c * 1e8) / 1e8;
}

const MAX_LINE = 1024 * 1024;

/**
 * Watches a Server-Sent Events stream for usage and completion while the bytes are passed on
 * untouched. It only reads; it never alters, reorders or holds back the stream.
 */
export class SseWatcher {
  usage: Usage | null = null;
  sawDone = false;
  sawFinishReason = false;
  private decoder = new TextDecoder("utf-8");
  private pending = "";
  private skipping = false;

  feed(chunk: Uint8Array) {
    const text = this.decoder.decode(chunk, { stream: true });
    let start = 0;
    for (let i = 0; i < text.length; i++) {
      if (text[i] !== "\n") continue;
      const piece = text.slice(start, i);
      start = i + 1;
      if (this.skipping) {
        this.skipping = false;
        this.pending = "";
        continue;
      }
      this.line(this.pending + piece);
      this.pending = "";
    }
    if (!this.skipping) {
      this.pending += text.slice(start);
      if (this.pending.length > MAX_LINE) {
        // An oversized line is still forwarded to the client; it is only skipped for accounting.
        this.pending = "";
        this.skipping = true;
      }
    }
  }

  end() {
    if (this.pending && !this.skipping) this.line(this.pending);
    this.pending = "";
  }

  private line(raw: string) {
    const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    if (!line.startsWith("data:")) return;
    const data = line.slice(5).trim();
    if (data === "[DONE]") {
      this.sawDone = true;
      return;
    }
    if (!data.includes("usage") && !data.includes("finish_reason")) return;
    try {
      const obj = JSON.parse(data);
      const u = readUsage(obj);
      if (u) this.usage = u;
      const choices = (obj as { choices?: { finish_reason?: unknown }[] }).choices;
      if (Array.isArray(choices) && choices.some((c) => c && c.finish_reason != null)) this.sawFinishReason = true;
    } catch {
      // Not JSON: nothing to account, the bytes were already forwarded.
    }
  }
}
