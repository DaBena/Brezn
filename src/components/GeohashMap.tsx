import { useEffect, useRef } from 'react'
import type { Event } from 'nostr-tools'
import { encodeGeohash, getGeohashMapParams } from '../lib/geo'
import { feedEventMapPoint } from '../lib/feedEventMapPoint'
import { readCssVar } from '../lib/readCssVar'
import type L from 'leaflet'

type LeafletModule = typeof import('leaflet')

/** Feed posts overlay — unobtrusive dots so OSM stays readable. */
const FEED_MAP_MARKER_STYLE = {
  radius: 6,
  stroke: false as const,
  weight: 0,
  fillColor: '#dc2626',
  fillOpacity: 0.5,
}

/** Leaflet often keeps wrong dimensions inside sheets; defer fit until layout settled. */
function scheduleInvalidateAndFit(
  map: L.Map,
  rectangle: L.Rectangle | null,
  params: NonNullable<ReturnType<typeof getGeohashMapParams>>,
  afterFit: () => void,
) {
  const { center, bounds, zoom } = params
  const run = () => {
    map.invalidateSize({ animate: false })
    if (rectangle) {
      rectangle.setBounds([
        [bounds.minLat, bounds.minLon],
        [bounds.maxLat, bounds.maxLon],
      ] as L.LatLngBoundsLiteral)
      map.fitBounds(rectangle.getBounds(), { padding: [20, 20] })
    } else {
      map.setView([center.lat, center.lon], zoom)
    }
    afterFit()
  }
  requestAnimationFrame(() => requestAnimationFrame(run))
}

function syncFeedEventMarkers(
  Lm: LeafletModule,
  layer: L.LayerGroup,
  events: Event[],
  onMarkerClick: ((e: Event) => void) | undefined,
) {
  layer.clearLayers()
  for (const evt of events) {
    const p = feedEventMapPoint(evt)
    if (!p) continue
    const marker = Lm.circleMarker([p.lat, p.lon], FEED_MAP_MARKER_STYLE)
    if (onMarkerClick) {
      marker.on('click', (ev: L.LeafletMouseEvent) => {
        const oe = ev.originalEvent
        if (oe) Lm.DomEvent.stopPropagation(oe)
        onMarkerClick(evt)
      })
    }
    marker.addTo(layer)
  }
}

function attachCellSelectClick(
  map: L.Map,
  onSelect: ((geohash5: string) => void) | undefined,
): () => void {
  if (!onSelect) return () => {}
  const handler = (e: L.LeafletMouseEvent) => {
    const geo5 = encodeGeohash({ lat: e.latlng.lat, lon: e.latlng.lng }, 5)
    onSelect(geo5)
  }
  map.on('click', handler)
  return () => map.off('click', handler)
}

const GPS_BUTTON_SVG =
  '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z" fill="currentColor"/></svg>'

function addGpsControl(
  L: typeof import('leaflet'),
  map: L.Map,
  onRequestLocation: (onFinished?: () => void) => void,
  gpsLabels: { ariaLabel: string; title: string },
): L.Control {
  const Control = L.Control.extend({
    onAdd() {
      const div = L.DomUtil.create('div', 'leaflet-control-gps')
      div.style.border = 'none'
      div.style.background = 'transparent'
      const btn = L.DomUtil.create('button', '', div) as HTMLButtonElement
      btn.type = 'button'
      btn.className =
        'flex h-12 w-12 items-center justify-center rounded-full bg-black/40 text-white ring-2 ring-white/30 hover:bg-black/50 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-white'
      btn.setAttribute('aria-label', gpsLabels.ariaLabel)
      btn.title = gpsLabels.title
      btn.innerHTML = GPS_BUTTON_SVG
      L.DomEvent.disableClickPropagation(btn)
      L.DomEvent.on(btn, 'click', () => {
        onRequestLocation()
      })
      return div
    },
  })
  const control = new (Control as unknown as new (options?: L.ControlOptions) => L.Control)({
    position: 'bottomleft',
  })
  control.addTo(map)
  return control
}

export function GeohashMap(props: {
  geohash: string
  className?: string
  onCellSelect?: (geohash5: string) => void
  onRequestLocation?: (onFinished?: () => void) => void
  /** Localized GPS control (defaults for rare non-composer use). */
  gpsAriaLabel?: string
  gpsTitle?: string
  /** Same source as the feed list (e.g. search-filtered); drawn on top of the cell map. */
  feedEvents?: Event[]
  onFeedMarkerClick?: (evt: Event) => void
  /** Bump after GPS / sheet layout so the map matches the current geohash while mounted. */
  mapRelayoutTick?: number
}) {
  const {
    geohash,
    className,
    onCellSelect,
    onRequestLocation,
    gpsAriaLabel,
    gpsTitle,
    feedEvents = [],
    onFeedMarkerClick,
    mapRelayoutTick = 0,
  } = props
  const gpsLabels = {
    ariaLabel: gpsAriaLabel ?? 'GPS location',
    title: gpsTitle ?? 'GPS location',
  }
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const geohashRef = useRef(geohash)
  geohashRef.current = geohash
  const mapRef = useRef<L.Map | null>(null)
  const rectangleRef = useRef<L.Rectangle | null>(null)
  const gpsControlRef = useRef<L.Control | null>(null)
  const effectRunIdRef = useRef(0)
  const onCellSelectRef = useRef(onCellSelect)
  onCellSelectRef.current = onCellSelect
  const onRequestLocationRef = useRef(onRequestLocation)
  onRequestLocationRef.current = onRequestLocation
  const gpsLabelsRef = useRef(gpsLabels)
  gpsLabelsRef.current = gpsLabels

  const leafletLibRef = useRef<LeafletModule | null>(null)
  const feedMarkersLayerRef = useRef<L.LayerGroup | null>(null)
  const feedEventsRef = useRef(feedEvents)
  feedEventsRef.current = feedEvents
  const onFeedMarkerClickRef = useRef(onFeedMarkerClick)
  onFeedMarkerClickRef.current = onFeedMarkerClick

  useEffect(() => {
    const root = mapContainerRef.current
    const btn = root?.querySelector<HTMLButtonElement>('.leaflet-control-gps button')
    if (!btn) return
    btn.setAttribute('aria-label', gpsLabels.ariaLabel)
    btn.title = gpsLabels.title
  }, [gpsLabels.ariaLabel, gpsLabels.title])

  // Unmount only: remove map so no Leaflet callbacks run after DOM is gone
  useEffect(() => {
    return () => {
      const control = gpsControlRef.current
      if (control) {
        control.remove()
        gpsControlRef.current = null
      }
      const map = mapRef.current
      if (map) {
        map.off('click')
        map.remove()
        mapRef.current = null
        rectangleRef.current = null
        feedMarkersLayerRef.current = null
        leafletLibRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (!mapContainerRef.current) return

    const params = getGeohashMapParams(geohash)
    if (!params) return

    const map = mapRef.current

    if (map) {
      const rect = rectangleRef.current
      const layer = feedMarkersLayerRef.current
      const Lm = leafletLibRef.current
      scheduleInvalidateAndFit(map, rect, params, () => {
        if (Lm && layer) {
          syncFeedEventMarkers(Lm, layer, feedEventsRef.current, onFeedMarkerClickRef.current)
        }
      })
      return attachCellSelectClick(map, onCellSelectRef.current ?? undefined)
    }

    const { center, bounds, zoom } = params
    const runId = ++effectRunIdRef.current
    let cleanup: (() => void) | null = null

    const initMap = async () => {
      try {
        await import('leaflet/dist/leaflet.css')
        const leafletMod = await import('leaflet')
        const L = leafletMod.default as LeafletModule

        if (runId !== effectRunIdRef.current) return

        const newMap = L.map(mapContainerRef.current!, {
          center: [center.lat, center.lon],
          zoom,
          zoomControl: true,
          attributionControl: true,
        })

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution:
            '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          maxZoom: 19,
        }).addTo(newMap)

        const hilite = readCssVar('--brezn-link', '#3c83f7')
        const rectangle = L.rectangle(
          [
            [bounds.minLat, bounds.minLon],
            [bounds.maxLat, bounds.maxLon],
          ],
          {
            color: hilite,
            fillColor: hilite,
            fillOpacity: 0.3,
            weight: 2,
          },
        ).addTo(newMap)

        const feedLayer = L.layerGroup().addTo(newMap)
        feedMarkersLayerRef.current = feedLayer
        leafletLibRef.current = L

        cleanup = attachCellSelectClick(newMap, onCellSelectRef.current ?? undefined)

        newMap.whenReady(() => {
          if (runId !== effectRunIdRef.current) return
          const hp = getGeohashMapParams(geohashRef.current)
          if (!hp) return
          scheduleInvalidateAndFit(newMap, rectangle, hp, () => {
            syncFeedEventMarkers(L, feedLayer, feedEventsRef.current, onFeedMarkerClickRef.current)
          })
        })

        try {
          const container = mapContainerRef.current
          const flagEl = container?.querySelector<SVGElement>('.leaflet-attribution-flag')
          flagEl?.remove()
        } catch {
          // ignore
        }

        if (onRequestLocationRef.current) {
          gpsControlRef.current = addGpsControl(
            L,
            newMap,
            (onFinished) => onRequestLocationRef.current?.(onFinished),
            gpsLabelsRef.current,
          )
        }

        if (runId !== effectRunIdRef.current) {
          feedMarkersLayerRef.current = null
          leafletLibRef.current = null
          newMap.remove()
          return
        }
        mapRef.current = newMap
        rectangleRef.current = rectangle
        // cleanup already set above (attachCellSelectClick); unmount effect removes map
      } catch (error) {
        console.error('Failed to load map:', error)
      }
    }

    void initMap()

    return () => {
      if (cleanup) cleanup()
    }
  }, [geohash, mapRelayoutTick])

  useEffect(() => {
    const Lm = leafletLibRef.current
    const layer = feedMarkersLayerRef.current
    if (!Lm || !layer) return
    syncFeedEventMarkers(Lm, layer, feedEvents, onFeedMarkerClick)
  }, [feedEvents, onFeedMarkerClick])

  return (
    <div
      ref={mapContainerRef}
      className={`${className ?? 'h-full w-full'}${onCellSelect ? ' cursor-pointer' : ''}`}
    />
  )
}
