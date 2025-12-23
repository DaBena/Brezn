export function normalizeTextForMatch(input: string): string {
  return input.toLowerCase().replace(/\s+/g, ' ').trim()
}

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

