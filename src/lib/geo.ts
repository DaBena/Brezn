import geohash from 'ngeohash'

export const GEOHASH_LEN_MIN_UI = 1
export const GEOHASH_LEN_MAX_UI = 5

export type GeohashLength = 1 | 2 | 3 | 4 | 5


export type GeoPoint = { lat: number; lon: number }

export function decodeGeohashCenter(hash: string): GeoPoint | null {
  const h = (hash ?? '').trim()
  if (!h) return null
  try {
    const d = geohash.decode(h)
    if (!d || typeof d.latitude !== 'number' || typeof d.longitude !== 'number') return null
    if (!Number.isFinite(d.latitude) || !Number.isFinite(d.longitude)) return null
    return { lat: d.latitude, lon: d.longitude }
  } catch {
    return null
  }
}

export function haversineDistanceKm(a: GeoPoint, b: GeoPoint): number {
  // Great-circle distance, in km.
  const R = 6371 // Earth mean radius (km)
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLon = toRad(b.lon - a.lon)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const sinDLat = Math.sin(dLat / 2)
  const sinDLon = Math.sin(dLon / 2)
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon
  const c = 2 * Math.asin(Math.min(1, Math.sqrt(h)))
  return R * c
}

export function formatApproxDistance(km: number): string {
  if (!Number.isFinite(km) || km < 0) return ''
  if (km < 1) {
    const m = Math.max(0, Math.round((km * 1000) / 50) * 50)
    return `~${m} m`
  }
  if (km < 10) {
    const v = Math.round(km * 10) / 10
    return `~${v.toLocaleString('de-DE', { maximumFractionDigits: 1 })} km`
  }
  const v = Math.round(km)
  return `~${v.toLocaleString('de-DE')} km`
}

export function geohashPrecisionHint(len: number): string {
  // Very rough, but good enough for UI explanations.
  // Source: typical geohash cell sizes at equator (approx).
  const table: Record<number, { w: string; h: string }> = {
    1: { w: '~5000 km', h: '~2500 km' },
    2: { w: '~1250 km', h: '~625 km' },
    3: { w: '~156 km', h: '~78 km' },
    4: { w: '~39 km', h: '~19 km' },
    5: { w: '~4.9 km', h: '~4.9 km' },
    6: { w: '~1.2 km', h: '~0.61 km' },
  }
  const t = table[len]
  if (!t) return 'Je höher, desto kleiner (präziser) – aber weniger Treffer.'
  return `${t.w} × ${t.h} pro Zelle (grob)`
}

export function geohashApproxCellSizeKm(len: number): { wKm: number; hKm: number } | null {
  // Approx typical geohash cell size at equator.
  // Values are intentionally rough (UI + coarse query planning).
  const table: Record<number, { wKm: number; hKm: number }> = {
    1: { wKm: 5000, hKm: 2500 },
    2: { wKm: 1250, hKm: 625 },
    3: { wKm: 156, hKm: 78 },
    4: { wKm: 39, hKm: 19 },
    5: { wKm: 4.9, hKm: 4.9 },
    6: { wKm: 1.2, hKm: 0.61 },
  }
  return table[len] ?? null
}


export function encodeGeohash(p: GeoPoint, len = 4): string {
  return geohash.encode(p.lat, p.lon, len)
}

/**
 * Generiert alle Geohash-Präfixe für einen gegebenen Geohash.
 * Alle Längen von 1 bis zur tatsächlichen Länge werden generiert für maximale Auffindbarkeit.
 * 
 * @param geohash - Ein Geohash (mindestens 1 Zeichen, idealerweise 5 Zeichen)
 * @returns Array von Geohash-Präfixen von Länge 1 bis zur tatsächlichen Länge
 * 
 * @example
 * generateGeohashTags('u0m1x') // ['u', 'u0', 'u0m', 'u0m1', 'u0m1x']
 * generateGeohashTags('u0m')   // ['u', 'u0', 'u0m']
 */
export function generateGeohashTags(geohash: string): string[] {
  const hash = (geohash ?? '').trim()
  if (!hash || hash.length < 1) return []
  
  // Generiere alle Präfixe von Länge 1 bis zur tatsächlichen Länge
  // Kein Padding - nur echte Präfixe verwenden
  const tags: string[] = []
  for (let len = 1; len <= hash.length && len <= 5; len++) {
    tags.push(hash.slice(0, len))
  }
  
  return tags
}

export async function getBrowserLocation(opts?: {
  timeoutMs?: number
  maximumAgeMs?: number
  enableHighAccuracy?: boolean
}): Promise<GeoPoint> {
  const timeout = opts?.timeoutMs ?? 8000
  const maximumAge = opts?.maximumAgeMs ?? 60_000
  const enableHighAccuracy = opts?.enableHighAccuracy ?? false

  return await new Promise<GeoPoint>((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('Geolocation not available in this browser.'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      pos => {
        resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude })
      },
      err => {
        reject(new Error(err.message || 'Failed to get location.'))
      },
      { enableHighAccuracy, timeout, maximumAge },
    )
  })
}

