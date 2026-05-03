import { useEffect, useMemo, useState } from 'react'
import { nip19, type Event } from '../lib/nostrPrimitives'
import { SEARCH_FEED_PREFETCH_MAX_ROUNDS } from '../lib/constants'
import { isNip52CalendarKind, nip52SearchBlob } from '../lib/nip52'
import type { LoadMorePageResult } from './useLocalFeed'

function eventMatchesSearchQuery(
  evt: Event,
  queryLower: string,
  profilesByPubkey: Map<string, { pubkey: string; name?: string; picture?: string }>,
): boolean {
  const content = (evt.content ?? '').toLowerCase()
  if (content.includes(queryLower)) return true
  if (evt.pubkey.toLowerCase().includes(queryLower)) return true
  try {
    const npub = nip19.npubEncode(evt.pubkey)
    if (npub.toLowerCase().includes(queryLower)) return true
  } catch {
    /* ignore */
  }
  const profile = profilesByPubkey.get(evt.pubkey)
  if (profile?.name && profile.name.toLowerCase().includes(queryLower)) return true
  if (isNip52CalendarKind(evt.kind) && nip52SearchBlob(evt).includes(queryLower)) return true
  return false
}

/** Debounced search filters RAM; prefetch walks `loadMorePage` so older matches can appear. */
export type SearchFeedPrefetch = {
  isOffline: boolean
  canPrefetchFeed: boolean
  loadMorePage: () => Promise<LoadMorePageResult>
}

export function useSearch(
  sortedEvents: Event[],
  profilesByPubkey: Map<string, { pubkey: string; name?: string; picture?: string }>,
  feedPrefetch?: SearchFeedPrefetch | null,
) {
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  useEffect(() => {
    const q = debouncedSearchQuery.trim()
    if (!q || !feedPrefetch || feedPrefetch.isOffline || !feedPrefetch.canPrefetchFeed) return

    let cancelled = false
    ;(async () => {
      let emptyStreak = 0
      for (let round = 0; round < SEARCH_FEED_PREFETCH_MAX_ROUNDS; round++) {
        if (cancelled) return
        const { added, canLoadOlder } = await feedPrefetch.loadMorePage()
        if (cancelled) return
        if (added > 0 || canLoadOlder) {
          emptyStreak = 0
        } else {
          emptyStreak++
          if (emptyStreak >= 2) break
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [debouncedSearchQuery, feedPrefetch])

  const filteredEvents = useMemo(() => {
    if (!debouncedSearchQuery.trim()) return sortedEvents
    const query = debouncedSearchQuery.toLowerCase().trim()
    return sortedEvents.filter((evt) => eventMatchesSearchQuery(evt, query, profilesByPubkey))
  }, [sortedEvents, debouncedSearchQuery, profilesByPubkey])

  return {
    searchQuery,
    setSearchQuery,
    filteredEvents,
  }
}
