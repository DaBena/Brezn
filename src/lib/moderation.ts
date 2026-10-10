import { UNSPACED_BLOB_MIN_LENGTH } from './constants'
import { extractUrls } from './urls'

/** Scripts that commonly omit spaces between words — do not treat as blobs. */
const SCRIPT_WITHOUT_SPACES =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u

/** Lightning / Cashu / NIP-19 tokens: long and unspaced, but not base64 spam. */
const KNOWN_TOKEN_RE =
  /\b(?:cashu[A-Za-z][A-Za-z0-9+/=_-]*|lnbc[0-9a-z]+|lntb[0-9a-z]+|lnurl1[02-9ac-hj-np-z]+|n(?:pub|sec|event|addr|profile|ote|relay)1[02-9ac-hj-np-z]+)\b/gi

const BASE64_ALPHABET_RE = /[A-Za-z0-9+/=]/g

function remainderAfterKnownTokens(content: string): string {
  let t = content
  for (const u of extractUrls(t).sort((a, b) => b.start - a.start)) {
    t = t.slice(0, u.start) + ' ' + t.slice(u.end)
  }
  return t.replace(KNOWN_TOKEN_RE, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * Long ASCII walls without spaces (typical base64 dumps).
 * URLs, invoices and bech32 stay; hidden from feed/search, not a mute list.
 */
export function contentLooksLikeUnspacedBlob(content: string): boolean {
  const remainder = remainderAfterKnownTokens(content)
  if (remainder.length < UNSPACED_BLOB_MIN_LENGTH) return false
  if (SCRIPT_WITHOUT_SPACES.test(remainder)) return false
  const ws = (remainder.match(/\s/g) ?? []).length
  if (ws / remainder.length >= 0.015) return false
  const b64 = remainder.match(BASE64_ALPHABET_RE)?.length ?? 0
  return b64 / remainder.length >= 0.85
}

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
