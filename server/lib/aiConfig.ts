import { db } from "../db";
import { siteContent } from "@shared/schema";
import { eq } from "drizzle-orm";

export const AI_TOKEN_CONFIG_KEY = "ai_token_hour_threshold";
export const AI_TOKEN_HOUR_THRESHOLD_DEFAULT = Number(process.env.AI_TOKEN_HOUR_THRESHOLD) || 100_000;

let _aiThresholdCache: { value: number; expiresAt: number } | null = null;

export async function getAiTokenThreshold(): Promise<number> {
  const now = Date.now();
  if (_aiThresholdCache && now < _aiThresholdCache.expiresAt) return _aiThresholdCache.value;
  try {
    const [row] = await db.select().from(siteContent).where(eq(siteContent.key, AI_TOKEN_CONFIG_KEY));
    const raw = row?.value;
    const dbVal = raw !== null && typeof raw === "object" && !Array.isArray(raw)
      ? Number((raw as Record<string, unknown>).threshold ?? NaN)
      : Number(raw);
    const value = Number.isFinite(dbVal) && dbVal > 0 ? dbVal : AI_TOKEN_HOUR_THRESHOLD_DEFAULT;
    _aiThresholdCache = { value, expiresAt: now + 60_000 };
    return value;
  } catch {
    return AI_TOKEN_HOUR_THRESHOLD_DEFAULT;
  }
}

export function bustAiThresholdCache(): void {
  _aiThresholdCache = null;
}
