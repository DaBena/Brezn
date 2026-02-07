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

// Representative geohash per length (same grid, so cell size in degrees is identical for that length).
const REPRESENTATIVE_GEOHASH = 'eqcjqz'

const KM_PER_DEG_LAT = 111.32 // mean value for degree latitude to km

/**
 * Cell size in km for a given geohash length, derived from decode_bbox (exact grid).
 * @param len - Geohash length (1–6 supported)
 * @param centerLatDeg - Latitude for longitude-to-km conversion (default 0 = equator)
 */
function getCellSizeKm(len: number, centerLatDeg = 0): { wKm: number; hKm: number } | null {
  if (len < 1 || len > REPRESENTATIVE_GEOHASH.length) return null
  const hash = REPRESENTATIVE_GEOHASH.slice(0, len)
  const bounds = getGeohashBounds(hash)
  if (!bounds) return null
  const deltaLat = bounds.maxLat - bounds.minLat
  const deltaLon = bounds.maxLon - bounds.minLon
  const latRad = (centerLatDeg * Math.PI) / 180
  const kmPerDegLon = KM_PER_DEG_LAT * Math.max(0.01, Math.abs(Math.cos(latRad)))
  return {
    hKm: deltaLat * KM_PER_DEG_LAT,
    wKm: deltaLon * kmPerDegLon,
  }
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

  if (km < 0.1 && geohashLength != null) {
    const size = getCellSizeKm(geohashLength)
    if (size) {
      const cellKm = Math.max(size.wKm, size.hKm)
      if (cellKm >= 1) return `~${Math.round(cellKm)} km`
      return `~${(cellKm * 1000).toFixed(0)} m`
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
  const t = getCellSizeKm(len)
  if (!t) return 'Higher = smaller (more precise) - but fewer results.'
  const w = t.wKm >= 1 ? `~${Math.round(t.wKm)} km` : `~${(t.wKm * 1000).toFixed(0)} m`
  const h = t.hKm >= 1 ? `~${Math.round(t.hKm)} km` : `~${(t.hKm * 1000).toFixed(0)} m`
  return `${w} × ${h} per cell`
}

export function geohashApproxCellSizeKm(len: number): { wKm: number; hKm: number } | null {
  return getCellSizeKm(len)
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
 * Exact bounding box of a geohash cell from the encoding (for map display).
 * Uses ngeohash decode_bbox: [minLat, minLon, maxLat, maxLon].
 * @param hash - Geohash string
 * @returns Bounding box with min/max lat/lon, or null if invalid
 */
export function getGeohashBounds(hash: string): { minLat: number; maxLat: number; minLon: number; maxLon: number } | null {
  const h = (hash ?? '').trim()
  if (!h) return null
  try {
    // ngeohash provides decode_bbox; @types/ngeohash does not declare it
    const bbox = (geohash as unknown as { decode_bbox: (s: string) => [number, number, number, number] }).decode_bbox(h)
    if (!bbox || bbox.length !== 4) return null
    const [minLat, minLon, maxLat, maxLon] = bbox
    if (!Number.isFinite(minLat) || !Number.isFinite(maxLat) || !Number.isFinite(minLon) || !Number.isFinite(maxLon))
      return null
    return { minLat, maxLat, minLon, maxLon }
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

/**
 * Params for centering a map on a geohash cell (center, bounds, zoom).
 * @returns Object or null if geohash invalid
 */
export function getGeohashMapParams(
  hash: string
): { center: GeoPoint; bounds: { minLat: number; maxLat: number; minLon: number; maxLon: number }; zoom: number } | null {
  const center = decodeGeohashCenter(hash)
  const bounds = getGeohashBounds(hash)
  const zoom = getGeohashZoomLevel(hash)
  if (!center || !bounds) return null
  return { center, bounds, zoom }
}
