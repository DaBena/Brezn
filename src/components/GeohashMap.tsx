import { useEffect, useRef } from 'react'
import { decodeGeohashCenter, getGeohashBounds, getGeohashZoomLevel } from '../lib/geo'
import type L from 'leaflet'

export function GeohashMap(props: { geohash: string; className?: string; centerTrigger?: number }) {
  const { geohash, className, centerTrigger } = props
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const rectangleRef = useRef<L.Rectangle | null>(null)

  // Re-center map on the blue rectangle when centerTrigger changes
  useEffect(() => {
    const map = mapRef.current
    const rectangle = rectangleRef.current
    if (map && rectangle) {
      map.fitBounds(rectangle.getBounds(), { padding: [20, 20] })
    }
  }, [centerTrigger])

  useEffect(() => {
    if (!mapContainerRef.current) return

    let cleanup: (() => void) | null = null

    const initMap = async () => {
      try {
        await import('leaflet/dist/leaflet.css')
        const L = (await import('leaflet')).default

        // Fix for default marker icon issue in Vite (harmless even if unused).
        delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl
        L.Icon.Default.mergeOptions({
          iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
          iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
          shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
        })

        const center = decodeGeohashCenter(geohash)
        const bounds = getGeohashBounds(geohash)
        const zoom = getGeohashZoomLevel(geohash)
        if (!center || !bounds) return

        const map = L.map(mapContainerRef.current!, {
          center: [center.lat, center.lon],
          zoom,
          zoomControl: true,
          attributionControl: true,
        })

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          maxZoom: 19,
        }).addTo(map)

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
        ).addTo(map)

        map.fitBounds(rectangle.getBounds(), { padding: [20, 20] })

        try {
          const container = mapContainerRef.current
          const flagEl = container?.querySelector<SVGElement>('.leaflet-attribution-flag')
          flagEl?.remove()
        } catch {
          // ignore
        }

        mapRef.current = map
        rectangleRef.current = rectangle

        cleanup = () => {
          map.remove()
          mapRef.current = null
          rectangleRef.current = null
        }
      } catch (error) {
        console.error('Failed to load map:', error)
      }
    }

    void initMap()

    return () => {
      if (cleanup) cleanup()
    }
  }, [geohash])

  return <div ref={mapContainerRef} className={className ?? 'h-full w-full'} />
}

