import { useEffect, useRef } from 'react'
import { encodeGeohash, getGeohashMapParams } from '../lib/geo'
import type L from 'leaflet'

function attachCellSelectClick(map: L.Map, onSelect: ((geohash5: string) => void) | undefined): () => void {
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
  onRequestLocation: (onFinished?: () => void) => void
): L.Control {
  const Control = L.Control.extend({
    onAdd() {
      const div = L.DomUtil.create('div', 'leaflet-control-gps')
      div.style.border = 'none'
      div.style.background = 'transparent'
      const btn = L.DomUtil.create('button', '', div) as HTMLButtonElement
      btn.type = 'button'
      btn.className =
        'flex h-12 w-12 items-center justify-center rounded-full bg-black/40 text-white shadow-lg ring-2 ring-white/30 hover:bg-black/50 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-white'
      btn.setAttribute('aria-label', 'GPS location')
      btn.title = 'GPS location'
      btn.innerHTML = GPS_BUTTON_SVG
      L.DomEvent.disableClickPropagation(btn)
      L.DomEvent.on(btn, 'click', () => {
        onRequestLocation(() => {})
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
}) {
  const { geohash, className, onCellSelect, onRequestLocation } = props
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const rectangleRef = useRef<L.Rectangle | null>(null)
  const gpsControlRef = useRef<L.Control | null>(null)
  const effectRunIdRef = useRef(0)
  const onCellSelectRef = useRef(onCellSelect)
  onCellSelectRef.current = onCellSelect
  const onRequestLocationRef = useRef(onRequestLocation)
  onRequestLocationRef.current = onRequestLocation

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
      }
    }
  }, [])

  useEffect(() => {
    if (!mapContainerRef.current) return

    const params = getGeohashMapParams(geohash)
    if (!params) return

    const { center, bounds, zoom } = params
    const map = mapRef.current

    if (map) {
      map.setView([center.lat, center.lon], zoom)
      const rect = rectangleRef.current
      if (rect) {
        rect.setBounds(
          [
            [bounds.minLat, bounds.minLon],
            [bounds.maxLat, bounds.maxLon],
          ] as L.LatLngBoundsLiteral
        )
        map.fitBounds(rect.getBounds(), { padding: [20, 20] })
      }
      const cleanupClick = attachCellSelectClick(map, onCellSelectRef.current ?? undefined)
      return cleanupClick
    }

    const runId = ++effectRunIdRef.current
    let cleanup: (() => void) | null = null

    const initMap = async () => {
      try {
        await import('leaflet/dist/leaflet.css')
        const L = (await import('leaflet')).default

        if (runId !== effectRunIdRef.current) return

        const newMap = L.map(mapContainerRef.current!, {
          center: [center.lat, center.lon],
          zoom,
          zoomControl: true,
          attributionControl: true,
        })

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          maxZoom: 19,
        }).addTo(newMap)

        const rectangle = L.rectangle(
          [
            [bounds.minLat, bounds.minLon],
            [bounds.maxLat, bounds.maxLon],
          ],
          {
            color: '#3b82f6',
            fillColor: '#3b82f6',
            fillOpacity: 0.3,
            weight: 2,
          },
        ).addTo(newMap)

        newMap.fitBounds(rectangle.getBounds(), { padding: [20, 20] })

        cleanup = attachCellSelectClick(newMap, onCellSelectRef.current ?? undefined)

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
            (onFinished) => onRequestLocationRef.current?.(onFinished)
          )
        }

        if (runId !== effectRunIdRef.current) {
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
  }, [geohash])

  return (
    <div
      ref={mapContainerRef}
      className={`${className ?? 'h-full w-full'}${onCellSelect ? ' cursor-pointer' : ''}`}
    />
  )
}

