import { LAST_LOCATION_KEY } from './constants'
import { GEOHASH_LEN_MIN_UI } from './geo'
import { loadJsonSync, saveJsonSync } from './storage'

/**
 * Returns the saved 5-digit geohash if valid, otherwise null.
 */
export function getSavedGeo5(): string | null {
  const v = loadJsonSync<string | null>(LAST_LOCATION_KEY, null)
  if (typeof v !== 'string') return null
  const s = v.trim()
  return s.length >= GEOHASH_LEN_MIN_UI ? s : null
}

/**
 * Persists the 5-digit geohash as the last location.
 */
export function setSavedGeo5(geo5: string): void {
  saveJsonSync(LAST_LOCATION_KEY, geo5)
}

/**
 * True if the user has ever saved a location (consent: saw notice and clicked Allow location).
 */
export function hasLocationConsent(): boolean {
  return getSavedGeo5() !== null
}
