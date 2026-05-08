/**
 * Split a raw business name (e.g. "Metrosh Infra Projects | Civil Construction | Shed Builder")
 * into a clean short name (first segment) and an optional description suffix (remaining segments).
 *
 * Rules:
 *  - Split on `|`; trim every segment; drop empty ones.
 *  - First segment = canonical display name.
 *  - Remaining segments = extra context to append to description.
 */
export function cleanBusinessName(raw: string): string {
  const parts = raw.split("|").map((s) => s.trim()).filter(Boolean);
  return parts[0] || raw.trim();
}

export function extractDescriptionSuffix(raw: string): string {
  const parts = raw.split("|").map((s) => s.trim()).filter(Boolean);
  return parts.slice(1).join(" | ");
}

/**
 * Merge a description suffix into an existing description string.
 * If `existing` already contains the suffix, no-op.
 */
export function mergeDescription(existing: string | null | undefined, suffix: string): string | null {
  if (!suffix) return existing || null;
  if (!existing) return suffix;
  if (existing.includes(suffix)) return existing;
  return `${existing} | ${suffix}`;
}
