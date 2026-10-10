import geohash from 'ngeohash'
import type { Event, Filter } from './nostrPrimitives'
import { GEOHASH_BASE32_PREFIXES, generateGeohashTags } from './geo'
import { NOSTR_KINDS, ROOT_FEED_EVENT_KINDS } from './breznNostr'
import {
  isNip52CalendarKind,
  isValidNip52CalendarEvent,
  nip52CalendarMatchesQueryCells,
} from './nip52'
import { isReplyNote } from './nostrUtils'

/** Query cell first, then N, NE, E, SE, S, SW, W, NW. Poles may repeat a hash. */
function cellAndNeighbors(prefix: string): string[] {
  const cell = prefix.trim().toLowerCase()
  if (!cell) return []
  let around: string[] = []
  try {
    around = geohash.neighbors(cell)
  } catch {
    return [cell]
  }
  const seen = new Set<string>([cell])
  const cells = [cell]
  for (const n of around) {
    const h = n.trim().toLowerCase()
    if (!h || seen.has(h)) continue
    seen.add(h)
    cells.push(h)
  }
  return cells
}

/**
 * Relay `#g` is exact match, several values in one filter are OR (one REQ, one limit).
 * Length 1–5: the sliced cell plus its eight neighbors.
 * Length 0/1 still add a second filter for the viewer's length≥2 prefixes, because
 * notes that skip the 1-char `g` tag would otherwise miss the wide query. That
 * filter keeps its own `limit`.
 */
export function buildFeedGeoFilters(
  geo5: string,
  geohashLength: number,
  base: Pick<Filter, 'kinds' | 'limit' | 'until'>,
): Filter[] {
  const cell = geo5.trim().toLowerCase()
  const radius = getQueryCellsForFeed(cell, geohashLength)
  if (geohashLength >= 2) return [{ ...base, '#g': radius }]

  const home = generateGeohashTags(cell).filter((t) => t.length >= 2)
  if (home.length === 0) return [{ ...base, '#g': radius }]
  return [
    { ...base, '#g': radius },
    { ...base, '#g': home },
  ]
}

/**
 * `#g` values for client-side keep/drop (union of relay groups).
 * Length 0: all 32 base32 1-char prefixes.
 * Length 1–5: query prefix plus its eight neighbors. Same list inside the cell,
 * regardless of which finer character the viewer sits on.
 */
export function getQueryCellsForFeed(queryGeohash: string, geohashLength: number): string[] {
  if (geohashLength === 0) {
    return [...GEOHASH_BASE32_PREFIXES]
  }
  const prefix = queryGeohash.trim().toLowerCase().slice(0, geohashLength)
  return cellAndNeighbors(prefix)
}

/** Same prefix semantics as `nip52CalendarMatchesQueryCells` for raw `#g` values. */
function geohashTagsMatchQueryCells(geohashValues: string[], cells: string[]): boolean {
  const cellsL = cells.map((c) => c.trim().toLowerCase()).filter(Boolean)
  if (!cellsL.length) return false
  const hashes = geohashValues.map((g) => g.trim().toLowerCase()).filter(Boolean)
  if (!hashes.length) return false
  for (const cell of cellsL) {
    for (const h of hashes) {
      if (h.startsWith(cell) || cell.startsWith(h)) return true
    }
  }
  return false
}

export function feedRootEventMatchesQueryCells(evt: Event, cells: string[]): boolean {
  if (evt.kind === NOSTR_KINDS.note) {
    if (isReplyNote(evt)) return false
    const hashes = evt.tags
      .filter((t) => t[0] === 'g' && typeof t[1] === 'string')
      .map((t) => t[1]!)
    return geohashTagsMatchQueryCells(hashes, cells)
  }
  if (isNip52CalendarKind(evt.kind)) {
    if (!isValidNip52CalendarEvent(evt)) return false
    return nip52CalendarMatchesQueryCells(evt, cells)
  }
  return false
}

function isFollowedFeedRoot(evt: Event): boolean {
  if (evt.kind === NOSTR_KINDS.note) return !isReplyNote(evt)
  if (isNip52CalendarKind(evt.kind)) return isValidNip52CalendarEvent(evt)
  return false
}

/** `authors` filter for followed pubkeys (no geo). Empty if nobody is followed. */
export function buildFollowedAuthorsFilters(
  pubkeys: readonly string[],
  base: Pick<Filter, 'kinds' | 'limit' | 'until'>,
): Filter[] {
  const authors: string[] = []
  const seen = new Set<string>()
  for (const p of pubkeys) {
    const pk = p.trim().toLowerCase()
    if (pk.length !== 64) continue
    if (seen.has(pk)) continue
    seen.add(pk)
    authors.push(pk)
  }
  if (authors.length === 0) return []
  return [{ ...base, kinds: base.kinds ?? [...ROOT_FEED_EVENT_KINDS], authors }]
}

/** Drop roots that no longer belong to the active geo query (relay races / load-more edge cases). */
export function filterFeedEventsByQuery(
  events: Event[],
  queryGeohash: string | null,
  geohashLength: number,
  keepPubkeys?: ReadonlySet<string>,
): Event[] {
  if (!queryGeohash) return []
  const cells = getQueryCellsForFeed(queryGeohash, geohashLength)
  return events.filter((e) => {
    if (keepPubkeys?.has(e.pubkey.toLowerCase()) && isFollowedFeedRoot(e)) return true
    return feedRootEventMatchesQueryCells(e, cells)
  })
}
