import geohash from 'ngeohash'
import type { Event } from 'nostr-tools'
import { getLongestGeohashTag } from './nostrUtils'

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
 * Generates all geohash prefixes for a given geohash.
 * All lengths from 1 to the actual length are generated for maximum discoverability.
 * 
 * @param geohash - A geohash (at least 1 character, ideally 5 characters)
 * @returns Array of geohash prefixes from length 1 to the actual length
 * 
 * @example
 * generateGeohashTags('u0m1x') // ['u', 'u0', 'u0m', 'u0m1', 'u0m1x']
 * generateGeohashTags('u0m')   // ['u', 'u0', 'u0m']
 */
export function generateGeohashTags(geohash: string): string[] {
  const hash = (geohash ?? '').trim()
  if (!hash || hash.length < 1) return []
  
  // Generate all prefixes from length 1 to the actual length
  // No padding - only use real prefixes
  const tags: string[] = []
  for (let len = 1; len <= hash.length && len <= 5; len++) {
    tags.push(hash.slice(0, len))
  }
  
  return tags
}

/**
 * Gets the east and west neighboring geohash cells.
 * @param hash - Geohash string
 * @returns Object with east and west neighbor hashes, or null if invalid
 */
export function getEastWestNeighbors(hash: string): { east: string; west: string } | null {
  const h = (hash ?? '').trim()
  if (!h) return null
  try {
    const allNeighbors = geohash.neighbors(h)
    // neighbors() returns [n, ne, e, se, s, sw, w, nw]
    // We need east (index 2) and west (index 6)
    if (allNeighbors.length >= 7) {
      return { east: allNeighbors[2], west: allNeighbors[6] }
    }
    return null
  } catch {
    return null
  }
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

/**
 * Calculates the approximate distance from a viewer point to an event's geohash location.
 * Uses the longest (most precise) geohash tag from the event for accurate distance calculation.
 * @param evt - Nostr event with geohash tags
 * @param viewerPoint - Viewer's geographic location
 * @returns Formatted distance string (e.g., "~2.3 km") or null if calculation not possible
 */
export function calculateApproxDistance(evt: Event, viewerPoint: GeoPoint | null): string | null {
  if (!viewerPoint) return null
  // Use the longest (most precise) geohash tag for accurate distance calculation
  const g = getLongestGeohashTag(evt)
  if (!g) return null
  const p = decodeGeohashCenter(g)
  if (!p) return null
  const km = haversineDistanceKm(viewerPoint, p)
  const label = formatApproxDistance(km, g.length)
  return label || null
}

/**
 * Calculates the bounding box (bounds) of a geohash cell.
 * Returns the min/max latitude and longitude of the rectangular cell.
 * Uses neighbors to estimate bounds more accurately.
 * @param hash - Geohash string
 * @returns Bounding box with min/max lat/lon, or null if invalid
 */
export function getGeohashBounds(hash: string): { minLat: number; maxLat: number; minLon: number; maxLon: number } | null {
  const h = (hash ?? '').trim()
  if (!h) return null
  
  try {
    // Decode to get center point
    const decoded = geohash.decode(h)
    if (!decoded || typeof decoded.latitude !== 'number' || typeof decoded.longitude !== 'number') return null
    
    const centerLat = decoded.latitude
    const centerLon = decoded.longitude
    
    // If error bounds are provided, use them (ngeohash may provide this)
    if (decoded.error && typeof decoded.error.latitude === 'number' && typeof decoded.error.longitude === 'number') {
      return {
        minLat: centerLat - decoded.error.latitude,
        maxLat: centerLat + decoded.error.latitude,
        minLon: centerLon - decoded.error.longitude,
        maxLon: centerLon + decoded.error.longitude,
      }
    }
    
    // Calculate bounds using neighbors to get more accurate cell size
    // Get all neighbors and calculate the cell size from them
    try {
      const neighbors = geohash.neighbors(h)
      if (neighbors.length >= 8) {
        // neighbors: [n, ne, e, se, s, sw, w, nw]
        const north = geohash.decode(neighbors[0])
        const south = geohash.decode(neighbors[4])
        const east = geohash.decode(neighbors[2])
        const west = geohash.decode(neighbors[6])
        
        if (north && south && east && west) {
          // Calculate cell dimensions from neighbors
          const latSize = Math.abs(north.latitude - south.latitude)
          const lonSize = Math.abs(east.longitude - west.longitude)
          
          return {
            minLat: centerLat - latSize / 2,
            maxLat: centerLat + latSize / 2,
            minLon: centerLon - lonSize / 2,
            maxLon: centerLon + lonSize / 2,
          }
        }
      }
    } catch {
      // Fall through to approximate method
    }
    
    // Fallback: approximate cell size based on geohash length
    // These are approximate cell sizes at the equator (in degrees)
    const cellSizes: Record<number, { lat: number; lon: number }> = {
      1: { lat: 45, lon: 45 },
      2: { lat: 11.25, lon: 11.25 },
      3: { lat: 1.40625, lon: 1.40625 },
      4: { lat: 0.17578125, lon: 0.17578125 },
      5: { lat: 0.02197265625, lon: 0.02197265625 },
      6: { lat: 0.00274658203125, lon: 0.00274658203125 },
      7: { lat: 0.00034332275390625, lon: 0.00034332275390625 },
      8: { lat: 0.00004291534423828125, lon: 0.00004291534423828125 },
    }
    
    const size = cellSizes[h.length] || cellSizes[5]
    // Adjust for latitude (cells get narrower away from equator)
    const latAdjustment = Math.max(0.1, Math.abs(Math.cos((centerLat * Math.PI) / 180)))
    
    return {
      minLat: centerLat - size.lat / 2,
      maxLat: centerLat + size.lat / 2,
      minLon: centerLon - size.lon / (2 * latAdjustment),
      maxLon: centerLon + size.lon / (2 * latAdjustment),
    }
  } catch {
    return null
  }
}

/**
 * Gets the appropriate zoom level for displaying a geohash on a map.
 * @param hash - Geohash string
 * @returns Zoom level (typically 1-18)
 */
export function getGeohashZoomLevel(hash: string): number {
  const len = hash.length
  // Longer geohashes = smaller cells = higher zoom
  if (len <= 2) return 3
  if (len === 3) return 6
  if (len === 4) return 9
  if (len === 5) return 12
  if (len >= 6) return 15
  return 10
}
