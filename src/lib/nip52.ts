import type { Event } from './nostrPrimitives'
import { NOSTR_KINDS } from './breznNostr'
import { geohashValuesMatchQueryCells } from './geo'
import { firstNonEmptyTagValue } from './nostrUtils'

/** NIP-52: date-based calendar event (all-day / multi-day). */
export const NIP52_KIND_DATE_EVENT = NOSTR_KINDS.nip52DateEvent
/** NIP-52: time-based calendar event (start/end timestamps). */
export const NIP52_KIND_TIME_EVENT = NOSTR_KINDS.nip52TimeEvent

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

/**
 * True if this calendar event belongs to the same coarse query cells as the local note feed.
 * Uses only `g` (geohash) tags; `location` / `#l` are not interpreted as coordinates.
 */
export function nip52CalendarMatchesQueryCells(evt: Event, cells: readonly string[]): boolean {
  if (!isValidNip52CalendarEvent(evt)) return false
  return geohashValuesMatchQueryCells(nip52GeohashValues(evt), cells)
}

export function nip52Title(evt: Event): string {
  return firstNonEmptyTagValue(evt, 'title') ?? firstNonEmptyTagValue(evt, 'name') ?? ''
}

export function nip52Summary(evt: Event): string | undefined {
  return firstNonEmptyTagValue(evt, 'summary')
}

function normComparableText(s: string): string {
  return s.replace(/\s+/g, ' ').trim().toLowerCase()
}

/** Event page URL from `url` or an http(s) `r` tag. */
export function nip52EventUrl(evt: Event): string | undefined {
  const tagged = firstNonEmptyTagValue(evt, 'url')
  if (tagged && /^https?:\/\//i.test(tagged)) return tagged
  for (const t of evt.tags) {
    if (t[0] !== 'r' || typeof t[1] !== 'string') continue
    const v = t[1].trim()
    if (/^https?:\/\//i.test(v)) return v
  }
  return undefined
}

/** One description: drop summary when it duplicates `content`. */
export function nip52Description(evt: Event): string | undefined {
  const summary = (nip52Summary(evt) ?? '').trim()
  const content = (evt.content ?? '').trim()
  if (!summary && !content) return undefined
  if (!summary) return content
  if (!content) return summary
  const ns = normComparableText(summary)
  const nc = normComparableText(content)
  if (ns === nc) return summary
  if (nc.includes(ns)) return content
  if (ns.includes(nc)) return summary
  return `${summary}\n\n${content}`
}

export function isValidNip52CalendarEvent(evt: Event): boolean {
  if (!isNip52CalendarKind(evt.kind)) return false
  const d = firstNonEmptyTagValue(evt, 'd')
  const title = nip52Title(evt)
  const start = firstNonEmptyTagValue(evt, 'start')
  return Boolean(d && title && start)
}

/**
 * Plain text for feed/profile search and fallbacks.
 * Title, schedule, location, url, then a single description (summary/content deduped).
 */
export function nip52FeedCardPostContent(evt: Event): string {
  if (!isNip52CalendarKind(evt.kind)) return evt.content ?? ''
  const blocks = [
    nip52Title(evt),
    nip52FormatSchedule(evt),
    nip52LocationsLine(evt),
    nip52EventUrl(evt),
    nip52Description(evt),
  ].filter(Boolean)
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
  const tz = firstNonEmptyTagValue(evt, 'start_tzid')
  let line = formatCalendarInstant(startSec, tz)
  if (end) {
    const endSec = Number(end)
    if (Number.isFinite(endSec)) {
      const endTz = firstNonEmptyTagValue(evt, 'end_tzid') ?? tz
      line += ` → ${formatCalendarInstant(endSec, endTz)}`
    }
  }
  return line
}

/** Remote `start_tzid` is untrusted. An unknown zone throws and would blank the app. */
function formatCalendarInstant(sec: number, timeZone?: string): string {
  const dt = new Date(sec * 1000)
  const base: Intl.DateTimeFormatOptions = { dateStyle: 'short', timeStyle: 'short' }
  if (timeZone) {
    try {
      return dt.toLocaleString(undefined, { ...base, timeZone })
    } catch {
      // Fall back to the runtime zone.
    }
  }
  return dt.toLocaleString(undefined, base)
}

/** Lowercase blob for search (content + tags). */
export function nip52SearchBlob(evt: Event): string {
  if (!isNip52CalendarKind(evt.kind)) return ''
  const parts = [
    evt.content ?? '',
    nip52Title(evt),
    nip52Summary(evt) ?? '',
    nip52LocationsLine(evt) ?? '',
    nip52EventUrl(evt) ?? '',
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
