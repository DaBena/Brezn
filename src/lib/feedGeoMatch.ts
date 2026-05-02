import type { Event } from 'nostr-tools'
import { getEastWestNeighbors } from './geo'
import { NOSTR_KINDS } from './breznNostr'
import {
  isNip52CalendarKind,
  isValidNip52CalendarEvent,
  nip52CalendarMatchesQueryCells,
} from './nip52'
import { isReplyNote } from './nostrUtils'

/**
 * Mode 0 (precision "cell"): coarse 1-char + east/west plus the saved 5-char `#g`.
 * Mirrors useLocalFeed / relay REQ cells.
 */
export function gCellsCoarsePlusFine(queryGeohash: string): string[] {
  const oneCharHash = queryGeohash.slice(0, 1)
  const neighbors = getEastWestNeighbors(oneCharHash)
  const coarse = neighbors ? [oneCharHash, neighbors.east, neighbors.west] : [oneCharHash]
  return coarse.includes(queryGeohash) ? coarse : [...coarse, queryGeohash]
}

export function getQueryCellsForFeed(queryGeohash: string, geohashLength: number): string[] {
  if (geohashLength === 0 && queryGeohash.length === 5) {
    return gCellsCoarsePlusFine(queryGeohash)
  }
  return [queryGeohash]
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
    const hashes = evt.tags.filter((t) => t[0] === 'g' && typeof t[1] === 'string').map((t) => t[1]!)
    return geohashTagsMatchQueryCells(hashes, cells)
  }
  if (isNip52CalendarKind(evt.kind)) {
    if (!isValidNip52CalendarEvent(evt)) return false
    return nip52CalendarMatchesQueryCells(evt, cells)
  }
  return false
}

/** Drop roots that no longer belong to the active geo query (relay races / load-more edge cases). */
export function filterFeedEventsByQuery(
  events: Event[],
  queryGeohash: string | null,
  geohashLength: number,
): Event[] {
  if (!queryGeohash) return []
  const cells = getQueryCellsForFeed(queryGeohash, geohashLength)
  return events.filter((e) => feedRootEventMatchesQueryCells(e, cells))
}
