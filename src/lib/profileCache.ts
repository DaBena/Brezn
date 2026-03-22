import { loadJsonSync, saveJsonSync } from './storage'

const PROFILE_CACHE_KEY = 'brezn:profiles:v1'

type StoredRow = { name?: string; picture?: string; about?: string }

/** One JSON blob in localStorage — survives F5. */
export function loadStoredProfiles(): Map<
  string,
  { pubkey: string; name?: string; picture?: string; about?: string }
> {
  const raw = loadJsonSync<Record<string, StoredRow>>(PROFILE_CACHE_KEY, {})
  const out = new Map<string, { pubkey: string; name?: string; picture?: string; about?: string }>()
  for (const [pubkey, v] of Object.entries(raw)) {
    if (!pubkey) continue
    out.set(pubkey, { pubkey, name: v.name, picture: v.picture, about: v.about })
  }
  return out
}

export function saveStoredProfiles(
  map: Map<string, { pubkey: string; name?: string; picture?: string; about?: string }>,
): void {
  const obj: Record<string, StoredRow> = {}
  for (const [pubkey, p] of map) {
    if (!p.name && !p.picture && !p.about) continue
    obj[pubkey] = { name: p.name, picture: p.picture, about: p.about }
  }
  saveJsonSync(PROFILE_CACHE_KEY, obj)
}
