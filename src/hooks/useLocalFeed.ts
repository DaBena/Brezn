import { useEffect, useMemo, useRef, useState } from 'react'
import type { Event } from 'nostr-tools'
import type { BreznNostrClient } from '../lib/nostrClient'
import {
  decodeGeohashCenter,
  encodeGeohash,
  GEOHASH_LEN_MAX_UI,
  GEOHASH_LEN_MIN_UI,
  getBrowserLocation,
  getEastWestNeighbors,
} from '../lib/geo'
import { contentMatchesMutedTerms } from '../lib/moderation'
import { loadJsonSync, saveJsonSync } from '../lib/storage'
import { deletePost } from '../lib/postService'

export type FeedState =
  | { kind: 'need-location' }
  | { kind: 'loading' }
  | { kind: 'live' }
  | { kind: 'error'; message: string }

type SavedLocation = { geohash5: string; savedAt: number }

const FEED_CACHE_KEY = 'brezn:feed-cache:v1'
const LAST_LOCATION_KEY = 'brezn:last-location:v1'
const INITIAL_MIN_POSTS = 7
const AUTO_BACKFILL_MAX_ATTEMPTS = 3

/** Kind 20000: ephemeral geohash-channel messages (e.g. nym.bar); same #g filter as kind 1. */
const GEOHASH_CHANNEL_KIND = 20000

function isFeedDebug(): boolean {
  try {
    if (typeof window === 'undefined') return false
    // URL param: ?brezn_feed_debug=1 (no console needed)
    const params = new URLSearchParams(location.search)
    if (params.get('brezn_feed_debug') === '1') return true
    return localStorage.getItem('brezn:feed-debug') === '1'
  } catch {
    return false
  }
}

function isReplyNote(evt: Event): boolean {
  // NIP-10 replies are kind:1 with at least one `e` tag.
  // We keep the main feed "root posts only" and show replies in a thread view.
  return evt.kind === 1 && evt.tags.some(t => t[0] === 'e')
}

const RESEND_DELETION_COOLDOWN_MS = 10_000

export function useLocalFeed(params: {
  client: BreznNostrClient
  mutedTerms: string[]
  blockedPubkeys: string[]
  deletedNoteIds: Set<string>
  identityPubkey: string | null
}) {
  const { client, mutedTerms, blockedPubkeys, deletedNoteIds, identityPubkey } = params

  const deletedNoteIdsRef = useRef(deletedNoteIds)
  deletedNoteIdsRef.current = deletedNoteIds
  const lastResendTimeByNoteIdRef = useRef<Record<string, number>>({})

  const cached = loadJsonSync<{ updatedAt: number; geoCell?: string; events: Event[] } | null>(FEED_CACHE_KEY, null)

  const [isOffline, setIsOffline] = useState(() => (typeof navigator !== 'undefined' ? !navigator.onLine : false))

  function readSavedGeo5(): string | null {
    const v = loadJsonSync<SavedLocation | null>(LAST_LOCATION_KEY, null)
    if (!v || typeof v.geohash5 !== 'string') return null
    const s = v.geohash5.trim()
    if (s.length < GEOHASH_LEN_MIN_UI) return null
    return s
  }

  const initialSavedGeo5 = readSavedGeo5()
  const initialGeohashLength = client.getGeohashLength()
  const initialQueryGeohash =
    !isOffline && initialSavedGeo5 && initialGeohashLength !== 0
      ? initialSavedGeo5.slice(0, initialGeohashLength)
      : initialSavedGeo5 // Use full 5-digit geohash when length is 0

  const [geohashLength, setGeohashLength] = useState<number>(initialGeohashLength)
  const [feedState, setFeedState] = useState<FeedState>(() => {
    if (cached?.events?.length && isOffline) return { kind: 'live' }
    return initialQueryGeohash ? { kind: 'loading' } : { kind: 'need-location' }
  })
  const [events, setEvents] = useState<Event[]>(() => (cached?.events?.length ? cached.events : []))
  const [queryGeohash, setQueryGeohash] = useState<string | null>(() => (isOffline ? null : initialQueryGeohash))
  const [initialTimedOut, setInitialTimedOut] = useState(false)
  const [lastCloseReasons, setLastCloseReasons] = useState<string[] | null>(null)
  const [isLoadingMore, setIsLoadingMore] = useState(false)

  // geoCell is the same as queryGeohash (for UI display, can be 1-5 characters)
  const geoCell = queryGeohash
  // viewerGeo5 is the full 5-digit geohash (for posting, always 5 characters)
  // Read from localStorage - will be updated when location changes
  const [viewerGeo5, setViewerGeo5] = useState<string | null>(() => readSavedGeo5())
  // viewerPoint is derived from saved 5-digit geohash
  const viewerPoint = useMemo(() => {
    return viewerGeo5 ? decodeGeohashCenter(viewerGeo5) : null
  }, [viewerGeo5])

  const unsubRef = useRef<null | (() => void)>(null)
  const autoBackfillRef = useRef<{ key: string; attempts: number }>({ key: '', attempts: 0 })
  const viewerGeo5Ref = useRef<string | null>(viewerGeo5)
  viewerGeo5Ref.current = viewerGeo5

  const blockedSet = useMemo(() => new Set(blockedPubkeys), [blockedPubkeys])
  const sortedEvents = useMemo(() => {
    const filtered = events.filter(e => {
      if (blockedSet.has(e.pubkey)) return false
      if (mutedTerms.length && contentMatchesMutedTerms(e.content ?? '', mutedTerms)) return false
      return true
    })
    return filtered.sort((a, b) => b.created_at - a.created_at)
  }, [events, mutedTerms, blockedSet])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const onOnline = () => setIsOffline(false)
    const onOffline = () => setIsOffline(true)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  // Clear events when relays change
  const relaysRef = useRef<string[]>([])
  useEffect(() => {
    const currentRelays = client.getRelays()
    const prevRelays = relaysRef.current
    // Check if relays have changed (by comparing sorted arrays)
    const relaysChanged = JSON.stringify([...currentRelays].sort()) !== JSON.stringify([...prevRelays].sort())
    if (relaysChanged && prevRelays.length > 0) {
      // Relays changed - clear events to avoid showing posts from removed relays
      setEvents([])
    }
    relaysRef.current = currentRelays
  }, [client])

  // Persist a small "last seen" cache for offline read-only mode.
  useEffect(() => {
    if (!sortedEvents.length) return
    // Keep it small and recent.
    const top = sortedEvents.slice(0, 200)
    saveJsonSync(FEED_CACHE_KEY, { updatedAt: Date.now(), geoCell: geoCell ?? undefined, events: top })
  }, [geoCell, sortedEvents])

  function setLocalQueryFromGeo5(geo5: string, len: number) {
    setEvents([])
    if (len === 0) {
      // Use full 5-digit geohash when len is 0 (will query current + east/west)
      setQueryGeohash(geo5)
    } else {
      const clampedLen = Math.max(1, Math.min(5, Math.round(len))) as 1 | 2 | 3 | 4 | 5
      setQueryGeohash(geo5.slice(0, clampedLen))
    }
    setFeedState({ kind: 'loading' })
    if (isFeedDebug()) console.log('[Brezn feed] setLocalQueryFromGeo5', { geo5, len })
  }

  async function requestLocationAndLoad(opts?: { forceBrowser?: boolean }) {
    try {
      // Prefer a stored last location to avoid prompting on every app open.
      if (!opts?.forceBrowser) {
        const savedGeo5 = readSavedGeo5()
        if (savedGeo5) {
          if (isFeedDebug()) console.log('[Brezn feed] location from storage', { savedGeo5 })
          setViewerGeo5(savedGeo5) // Update state with saved 5-digit geohash
          setLocalQueryFromGeo5(savedGeo5, geohashLength)
          return
        }
      }

      if (isFeedDebug()) console.log('[Brezn feed] requesting browser location…')
      const pos = await getBrowserLocation()
      const geo5 = encodeGeohash(pos, GEOHASH_LEN_MAX_UI) // Always 5 digits
      if (isFeedDebug()) console.log('[Brezn feed] browser location', { geo5, lat: pos.lat, lon: pos.lon })
      saveJsonSync(LAST_LOCATION_KEY, { geohash5: geo5, savedAt: Date.now() } satisfies SavedLocation)
      setViewerGeo5(geo5)

      // Only reload feed when the 5-digit geohash actually changed
      if (geo5 !== viewerGeo5Ref.current) {
        setFeedState({ kind: 'loading' })
        setInitialTimedOut(false)
        setLastCloseReasons(null)
        setLocalQueryFromGeo5(geo5, geohashLength)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Location error'
      if (isFeedDebug()) console.log('[Brezn feed] location error', msg)
      setFeedState({ kind: 'error', message: msg })
    }
  }

  // Auto-prompt for location on first open (no stored location).
  const autoPromptedRef = useRef(false)
  useEffect(() => {
    if (autoPromptedRef.current) return
    if (isOffline) return
    if (feedState.kind !== 'need-location') return
    autoPromptedRef.current = true
    void requestLocationAndLoad({ forceBrowser: true })
    // Intentionally depend on coarse state; prompt should run at most once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedState.kind, isOffline])

  // Simple query: use the selected geohash length
  // New posts have tuple tags (1-5), so they'll be found regardless of query length
  // Old posts without tuple tags will only be found if query matches exactly
  const currentRelays = client.getRelays()
  useEffect(() => {
    if (isOffline) {
      if (isFeedDebug()) console.log('[Brezn feed] subscribe skipped: offline')
      return
    }
    if (!queryGeohash) {
      if (isFeedDebug()) console.log('[Brezn feed] subscribe skipped: no queryGeohash')
      return
    }
    if (currentRelays.length === 0) {
      if (isFeedDebug()) console.log('[Brezn feed] subscribe skipped: no relays')
      setFeedState({ kind: 'error', message: 'No relays configured. Please add at least one relay in Settings.' })
      return
    }
    unsubRef.current?.()

    // Clear events when starting a new query to avoid duplicates
    setEvents([])

    let didEose = false
    const eventCounts = { kind1: 0, kind20000: 0 }
    const timeoutId = window.setTimeout(() => {
      if (!didEose) {
        if (isFeedDebug()) console.log('[Brezn feed] initial timeout (12.5s) before EOSE', eventCounts)
        setInitialTimedOut(true)
      }
    }, 12_500)

    // No time limit - with few users, we want to find all posts regardless of age
    // New posts have tuple tags and will be found regardless of age

    if (isFeedDebug()) {
      console.log('[Brezn feed] subscribe', {
        queryGeohash,
        geohashLength,
        relayUrls: currentRelays,
        origin: typeof location !== 'undefined' ? location.origin : '',
      })
    }

    const onEvent = (evt: Event) => {
      if (evt.kind !== 1 && evt.kind !== GEOHASH_CHANNEL_KIND) return
      if (evt.kind === 1 && isReplyNote(evt)) return

      if (evt.kind === 1) eventCounts.kind1++
      else if (evt.kind === GEOHASH_CHANNEL_KIND) eventCounts.kind20000++

      if (isFeedDebug() && (evt.kind === 1 || evt.kind === GEOHASH_CHANNEL_KIND)) {
        console.log('[Brezn feed] event', { kind: evt.kind, id: evt.id.slice(0, 8) })
      }

      // basic de-dupe
      setEvents(prev => {
        if (prev.some(e => e.id === evt.id)) {
          return prev
        }
        return [evt, ...prev]
      })

      // If this is a post we deleted and it’s our own: resend NIP-09 with rate limit (10s)
      if (
        evt.kind === 1 &&
        identityPubkey &&
        evt.pubkey === identityPubkey &&
        deletedNoteIdsRef.current.has(evt.id)
      ) {
        const now = Date.now()
        const last = lastResendTimeByNoteIdRef.current[evt.id] ?? 0
        if (now - last >= RESEND_DELETION_COOLDOWN_MS) {
          lastResendTimeByNoteIdRef.current[evt.id] = now
          void deletePost(client, evt, identityPubkey).catch(() => {})
        }
      }
    }
    const onEose = () => {
      if (isFeedDebug()) console.log('[Brezn feed] EOSE', { kind1: eventCounts.kind1, kind20000: eventCounts.kind20000, total: eventCounts.kind1 + eventCounts.kind20000 })
      didEose = true
      window.clearTimeout(timeoutId)
      setFeedState({ kind: 'live' })
    }
    const onClose = (reasons: string[]) => {
      if (isFeedDebug()) console.log('[Brezn feed] onclose', reasons)
      setLastCloseReasons(reasons)
      if (!didEose) setInitialTimedOut(true)
    }

    // If geohashLength is 0, query current cell + east/west neighbors (3 queries sequentially)
    // Otherwise, single query with the selected geohash length
    // No 'since' filter - find all posts regardless of age (important for apps with few users)
    
    if (geohashLength === 0 && queryGeohash.length === 5) {
      // Use 1-character geohash and query its east/west neighbors
      const oneCharHash = queryGeohash.slice(0, 1)
      const neighbors = getEastWestNeighbors(oneCharHash)
      if (neighbors) {
        const cellsToQuery = [oneCharHash, neighbors.east, neighbors.west]
        if (isFeedDebug()) console.log('[Brezn feed] subscribe mode: 3 cells (east/west)', cellsToQuery)
        let currentIndex = 0
        const totalQueries = cellsToQuery.length
        let eoseCount = 0
        const unsubs: (() => void)[] = []
        
        const checkAllComplete = () => {
          if (eoseCount >= totalQueries) {
            if (isFeedDebug()) console.log('[Brezn feed] all 3 cells EOSE')
            // All queries completed
            didEose = true
            window.clearTimeout(timeoutId)
            setFeedState({ kind: 'live' })
          }
        }
        
        const runNextQuery = () => {
          if (currentIndex >= totalQueries) {
            checkAllComplete()
            return
          }
          
          const cell = cellsToQuery[currentIndex]
          if (isFeedDebug()) console.log('[Brezn feed] query cell', { cell, index: currentIndex + 1, of: totalQueries })
          currentIndex++
          
          const unsub = client.subscribe(
            { kinds: [1, GEOHASH_CHANNEL_KIND], '#g': [cell], limit: 200 },
            {
              onevent: onEvent,
              oneose: () => {
                eoseCount++
                if (isFeedDebug()) console.log('[Brezn feed] cell EOSE', { cell, eoseCount, totalQueries })
                checkAllComplete()
                // Wait a bit before starting next query to avoid overwhelming relays
                if (currentIndex < totalQueries) {
                  setTimeout(runNextQuery, 100)
                }
              },
              onclose: onClose,
            },
          )
          
          unsubs.push(unsub)
          
          // Store a function that unsubscribes from all queries
          unsubRef.current = () => {
            unsubs.forEach(u => u())
          }
        }
        
        runNextQuery()
      } else {
        // Fallback: if neighbors can't be calculated, query with 1-character prefix
        const fallbackHash = queryGeohash.slice(0, 1)
        if (isFeedDebug()) console.log('[Brezn feed] subscribe mode: single (fallback 1-char)', fallbackHash)
        const unsub = client.subscribe(
          { kinds: [1, GEOHASH_CHANNEL_KIND], '#g': [fallbackHash], limit: 200 },
          { onevent: onEvent, oneose: onEose, onclose: onClose },
        )
        unsubRef.current = unsub
      }
    } else {
      if (isFeedDebug()) console.log('[Brezn feed] subscribe mode: single', queryGeohash)
      // Single query with the selected geohash length
      const unsub = client.subscribe(
        { kinds: [1, GEOHASH_CHANNEL_KIND], '#g': [queryGeohash], limit: 200 },
        { onevent: onEvent, oneose: onEose, onclose: onClose },
      )
      unsubRef.current = unsub
    }
    return () => {
      window.clearTimeout(timeoutId)
      unsubRef.current?.()
    }
  }, [client, queryGeohash, isOffline, currentRelays.join(','), geohashLength, identityPubkey])

  function loadMore() {
    if (isFeedDebug()) console.log('[Brezn feed] loadMore', { isLoadingMore, queryGeohash, eventsCount: events.length })
    if (isLoadingMore) return
    if (!queryGeohash) return
    const relays = client.getRelays()
    if (relays.length === 0) {
      setFeedState({ kind: 'error', message: 'No relays configured. Please add at least one relay in Settings.' })
      return
    }

    const oldest = events.reduce((min, e) => Math.min(min, e.created_at), Number.POSITIVE_INFINITY)
    if (!Number.isFinite(oldest) || oldest <= 0) return

    setIsLoadingMore(true)

    const until = oldest - 1
    if (isFeedDebug()) console.log('[Brezn feed] loadMore subscription', { queryGeohash, until, eventsCount: events.length })

    const onEventLoadMore = (evt: Event) => {
      if (evt.kind !== 1 && evt.kind !== GEOHASH_CHANNEL_KIND) return
      if (evt.kind === 1 && isReplyNote(evt)) return
      setEvents(prev => (prev.some(e => e.id === evt.id) ? prev : [evt, ...prev]))
    }

    const clear = () => setIsLoadingMore(false)
    const timeoutId = window.setTimeout(clear, 12_500)

    const unsub = client.subscribe(
      { kinds: [1, GEOHASH_CHANNEL_KIND], '#g': [queryGeohash], limit: 200, until },
      {
        onevent: onEventLoadMore,
        oneose: () => {
          window.clearTimeout(timeoutId)
          clear()
          // Close subscription after EOSE to avoid keeping it open
          setTimeout(() => unsub(), 100)
        },
        onclose: () => {
          window.clearTimeout(timeoutId)
          clear()
        },
      },
    )
    
    // Also close on timeout
    setTimeout(() => {
      unsub()
    }, 12_500)
  }

  // Auto-backfill: if there are too few posts, automatically load older ones,
  // so the feed is meaningfully filled without needing "Load more".
  useEffect(() => {
    if (isOffline) return
    if (!queryGeohash) return
    if (!sortedEvents.length) return
    if (sortedEvents.length >= INITIAL_MIN_POSTS) return
    if (isLoadingMore) return

    // Only try to backfill a few times per geo-query.
    const key = queryGeohash
    if (autoBackfillRef.current.key !== key) autoBackfillRef.current = { key, attempts: 0 }
    if (autoBackfillRef.current.attempts >= AUTO_BACKFILL_MAX_ATTEMPTS) return

    autoBackfillRef.current.attempts++
    if (isFeedDebug()) console.log('[Brezn feed] auto-backfill', { queryGeohash, sortedCount: sortedEvents.length, attempt: autoBackfillRef.current.attempts })
    loadMore()
    // Intentionally omit loadMore from deps; we only need the current render values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryGeohash, isLoadingMore, isOffline, sortedEvents.length])

  function applyGeohashLength(nextLength: number) {
    client.setGeohashLength(nextLength)
    setGeohashLength(nextLength)

    // If we already have a stored last location, rebuild the query without prompting.
    const savedGeo5 = readSavedGeo5()
    if (savedGeo5) {
      setLocalQueryFromGeo5(savedGeo5, nextLength)
    }
  }

  return {
    feedState,
    requestLocationAndLoad,
    geoCell,
    viewerGeo5, // Full 5-digit geohash for posting
    isOffline,
    sortedEvents,
    viewerPoint,
    geohashLength,
    initialTimedOut,
    lastCloseReasons,
    isLoadingMore,
    loadMore,
    applyGeohashLength,
  }
}
