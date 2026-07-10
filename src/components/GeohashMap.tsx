import { useEffect, useRef } from 'react'
import {
  encodeGeohash,
  getGeohashMapParams,
  WORLD_MANUAL_PICK_MAP_CENTER,
  WORLD_MANUAL_PICK_MAP_ZOOM,
  type GeoPoint,
} from '../lib/geo'
import { syncPostGeo5Layer } from '../lib/feedMapGeo5'
import { readCssVar } from '../lib/readCssVar'
import type L from 'leaflet'

type LeafletModule = typeof import('leaflet')

type LatLonBounds = { minLat: number; maxLat: number; minLon: number; maxLon: number }

type MapLayout = { center: GeoPoint; zoom: number; bounds: LatLonBounds | null }

function resolveLayout(worldPick: boolean, gh: string): MapLayout | null {
  if (worldPick) {
    return {
      center: WORLD_MANUAL_PICK_MAP_CENTER,
      zoom: WORLD_MANUAL_PICK_MAP_ZOOM,
      bounds: null,
    }
  }
  const p = getGeohashMapParams(gh.trim())
  if (!p) return null
  return { center: p.center, zoom: p.zoom, bounds: p.bounds }
}

function scheduleInvalidateAndFit(
  map: L.Map,
  rectangle: L.Rectangle | null,
  layout: MapLayout,
  afterFit: () => void,
) {
  const run = () => {
    map.invalidateSize({ animate: false })
    const b = layout.bounds
    if (rectangle && b) {
      rectangle.setBounds([
        [b.minLat, b.minLon],
        [b.maxLat, b.maxLon],
      ] as L.LatLngBoundsLiteral)
      map.fitBounds(rectangle.getBounds(), { padding: [20, 20], animate: false })
    } else {
      map.setView([layout.center.lat, layout.center.lon], layout.zoom, { animate: false })
    }
    afterFit()
  }
  requestAnimationFrame(() => requestAnimationFrame(run))
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
  geohash?: string
  worldPick?: boolean
  className?: string
  onCellSelect?: (geohash5: string) => void
  onRequestLocation?: (onFinished?: () => void) => void
  gpsAriaLabel?: string
  gpsTitle?: string
  /** geo5 cells with feed posts (viewer cell should already be omitted). */
  postGeo5?: string[]
  mapRelayoutTick?: number
}) {
  const {
    geohash = '',
    worldPick = false,
    className,
    onCellSelect,
    onRequestLocation,
    gpsAriaLabel,
    gpsTitle,
    postGeo5 = [],
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
  const postGeo5LayerRef = useRef<L.LayerGroup | null>(null)
  const postGeo5Ref = useRef(postGeo5)
  postGeo5Ref.current = postGeo5

  const syncPostGeo5 = () => {
    const Lm = leafletLibRef.current
    const layer = postGeo5LayerRef.current
    if (!Lm || !layer) return
    syncPostGeo5Layer(Lm, layer, postGeo5Ref.current, onCellSelectRef.current)
    rectangleRef.current?.bringToFront()
  }

  useEffect(() => {
    const root = mapContainerRef.current
    const btn = root?.querySelector<HTMLButtonElement>('.leaflet-control-gps button')
    if (!btn) return
    btn.setAttribute('aria-label', gpsLabels.ariaLabel)
    btn.title = gpsLabels.title
  }, [gpsLabels.ariaLabel, gpsLabels.title])

  useEffect(() => {
    return () => {
      gpsControlRef.current?.remove()
      gpsControlRef.current = null
      const map = mapRef.current
      if (map) {
        map.off('click')
        map.remove()
        mapRef.current = null
        rectangleRef.current = null
        postGeo5LayerRef.current = null
        leafletLibRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (!mapContainerRef.current) return

    const worldPickMode = worldPick === true
    const layout = resolveLayout(worldPickMode, geohash)
    if (!layout) return

    const map = mapRef.current
    if (map) {
      const rect = layout.bounds ? rectangleRef.current : null
      scheduleInvalidateAndFit(map, rect, layout, syncPostGeo5)
      return attachCellSelectClick(map, onCellSelectRef.current ?? undefined)
    }

    const runId = ++effectRunIdRef.current
    let cleanup: (() => void) | null = null

    const initMap = async () => {
      try {
        await import('leaflet/dist/leaflet.css')
        const leafletMod = await import('leaflet')
        const L = leafletMod.default as LeafletModule

        if (runId !== effectRunIdRef.current) return

        const newMap = L.map(mapContainerRef.current!, {
          center: [layout.center.lat, layout.center.lon],
          zoom: layout.zoom,
          zoomControl: true,
          attributionControl: true,
          zoomAnimation: false,
        })

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution:
            '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          maxZoom: 19,
        }).addTo(newMap)

        postGeo5LayerRef.current = L.layerGroup().addTo(newMap)
        leafletLibRef.current = L

        let rectangle: L.Rectangle | null = null
        if (layout.bounds) {
          const hilite = readCssVar('--brezn-link', '#3c83f7')
          rectangle = L.rectangle(
            [
              [layout.bounds.minLat, layout.bounds.minLon],
              [layout.bounds.maxLat, layout.bounds.maxLon],
            ],
            {
              color: hilite,
              fillColor: hilite,
              fillOpacity: 0.3,
              weight: 2,
            },
          ).addTo(newMap)
        }

        cleanup = attachCellSelectClick(newMap, onCellSelectRef.current ?? undefined)

        newMap.whenReady(() => {
          if (runId !== effectRunIdRef.current) return
          const fresh = resolveLayout(worldPickMode, geohashRef.current)
          if (!fresh) return
          const rectNow = fresh.bounds ? rectangle : null
          if (fresh.bounds && !rectNow) return
          scheduleInvalidateAndFit(newMap, rectNow, fresh, syncPostGeo5)
        })

        try {
          mapContainerRef.current?.querySelector<SVGElement>('.leaflet-attribution-flag')?.remove()
        } catch {
          void 0
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
          postGeo5LayerRef.current = null
          leafletLibRef.current = null
          newMap.remove()
          return
        }
        mapRef.current = newMap
        rectangleRef.current = rectangle
      } catch (error) {
        console.error('Failed to load map:', error)
      }
    }

    void initMap()

    return () => {
      if (cleanup) cleanup()
    }
  }, [geohash, mapRelayoutTick, worldPick])

  useEffect(() => {
    syncPostGeo5()
  }, [postGeo5, onCellSelect])

  return (
    <div
      ref={mapContainerRef}
      className={`${className ?? 'h-full w-full'}${onCellSelect ? ' cursor-pointer' : ''}`}
    />
  )
}
