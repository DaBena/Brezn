import {
  NIP11_CACHE_TTL_MS,
  NIP11_FETCH_TIMEOUT_MS,
  NIP11_NEGATIVE_CACHE_TTL_MS,
} from './constants'

export type Nip11CacheEntry = {
  nips: Set<number>
  fetchedAt: number
  ok: boolean
}

const cache = new Map<string, Nip11CacheEntry>()
const inflight = new Map<string, Promise<Nip11CacheEntry>>()

export function resetNip11Cache(): void {
  cache.clear()
  inflight.clear()
}

/** NIP-11: same host as the websocket, `wss:` → `https:`. */
export function relayToNip11HttpUrl(relayUrl: string): string | null {
  try {
    const u = new URL(relayUrl.trim())
    if (u.protocol === 'wss:') u.protocol = 'https:'
    else if (u.protocol === 'ws:') u.protocol = 'http:'
    else return null
    u.hash = ''
    u.search = ''
    return u.toString()
  } catch {
    return null
  }
}

export function parseSupportedNips(body: unknown): Set<number> {
  const nips = new Set<number>()
  if (!body || typeof body !== 'object') return nips
  const raw = (body as { supported_nips?: unknown }).supported_nips
  if (!Array.isArray(raw)) return nips
  for (const item of raw) {
    const n = typeof item === 'number' ? item : Number(item)
    if (Number.isInteger(n) && n > 0) nips.add(n)
  }
  return nips
}

function cacheKey(relayUrl: string): string {
  return relayUrl.trim().toLowerCase().replace(/\/+$/, '')
}

function ttlMs(entry: Nip11CacheEntry): number {
  return entry.ok ? NIP11_CACHE_TTL_MS : NIP11_NEGATIVE_CACHE_TTL_MS
}

async function fetchNip11Entry(relayUrl: string): Promise<Nip11CacheEntry> {
  const httpUrl = relayToNip11HttpUrl(relayUrl)
  const now = Date.now()
  if (!httpUrl) return { nips: new Set(), fetchedAt: now, ok: false }

  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), NIP11_FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(httpUrl, {
      method: 'GET',
      headers: { Accept: 'application/nostr+json' },
      signal: ac.signal,
    })
    if (!res.ok) return { nips: new Set(), fetchedAt: Date.now(), ok: false }
    const body: unknown = await res.json()
    return { nips: parseSupportedNips(body), fetchedAt: Date.now(), ok: true }
  } catch {
    return { nips: new Set(), fetchedAt: Date.now(), ok: false }
  } finally {
    clearTimeout(timer)
  }
}

export async function getRelaySupportedNips(relayUrl: string): Promise<Set<number>> {
  const key = cacheKey(relayUrl)
  const cached = cache.get(key)
  if (cached && Date.now() - cached.fetchedAt < ttlMs(cached)) return cached.nips

  const pending = inflight.get(key)
  if (pending) return (await pending).nips

  const task = fetchNip11Entry(relayUrl).then((entry) => {
    cache.set(key, entry)
    inflight.delete(key)
    return entry
  })
  inflight.set(key, task)
  return (await task).nips
}

/** Relays whose NIP-11 document lists `nip`. Failed/missing docs are skipped. */
export async function relaysSupportingNip(relayUrls: string[], nip: number): Promise<string[]> {
  const out: string[] = []
  const seen = new Set<string>()
  await Promise.all(
    relayUrls.map(async (url) => {
      const key = cacheKey(url)
      if (!key || seen.has(key)) return
      seen.add(key)
      const nips = await getRelaySupportedNips(url)
      if (nips.has(nip)) out.push(url)
    }),
  )
  return out
}
