/**
 * Normalizes text for matching (lowercase, collapse whitespace).
 * Used for case-insensitive keyword matching.
 * @param input - Text to normalize
 * @returns Normalized text
 */
export function normalizeTextForMatch(input: string): string {
  return input.toLowerCase().replace(/\s+/g, ' ').trim()
}

/**
 * Normalizes and validates muted terms.
 * - Removes duplicates
 * - Trims whitespace
 * - Limits to 200 terms
 * - Limits each term to 200 characters
 * @param terms - Array of terms to normalize
 * @returns Normalized array of terms
 */
export function normalizeMutedTerms(terms: string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()

  for (const raw of terms) {
    const t = normalizeTextForMatch(raw)
    if (!t) continue
    // guardrails: keep storage small + matching fast
    const clipped = t.slice(0, 200)
    if (seen.has(clipped)) continue
    seen.add(clipped)
    out.push(clipped)
    if (out.length >= 200) break
  }

  return out
}

/**
 * Checks if content matches any of the muted terms.
 * Matching is case-insensitive and handles whitespace normalization.
 * @param content - Content to check
 * @param mutedTerms - Array of normalized terms to match against
 * @returns True if content contains any muted term
 */
export function contentMatchesMutedTerms(content: string, mutedTerms: string[]): boolean {
  if (!mutedTerms.length) return false
  const hay = normalizeTextForMatch(content)
  if (!hay) return false
  for (const t of mutedTerms) {
    if (!t) continue
    if (hay.includes(t)) return true
  }
  return false
}

