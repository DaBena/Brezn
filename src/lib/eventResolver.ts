import type { Event } from './nostrPrimitives'
import type { BreznNostrClient } from './nostrClient'

const CACHE_TTL_MS = 10 * 60 * 1000
const CACHE_MAX = 300
const REQUEST_TIMEOUT_MS = 3500
/** Some relays cap `ids` length; stay conservative. */
const IDS_CHUNK = 80

type CachedEvent = { value: Event | null; cachedAt: number }

const cache = new Map<string, CachedEvent>()
const batchInflight = new Map<string, Promise<Record<string, Event | null>>>()

function normalizeEventId(eventId: string): string {
  return (eventId ?? '').trim().toLowerCase()
}

function readCache(eventId: string): Event | null | undefined {
  const item = cache.get(eventId)
  if (!item) return undefined
  if (Date.now() - item.cachedAt > CACHE_TTL_MS) {
    cache.delete(eventId)
    return undefined
  }
  return item.value
}

function writeCache(eventId: string, value: Event | null): void {
  cache.set(eventId, { value, cachedAt: Date.now() })
  if (cache.size <= CACHE_MAX) return
  const oldest = cache.keys().next().value
  if (oldest) cache.delete(oldest)
}

function fetchIdsChunk(
  client: BreznNostrClient,
  ids: string[],
): Promise<Record<string, Event | null>> {
  if (ids.length === 0) return Promise.resolve({})
  const idSet = new Set(ids)
  const found: Record<string, Event | null> = {}
  for (const id of ids) found[id] = null

  return new Promise((resolve) => {
    let settled = false
    let unsub = () => {}
    const timer: { id: ReturnType<typeof setTimeout> | null } = { id: null }
    const finish = () => {
      if (settled) return
      settled = true
      if (timer.id !== null) clearTimeout(timer.id)
      unsub()
      resolve(found)
    }
    unsub = client.subscribe(
      // Resolve by event id across all kinds (not only kind:1),
      // otherwise quoted nevent references (e.g. kind:20) fall back to external links.
      { ids, limit: ids.length },
      {
        onevent: (evt) => {
          const lo = evt.id.toLowerCase()
          if (!idSet.has(lo)) return
          found[lo] = evt
        },
        oneose: () => finish(),
      },
    )
    timer.id = globalThis.setTimeout(finish, REQUEST_TIMEOUT_MS)
  })
}

async function fetchEventsByIdsUncached(
  client: BreznNostrClient,
  ids: string[],
): Promise<Record<string, Event | null>> {
  const merged: Record<string, Event | null> = {}
  for (let i = 0; i < ids.length; i += IDS_CHUNK) {
    const chunk = ids.slice(i, i + IDS_CHUNK)
    const part = await fetchIdsChunk(client, chunk)
    Object.assign(merged, part)
  }
  return merged
}

export async function resolveEventsById(
  client: BreznNostrClient,
  eventIdsInput: string[],
): Promise<Record<string, Event | null>> {
  const eventIds = [
    ...new Set(eventIdsInput.map(normalizeEventId).filter((id) => /^[0-9a-f]{64}$/.test(id))),
  ]
  const out: Record<string, Event | null> = {}
  const need: string[] = []
  for (const id of eventIds) {
    const c = readCache(id)
    if (c !== undefined) out[id] = c
    else need.push(id)
  }
  if (need.length === 0) return out

  const batchKey = need.slice().sort().join(',')
  let p = batchInflight.get(batchKey)
  if (!p) {
    p = fetchEventsByIdsUncached(client, need)
      .then((fetched) => {
        const res: Record<string, Event | null> = {}
        for (const id of need) {
          const v = fetched[id] ?? null
          writeCache(id, v)
          res[id] = v
        }
        return res
      })
      .finally(() => {
        batchInflight.delete(batchKey)
      })
    batchInflight.set(batchKey, p)
  }

  const batchResult = await p
  return { ...out, ...batchResult }
}

export async function resolveEventById(
  client: BreznNostrClient,
  eventIdInput: string,
): Promise<Event | null> {
  const eventId = normalizeEventId(eventIdInput)
  if (!/^[0-9a-f]{64}$/.test(eventId)) return null
  const r = await resolveEventsById(client, [eventId])
  return r[eventId] ?? null
}
