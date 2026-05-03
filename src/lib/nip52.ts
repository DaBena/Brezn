import type { Event } from './nostrPrimitives'
import {
  decodeGeohashCenter,
  formatApproxDistance,
  haversineDistanceKm,
  type GeoPoint,
} from './geo'
import { firstNonEmptyTagValue, getLongestGeohashTag } from './nostrUtils'

/** NIP-52: date-based calendar event (all-day / multi-day). */
export const NIP52_KIND_DATE_EVENT = 31922
/** NIP-52: time-based calendar event (start/end timestamps). */
export const NIP52_KIND_TIME_EVENT = 31923

export const NIP52_CALENDAR_EVENT_KINDS = [NIP52_KIND_DATE_EVENT, NIP52_KIND_TIME_EVENT] as const

export function isNip52CalendarKind(kind: number): boolean {
  return kind === NIP52_KIND_DATE_EVENT || kind === NIP52_KIND_TIME_EVENT
}

/** Addressable coordinate for replaceable merge (kind:pubkey:d). */
export function nip52ReplaceableMergeKey(evt: Event): string | null {
  if (!isNip52CalendarKind(evt.kind)) return null
  const d = firstNonEmptyTagValue(evt, 'd')
  if (!d) return null
  return `${evt.kind}:${evt.pubkey}:${d}`
}

/** All `g` tag values (NIP-52 uses `g` like other geotagged events). */
export function nip52GeohashValues(evt: Event): string[] {
  return evt.tags.filter((t) => t[0] === 'g' && typeof t[1] === 'string').map((t) => t[1] as string)
}

function nip52LocationStrings(evt: Event): string[] {
  return evt.tags
    .filter((t) => t[0] === 'location' && typeof t[1] === 'string')
    .map((t) => t[1] as string)
}

/** Map point for distance display from `g` tags only (NIP-52 `location` is free text, not coordinates). */
export function nip52ApproxPoint(evt: Event): GeoPoint | null {
  if (!isNip52CalendarKind(evt.kind)) return null
  const longestG = getLongestGeohashTag(evt)
  if (!longestG) return null
  return decodeGeohashCenter(longestG)
}

export function nip52DistanceLabel(evt: Event, viewerPoint: GeoPoint | null): string | null {
  if (!viewerPoint || !isNip52CalendarKind(evt.kind)) return null
  const p = nip52ApproxPoint(evt)
  if (!p) return null
  const km = haversineDistanceKm(viewerPoint, p)
  const g = getLongestGeohashTag(evt)
  const label = formatApproxDistance(km, g?.length)
  return label || null
}

/**
 * True if this calendar event belongs to the same coarse query cells as the local note feed.
 * Uses only `g` (geohash) tags; `location` / `#l` are not interpreted as coordinates.
 */
export function nip52CalendarMatchesQueryCells(evt: Event, cells: string[]): boolean {
  if (!isValidNip52CalendarEvent(evt)) return false
  const cellsL = cells.map((c) => c.trim().toLowerCase()).filter(Boolean)
  if (!cellsL.length) return false

  const hashes: string[] = nip52GeohashValues(evt)
    .map((g) => g.trim().toLowerCase())
    .filter(Boolean)
  if (!hashes.length) return false

  for (const cell of cellsL) {
    for (const h of hashes) {
      if (h.startsWith(cell) || cell.startsWith(h)) return true
    }
  }
  return false
}

export function nip52Title(evt: Event): string {
  return firstNonEmptyTagValue(evt, 'title') ?? firstNonEmptyTagValue(evt, 'name') ?? ''
}

export function nip52Summary(evt: Event): string | undefined {
  return firstNonEmptyTagValue(evt, 'summary')
}

export function isValidNip52CalendarEvent(evt: Event): boolean {
  if (!isNip52CalendarKind(evt.kind)) return false
  const d = firstNonEmptyTagValue(evt, 'd')
  const title = nip52Title(evt)
  const start = firstNonEmptyTagValue(evt, 'start')
  return Boolean(d && title && start)
}

/**
 * Plain text for feed/profile list cards — same shape as kind 1 `content` (one `PostContent` block).
 * Title, schedule, location, url, then summary + raw `content`.
 */
export function nip52FeedCardPostContent(evt: Event): string {
  if (!isNip52CalendarKind(evt.kind)) return evt.content ?? ''
  const title = nip52Title(evt)
  const schedule = nip52FormatSchedule(evt)
  const loc = nip52LocationsLine(evt)
  const url = firstNonEmptyTagValue(evt, 'url')
  const descParts = [nip52Summary(evt), evt.content ?? '']
    .map((s) => (typeof s === 'string' ? s.trim() : ''))
    .filter(Boolean)
  const description = descParts.join('\n\n').trim()
  const blocks = [title, schedule, loc, url, description].filter(Boolean)
  return blocks.join('\n\n').trim()
}

export function nip52LocationsLine(evt: Event): string | undefined {
  const locs = nip52LocationStrings(evt)
    .map((s) => s.trim())
    .filter(Boolean)
  if (!locs.length) return undefined
  return locs.join(' · ')
}

/** Human-readable start/end line for feed cards. */
export function nip52FormatSchedule(evt: Event): string {
  const start = firstNonEmptyTagValue(evt, 'start')
  const end = firstNonEmptyTagValue(evt, 'end')
  if (!start) return ''

  if (evt.kind === NIP52_KIND_DATE_EVENT) {
    if (end && end !== start) return `${start} → ${end}`
    return start
  }

  const startSec = Number(start)
  if (!Number.isFinite(startSec)) return start
  const startDt = new Date(startSec * 1000)
  const tz = firstNonEmptyTagValue(evt, 'start_tzid')
  const opts: Intl.DateTimeFormatOptions = {
    dateStyle: 'short',
    timeStyle: 'short',
    ...(tz ? { timeZone: tz } : {}),
  }
  let line = startDt.toLocaleString(undefined, opts)
  if (end) {
    const endSec = Number(end)
    if (Number.isFinite(endSec)) {
      const endDt = new Date(endSec * 1000)
      const endTz = firstNonEmptyTagValue(evt, 'end_tzid') ?? tz
      const endOpts: Intl.DateTimeFormatOptions = {
        dateStyle: 'short',
        timeStyle: 'short',
        ...(endTz ? { timeZone: endTz } : {}),
      }
      line += ` → ${endDt.toLocaleString(undefined, endOpts)}`
    }
  }
  return line
}

/** Lowercase blob for search (content + tags). */
export function nip52SearchBlob(evt: Event): string {
  if (!isNip52CalendarKind(evt.kind)) return ''
  const parts = [
    evt.content ?? '',
    nip52Title(evt),
    nip52Summary(evt) ?? '',
    nip52LocationsLine(evt) ?? '',
    firstNonEmptyTagValue(evt, 'url') ?? '',
    ...nip52GeohashValues(evt),
    ...nip52LocationStrings(evt),
  ]
  return parts.join('\n').toLowerCase()
}

/** Insert or replace by id; for NIP-52 calendar events merge replaceable revisions (same `d`). */
export function upsertFeedEvents(prev: Event[], evt: Event): Event[] {
  const rk = nip52ReplaceableMergeKey(evt)
  if (rk) {
    const idx = prev.findIndex((e) => nip52ReplaceableMergeKey(e) === rk)
    if (idx >= 0) {
      const cur = prev[idx]!
      if (evt.created_at < cur.created_at) return prev
      const next = [...prev]
      next[idx] = evt
      return next
    }
  }
  if (prev.some((e) => e.id === evt.id)) return prev
  return [evt, ...prev]
}
