import { useEffect, useMemo, useState } from 'react'
import type { Event } from 'nostr-tools'
import * as nip19 from 'nostr-tools/nip19'

export function useSearch(
  sortedEvents: Event[],
  profilesByPubkey: Map<string, { pubkey: string; name?: string; picture?: string }>
) {
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('')

  // Debounce search query to avoid filtering on every keystroke
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  const filteredEvents = useMemo(() => {
    if (!debouncedSearchQuery.trim()) return sortedEvents
    const query = debouncedSearchQuery.toLowerCase().trim()
    return sortedEvents.filter(evt => {
      // Search in content
      const content = (evt.content ?? '').toLowerCase()
      if (content.includes(query)) return true

      // Search in pubkey (hex)
      if (evt.pubkey.toLowerCase().includes(query)) return true

      // Search in npub (bech32 encoded)
      try {
        const npub = nip19.npubEncode(evt.pubkey)
        if (npub.toLowerCase().includes(query)) return true
      } catch {
        // Ignore encoding errors
      }

      // Search in profile name
      const profile = profilesByPubkey.get(evt.pubkey)
      if (profile?.name) {
        const profileName = profile.name.toLowerCase()
        if (profileName.includes(query)) return true
      }

      return false
    })
  }, [sortedEvents, debouncedSearchQuery, profilesByPubkey])

  return {
    searchQuery,
    setSearchQuery,
    filteredEvents,
  }
}
