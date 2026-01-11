import type { Event } from 'nostr-tools'

export function shortHex(hex: string, head = 8, tail = 4): string {
  const v = (hex ?? '').toString()
  if (!v) return ''
  const h = Math.max(0, Math.round(head))
  const t = Math.max(0, Math.round(tail))
  if (v.length <= h + t) return v
  if (h === 0 && t === 0) return '…'
  if (h === 0) return `…${v.slice(-t)}`
  if (t === 0) return `${v.slice(0, h)}…`
  return `${v.slice(0, h)}…${v.slice(-t)}`
}

// Shorten npub by removing "npub" prefix (first 4 chars) and then shortening the rest
export function shortNpub(npub: string, head = 8, tail = 4): string {
  const v = (npub ?? '').toString()
  if (!v) return ''
  // Remove "npub" prefix if present
  const withoutPrefix = v.startsWith('npub') ? v.slice(4) : v
  if (!withoutPrefix) return v
  // Shorten the part after "npub"
  return shortHex(withoutPrefix, head, tail)
}

export function getTagValue(evt: Event, key: string): string | undefined {
  const found = evt.tags.find(t => t[0] === key && typeof t[1] === 'string')
  return found?.[1]
}

/**
 * Gets the longest (most precise) geohash tag from an event.
 * This is important because posts contain multiple geohash tags (1-5 characters),
 * and we want to use the most precise one for distance calculations.
 */
export function getLongestGeohashTag(evt: Event): string | undefined {
  const geoTags = evt.tags
    .filter(t => t[0] === 'g' && typeof t[1] === 'string')
    .map(t => t[1] as string)
  
  if (geoTags.length === 0) return undefined
  
  // Return the longest geohash tag (most precise)
  return geoTags.reduce((longest, current) => 
    current.length > longest.length ? current : longest
  )
}

