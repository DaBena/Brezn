import { GEOHASH_LEN_MAX_UI, getGeohashBounds } from './geo'
import type { Event } from './nostrPrimitives'
import { getLongestGeohashTag } from './nostrUtils'

const POST_GEO5_STYLE = {
  color: '#dc2626',
  weight: 1,
  fillColor: '#dc2626',
  fillOpacity: 0.35,
} as const

/** geo5 from a post's longest `g` tag; skips shorter tags (coarse cells). */
export function geo5FromEvent(evt: Event): string | null {
  const g = getLongestGeohashTag(evt)
  if (!g || g.length < GEOHASH_LEN_MAX_UI) return null
  return g.slice(0, GEOHASH_LEN_MAX_UI)
}

/**
 * Unique geo5 cells that have feed posts.
 * Omits `viewerGeo5` so the viewer highlight stays blue.
 */
export function postGeo5FromFeed(events: readonly Event[], viewerGeo5 = ''): string[] {
  const skip = viewerGeo5.trim()
  const seen = new Set<string>()
  const cells: string[] = []

  for (const evt of events) {
    const geo5 = geo5FromEvent(evt)
    if (!geo5 || seen.has(geo5) || geo5 === skip) continue
    seen.add(geo5)
    cells.push(geo5)
  }

  return cells
}

type LeafletModule = typeof import('leaflet')

/** Draw red geo5 rectangles for feed cells (one per unique geo5). */
export function syncPostGeo5Layer(
  L: LeafletModule,
  layer: import('leaflet').LayerGroup,
  geo5List: readonly string[],
  onSelect?: (geo5: string) => void,
): void {
  layer.clearLayers()

  for (const geo5 of geo5List) {
    const bounds = getGeohashBounds(geo5)
    if (!bounds) continue

    const rect = L.rectangle(
      [
        [bounds.minLat, bounds.minLon],
        [bounds.maxLat, bounds.maxLon],
      ],
      POST_GEO5_STYLE,
    )

    if (onSelect) {
      rect.on('click', (ev) => {
        const oe = ev.originalEvent
        if (oe) L.DomEvent.stopPropagation(oe)
        onSelect(geo5)
      })
    }

    rect.addTo(layer)
  }
}
