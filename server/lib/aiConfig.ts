export const AI_TOKEN_CONFIG_KEY = "ai_token_threshold";
export const AI_TOKEN_HOUR_THRESHOLD_DEFAULT = 10000;

let cachedThreshold: number | null = null;

export async function getAiTokenThreshold(): Promise<number> {
  if (cachedThreshold !== null) return cachedThreshold;
  cachedThreshold = AI_TOKEN_HOUR_THRESHOLD_DEFAULT;
  return cachedThreshold;
}

export function bustAiThresholdCache(): void {
  cachedThreshold = null;
}
