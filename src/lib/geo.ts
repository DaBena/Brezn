import geohash from 'ngeohash'

export const GEOHASH_LEN_MIN_UI = 3
export const GEOHASH_LEN_MAX_UI = 5

// Keep local queries bounded. Steps=1 => 9 cells, Steps=16 => 1089 cells, Steps=64 => 16641 cells, Steps=128 => 66049 cells.
// We chunk the resulting cell list into multiple subscriptions (see useLocalFeed) to support very large radii.
export const LOCAL_GEO_MAX_STEPS = 128

// Maximum radius for local feed slider (in km)
export const LOCAL_RADIUS_MAX_KM = 2000

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
    3: { wKm: 156, hKm: 78 },
    4: { wKm: 39, hKm: 19 },
    5: { wKm: 4.9, hKm: 4.9 },
    6: { wKm: 1.2, hKm: 0.61 },
  }
  return table[len] ?? null
}

/**
 * Determines the optimal geohash length for a given radius to minimize the number of cells.
 * Uses shorter (less precise) geohashes for larger radii to keep query sizes manageable.
 */
export function optimalGeohashLengthForRadius(radiusKm: number): number {
  // For very large radii (>=500km), use len=3 (very coarse, ~156km cells)
  if (radiusKm >= 500) return 3
  // For large radii (200-499km), use len=4 (coarse, ~39km cells)
  if (radiusKm >= 200) return 4
  // For medium radii (50-199km), use len=5 (medium precision, ~4.9km cells)
  if (radiusKm >= 50) return 5
  // For small radii (<50km), use len=6 (high precision, ~1.2km cells)
  return 6
}

export function clampLocalRadiusKm(_len: number, radiusKm: number): number {
  const min = 5
  const max = LOCAL_RADIUS_MAX_KM
  const rounded = Math.round(radiusKm)
  return Math.max(min, Math.min(max, rounded))
}

export function geohashCellsWithinSteps(center: string, steps: number): string[] {
  const s = Math.max(0, Math.round(steps))
  const seen = new Set<string>()
  let frontier: string[] = [center]
  seen.add(center)

  for (let i = 0; i < s; i++) {
    const next: string[] = []
    for (const cell of frontier) {
      const neigh = geohash.neighbors(cell)
      for (const n of neigh) {
        if (!seen.has(n)) {
          seen.add(n)
          next.push(n)
        }
      }
    }
    frontier = next
    if (!frontier.length) break
  }

  return Array.from(seen)
}

export function geohashCellsWithinRadiusKm(opts: { center: string; len: number; radiusKm: number; maxCells?: number }): string[] {
  const { center, len } = opts
  const clampedLen = Math.max(GEOHASH_LEN_MIN_UI, Math.min(GEOHASH_LEN_MAX_UI, Math.round(len)))
  const radiusKm = clampLocalRadiusKm(clampedLen, opts.radiusKm)
  const size = geohashApproxCellSizeKm(clampedLen)
  const stepKm = size ? Math.max(size.wKm, size.hKm) : 5
  const steps = Math.min(LOCAL_GEO_MAX_STEPS, Math.max(1, Math.ceil(radiusKm / stepKm)))
  const cells = geohashCellsWithinSteps(center, steps)
  
  // Limit cells to prevent relay overload. Most relays can't handle >2000 #g tags efficiently.
  const maxCells = opts.maxCells ?? 2000
  if (cells.length <= maxCells) return cells
  
  // Warn if cells are being limited
  if (typeof console !== 'undefined' && console.warn) {
    console.warn(`[geo] Limiting geohash cells from ${cells.length} to ${maxCells} to prevent relay overload`)
  }
  
  // Prioritize cells closest to center by sorting by distance
  const centerPoint = decodeGeohashCenter(center)
  if (!centerPoint) return cells.slice(0, maxCells)
  
  const cellsWithDistance = cells.map(cell => {
    const cellPoint = decodeGeohashCenter(cell)
    const distance = cellPoint ? haversineDistanceKm(centerPoint, cellPoint) : Infinity
    return { cell, distance }
  })
  
  cellsWithDistance.sort((a, b) => a.distance - b.distance)
  return cellsWithDistance.slice(0, maxCells).map(c => c.cell)
}

export function encodeGeohash(p: GeoPoint, len = 4): string {
  return geohash.encode(p.lat, p.lon, len)
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

