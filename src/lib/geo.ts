import geohash from 'ngeohash'

export const GEOHASH_LEN_MIN_UI = 1
export const GEOHASH_LEN_MAX_UI = 5

export type GeohashLength = 1 | 2 | 3 | 4 | 5


/**
 * Geographic point with latitude and longitude.
 */
export type GeoPoint = { lat: number; lon: number }

/**
 * Decodes a geohash string to its center point.
 * @param hash - Geohash string (1-12 characters)
 * @returns Center point of the geohash cell, or null if invalid
 */
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

/**
 * Calculates the great-circle distance between two geographic points.
 * Uses the Haversine formula.
 * @param a - First point
 * @param b - Second point
 * @returns Distance in kilometers
 */
export function haversineDistanceKm(a: GeoPoint, b: GeoPoint): number {
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

/**
 * Formats a distance in kilometers as a human-readable string.
 * For very small distances (< 0.1km), shows the geohash cell size instead.
 * @param km - Distance in kilometers
 * @param geohashLength - Optional geohash length for cell size display
 * @returns Formatted string (e.g., "~50 m", "~2.5 km", "~10 km")
 */
export function formatApproxDistance(km: number, geohashLength?: number): string {
  if (!Number.isFinite(km) || km < 0) return ''
  
  // For posts in the same cell (distance is 0 or very close to 0), show cell size instead
  // Only show static values when distance is essentially zero (< 0.1 km = 100m)
  if (km < 0.1) {
    if (geohashLength === 5) {
      return '~2 km'
    }
    if (geohashLength === 4) {
      return '~10 km'
    }
    if (geohashLength === 3) {
      return '~40 km'
    }
  }
  
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
  if (!t) return 'Higher = smaller (more precise) - but fewer results.'
  return `${t.w} × ${t.h} per cell`
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


/**
 * Encodes a geographic point to a geohash string.
 * @param p - Geographic point
 * @param len - Geohash length (1-12), default: 4
 * @returns Geohash string
 */
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

/**
 * Gets the current browser location using the Geolocation API.
 * @param opts - Options for geolocation
 * @param opts.timeoutMs - Maximum time to wait (default: 8000ms)
 * @param opts.maximumAgeMs - Maximum age of cached location (default: 60000ms)
 * @param opts.enableHighAccuracy - Request high accuracy (default: false)
 * @returns Promise resolving to current location
 * @throws If geolocation is not available or user denies permission
 */
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

