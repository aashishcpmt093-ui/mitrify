/**
 * Clean a raw Google-Places-style business name that can look like:
 *   "Metrosh Infra Projects - Hybrid Constructions | Civil Construction | Shed Builder"
 *
 * Rules:
 *  - Only activates when the raw string contains `|` (the clear import-pipeline signal).
 *  - Step 1: split on `|`; first segment = candidate name.
 *  - Step 2: within the first segment, split on ` - `; take the first part.
 *    (handles the " - Descriptor" suffix common in Google Places display names)
 *  - For strings WITHOUT `|` the original value is returned untouched so that
 *    manually-created / self-registered provider names are never altered.
 */
export function cleanBusinessName(raw: string): string {
  if (!raw.includes("|")) return raw.trim();
  const firstSegment = raw.split("|")[0].trim();
  const dashParts = firstSegment.split(" - ");
  return (dashParts[0].trim() || firstSegment) || raw.trim();
}

/**
 * Extract the "extra" description text from a pipe-formatted Google name.
 * Returns all information after the clean name: the ` - Descriptor` portion
 * from the first segment AND any remaining `| category` segments.
 * Returns "" when no suffix exists.
 */
export function extractDescriptionSuffix(raw: string): string {
  if (!raw.includes("|")) return "";
  const parts = raw.split("|").map((s) => s.trim()).filter(Boolean);
  const firstDashParts = parts[0].split(" - ");
  const firstExtra = firstDashParts.slice(1).join(" - ").trim();
  const restCategories = parts.slice(1).join(" | ");
  return [firstExtra, restCategories].filter(Boolean).join(" | ");
}

/**
 * Merge a description suffix into an existing description string.
 * No-op when suffix is empty or already present.
 */
export function mergeDescription(
  existing: string | null | undefined,
  suffix: string,
): string | null {
  if (!suffix) return existing ?? null;
  if (!existing) return suffix;
  if (existing.includes(suffix)) return existing;
  return `${existing} | ${suffix}`;
}
