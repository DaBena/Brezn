import { bytesToHex } from '@noble/hashes/utils'
import { nip19, type Event, type Filter } from './nostrPrimitives'
import { NOSTR_KINDS, ROOT_FEED_EVENT_KINDS, SEARCH_EVENT_KINDS } from './breznNostr'
import { isNip52CalendarKind, nip52LocationsLine, nip52Summary, nip52Title } from './nip52'
import { isReplyNote } from './nostrUtils'
import {
  NIP11_CACHE_TTL_MS,
  NIP11_NEGATIVE_CACHE_TTL_MS,
  SEARCH_PEOPLE_PROBE_MAX,
  SEARCH_QUERY_LIMIT,
} from './constants'

function isHex64(input: string): boolean {
  if (input.length !== 64) return false
  for (let i = 0; i < 64; i++) {
    const cc = input.charCodeAt(i)
    if (cc < 48 || cc > 102 || (cc > 57 && cc < 97)) return false
  }
  return true
}

function keyToHex(data: unknown): string | null {
  if (typeof data === 'string' && isHex64(data)) return data.toLowerCase()
  if (data instanceof Uint8Array && data.length === 32) return bytesToHex(data)
  return null
}

/** npub / nprofile / 64-hex pubkey from a search box, or null. */
export function parseSearchTargetPubkey(query: string): string | null {
  const q = query.trim()
  if (!q) return null
  if (isHex64(q)) return q.toLowerCase()
  try {
    const decoded = nip19.decode(q)
    if (decoded.type === 'npub') return keyToHex(decoded.data)
    if (decoded.type === 'nprofile') {
      const pk = (decoded.data as { pubkey?: unknown })?.pubkey
      return keyToHex(pk)
    }
  } catch {
    /* not a bech32 identifier */
  }
  return null
}

export type Nip11SearchHint = 'supports' | 'rejects' | 'unknown'

/**
 * `supports` when NIP-11 lists 50. `rejects` when the document lists other NIPs but not 50.
 * `unknown` when the fetch failed or the document lists no NIPs (some relays still honor `search`).
 */
export function nip11SearchHint(nips: ReadonlySet<number>, documentOk: boolean): Nip11SearchHint {
  if (nips.has(50)) return 'supports'
  if (documentOk && nips.size > 0) return 'rejects'
  return 'unknown'
}

export function normalizeSearchRelayUrl(url: string): string {
  return url.trim().replace(/\/+$/, '')
}

export function uniqueSearchRelayUrls(urls: string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const url of urls) {
    const norm = normalizeSearchRelayUrl(url)
    if (!/^wss?:\/\//i.test(norm)) continue
    const key = norm.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(norm)
  }
  return out
}

/** Nonsense query. A relay that ignores `search` still returns recent notes for it. */
export const SEARCH_SUPPORT_PROBE = 'zxqvwontfindthisword'

export function buildSearchSupportProbeFilter(): Filter {
  return { kinds: [NOSTR_KINDS.note], search: SEARCH_SUPPORT_PROBE, limit: 1 }
}

type SearchSupportCacheEntry = { honors: boolean; fetchedAt: number }

const searchSupportCache = new Map<string, SearchSupportCacheEntry>()
const searchSupportInflight = new Map<string, Promise<boolean>>()

export function resetSearchSupportCache(): void {
  searchSupportCache.clear()
  searchSupportInflight.clear()
}

function searchSupportTtl(honors: boolean): number {
  return honors ? NIP11_CACHE_TTL_MS : NIP11_NEGATIVE_CACHE_TTL_MS
}

async function cachedSearchSupport(
  url: string,
  probe: (url: string) => Promise<boolean>,
): Promise<boolean> {
  const key = normalizeSearchRelayUrl(url).toLowerCase()
  const cached = searchSupportCache.get(key)
  if (cached && Date.now() - cached.fetchedAt < searchSupportTtl(cached.honors))
    return cached.honors

  const pending = searchSupportInflight.get(key)
  if (pending) return pending

  const task = probe(url).then(
    (honors) => {
      searchSupportCache.set(key, { honors, fetchedAt: Date.now() })
      searchSupportInflight.delete(key)
      return honors
    },
    () => {
      searchSupportInflight.delete(key)
      return false
    },
  )
  searchSupportInflight.set(key, task)
  return task
}

/** User relays that advertise NIP-50, plus relays whose NIP-11 was inconclusive but a probe shows they honor `search`. */
export async function searchRelaysFromHints(
  hints: Array<{ url: string; hint: Nip11SearchHint }>,
  probe: (url: string) => Promise<boolean>,
): Promise<string[]> {
  const picked = await Promise.all(
    hints.map(async ({ url, hint }) => {
      if (hint === 'supports') return url
      if (hint === 'rejects') return null
      return (await cachedSearchSupport(url, probe)) ? url : null
    }),
  )
  return uniqueSearchRelayUrls(picked.filter((url): url is string => url != null))
}

/** NIP-50 `search` filter. Sent to relays that advertise NIP-50 or pass the support probe. */
export function buildNip50SearchFilters(query: string): Filter[] {
  const q = query.trim()
  if (!q) return []
  return [
    {
      kinds: [...SEARCH_EVENT_KINDS],
      search: q,
      limit: SEARCH_QUERY_LIMIT,
    },
  ]
}

/** Direct lookup when the query decodes to a pubkey (all configured relays). */
export function buildPubkeyLookupFilters(pubkey: string): Filter[] {
  const pk = pubkey.trim().toLowerCase()
  if (!isHex64(pk)) return []
  return [
    { kinds: [NOSTR_KINDS.metadata], authors: [pk], limit: 5 },
    { kinds: [...ROOT_FEED_EVENT_KINDS], authors: [pk], limit: SEARCH_QUERY_LIMIT },
  ]
}

/** One cheap REQ per pubkey to see whether a name-search profile has ever posted. */
export function buildPosterProbeFilters(pubkeys: string[]): Filter[] {
  const seen = new Set<string>()
  const filters: Filter[] = []
  for (const raw of pubkeys) {
    const pk = raw.trim().toLowerCase()
    if (!isHex64(pk) || seen.has(pk)) continue
    seen.add(pk)
    filters.push({ kinds: [...ROOT_FEED_EVENT_KINDS], authors: [pk], limit: 1 })
    if (filters.length >= SEARCH_PEOPLE_PROBE_MAX) break
  }
  return filters
}

/** Identifier lookup stays; free-text people need at least one root post. */
export function keepSearchPerson(
  pubkey: string,
  targetPubkey: string | null,
  postedPubkeys: Set<string>,
): boolean {
  const pk = pubkey.trim().toLowerCase()
  if (targetPubkey && pk === targetPubkey) return true
  return postedPubkeys.has(pk)
}

export function isSearchPostEvent(evt: Event): boolean {
  if (evt.kind === NOSTR_KINDS.note) return !isReplyNote(evt)
  return isNip52CalendarKind(evt.kind)
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * True when the code point immediately before `index` is a letter, number, or `_`.
 * Lookbehind (`(?<!…)`) throws "invalid group specifier name" on Safari before 16.4.
 */
let trailingWordChar: RegExp | undefined

function endsWithWordChar(text: string, index: number): boolean {
  if (index <= 0) return false
  if (!trailingWordChar) {
    try {
      trailingWordChar = new RegExp('[\\p{L}\\p{N}_]$', 'u')
    } catch {
      trailingWordChar = /[0-9A-Za-z_]$/
    }
  }
  const start = Math.max(0, index - 2)
  return trailingWordChar.test(text.slice(start, index))
}

function stripSearchNoise(text: string): string {
  return text
    .replace(/https?:\/\/[^\s<>()]+/gi, ' ')
    .replace(/\bnostr:[a-z0-9]+\b/gi, ' ')
    .replace(/\b(?:npub|note|nevent|nprofile|naddr|nrelay)1[a-z0-9]+\b/gi, ' ')
}

export function indexOfQueryWord(haystack: string, queryLower: string): number {
  const q = queryLower.trim().toLowerCase()
  if (!q) return 0
  let re: RegExp
  try {
    re = new RegExp(escapeRegExp(q), 'giu')
  } catch {
    re = new RegExp(escapeRegExp(q), 'gi')
  }
  let match: RegExpExecArray | null
  while ((match = re.exec(haystack)) !== null) {
    if (!endsWithWordChar(haystack, match.index)) return match.index
    re.lastIndex = match.index + 1
  }
  return -1
}

function textHasQueryWord(haystack: string, queryLower: string): boolean {
  return indexOfQueryWord(haystack, queryLower) >= 0
}

export function parseKind0Profile(content: string): {
  name?: string
  displayName?: string
  picture?: string
  about?: string
} {
  try {
    const data = JSON.parse(content) as Record<string, unknown>
    return {
      name: typeof data.name === 'string' ? data.name.trim() : undefined,
      displayName: typeof data.display_name === 'string' ? data.display_name.trim() : undefined,
      picture: typeof data.picture === 'string' ? data.picture.trim() : undefined,
      about: typeof data.about === 'string' ? data.about.trim() : undefined,
    }
  } catch {
    return {}
  }
}

function hasHashtagQuery(evt: Event, queryLower: string): boolean {
  for (const tag of evt.tags) {
    if (tag[0] !== 't') continue
    const value = (tag[1] ?? '').trim().toLowerCase()
    if (value === queryLower || value.startsWith(queryLower)) return true
  }
  return false
}

/** 2 = name, 1 = about, 0 = no profile text match. */
export function scoreSearchPerson(
  profile: { name?: string; displayName?: string; about?: string },
  queryLower: string,
): number {
  if (!queryLower) return 0
  const nameBlob = stripSearchNoise(`${profile.name ?? ''} ${profile.displayName ?? ''}`.trim())
  if (textHasQueryWord(nameBlob, queryLower)) return 2
  if (textHasQueryWord(stripSearchNoise(profile.about ?? ''), queryLower)) return 1
  return 0
}

function eventTextMatchesQuery(evt: Event, queryLower: string): boolean {
  if (textHasQueryWord(stripSearchNoise(evt.content ?? ''), queryLower)) return true
  if (hasHashtagQuery(evt, queryLower)) return true
  if (!isNip52CalendarKind(evt.kind)) return false
  return (
    textHasQueryWord(stripSearchNoise(nip52Title(evt)), queryLower) ||
    textHasQueryWord(stripSearchNoise(nip52Summary(evt) ?? ''), queryLower) ||
    textHasQueryWord(stripSearchNoise(nip52LocationsLine(evt) ?? ''), queryLower)
  )
}

export function searchEventMatchesQuery(evt: Event, queryLower: string): boolean {
  if (!queryLower) return true
  if (evt.kind === NOSTR_KINDS.metadata) {
    return scoreSearchPerson(parseKind0Profile(evt.content ?? ''), queryLower) > 0
  }
  return eventTextMatchesQuery(evt, queryLower)
}

/** Keep identifier-lookup hits even when the post body does not contain the query. */
export function searchResultMatchesQuery(
  evt: Event,
  queryLower: string,
  targetPubkey: string | null,
): boolean {
  if (targetPubkey && evt.pubkey.toLowerCase() === targetPubkey) return true
  return searchEventMatchesQuery(evt, queryLower)
}
