import type { Event } from './nostrPrimitives'
import { decodeGeohashCenter } from './geo'
import type { GeoPoint } from './geo'
import { getLongestGeohashTag } from './nostrUtils'
import { isNip52CalendarKind, nip52ApproxPoint } from './nip52'

/** Approximate map coordinates for a geo-tagged feed root (kind 1 or NIP-52). */
export function feedEventMapPoint(evt: Event): GeoPoint | null {
  if (isNip52CalendarKind(evt.kind)) return nip52ApproxPoint(evt)
  const g = getLongestGeohashTag(evt)
  return g ? decodeGeohashCenter(g) : null
}
