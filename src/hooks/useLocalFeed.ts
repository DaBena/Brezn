import { startTransition, useEffect, useMemo, useRef, useState } from 'react'
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
import {
  RESEND_DELETION_COOLDOWN_MS,
  FEED_INITIAL_MIN_POSTS,
  FEED_AUTO_BACKFILL_MAX_ATTEMPTS,
  FEED_QUERY_LIMIT,
  FEED_CACHE_MAX_EVENTS,
} from '../lib/constants'

export type FeedState =
  | { kind: 'need-location'; locationError?: string }
  | { kind: 'loading' }
  | { kind: 'live' }
  | { kind: 'error'; message: string }

type SavedLocation = { geohash5: string; savedAt: number }

const FEED_CACHE_KEY = 'brezn:feed-cache:v1'
const LAST_LOCATION_KEY = 'brezn:last-location:v1'

function isReplyNote(evt: Event): boolean {
  // NIP-10 replies are kind:1 with at least one `e` tag.
  // We keep the main feed "root posts only" and show replies in a thread view.
  return evt.kind === 1 && evt.tags.some(t => t[0] === 'e')
}

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

  // Re-sync online state after load (e.g. after "Allow location" reload). Some environments
  // report navigator.onLine as false briefly on first paint; correct it so we don't stay offline.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const t = window.setTimeout(() => {
      if (navigator.onLine) setIsOffline(false)
    }, 200)
    return () => window.clearTimeout(t)
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
    const top = sortedEvents.slice(0, FEED_CACHE_MAX_EVENTS)
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
  }

  function applyGeo5AsLocation(geo5: string): void {
    saveJsonSync(LAST_LOCATION_KEY, { geohash5: geo5, savedAt: Date.now() } satisfies SavedLocation)
    setViewerGeo5(geo5)
    if (geo5 !== viewerGeo5Ref.current) {
      setFeedState({ kind: 'loading' })
      setInitialTimedOut(false)
      setLastCloseReasons(null)
      setLocalQueryFromGeo5(geo5, geohashLength)
    }
  }

  async function requestLocationAndLoad(opts?: { forceBrowser?: boolean; onFinished?: () => void }) {
    try {
      if (!opts?.forceBrowser) {
        const savedGeo5 = readSavedGeo5()
        if (savedGeo5) {
          applyGeo5AsLocation(savedGeo5)
          opts?.onFinished?.()
          return
        }
      }

      setFeedState({ kind: 'need-location' }) // clear previous error while retrying
      const pos = await getBrowserLocation()
      const geo5 = encodeGeohash(pos, GEOHASH_LEN_MAX_UI) // Always 5 digits
      applyGeo5AsLocation(geo5)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Location error'
      setFeedState({ kind: 'need-location', locationError: msg })
    } finally {
      opts?.onFinished?.()
    }
  }

  function setLocationFromGeohash(geo5: string): void {
    applyGeo5AsLocation(geo5)
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
  const relaysKey = currentRelays.join(',')
  useEffect(() => {
    if (isOffline) return
    if (!queryGeohash) return
    if (currentRelays.length === 0) {
      setFeedState({ kind: 'error', message: 'No relays configured. Please add at least one relay in Settings.' })
      return
    }
    unsubRef.current?.()

    // Clear events when starting a new query to avoid duplicates
    setEvents([])

    let didEose = false

    const onEvent = (evt: Event) => {
      if (evt.kind !== 1) return
      if (isReplyNote(evt)) return

      // Defer state update so relay setTimeout doesn't trigger "handler took 50ms" violation
      startTransition(() => {
        setEvents(prev => {
          if (prev.some(e => e.id === evt.id)) return prev
          return [evt, ...prev]
        })
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
      didEose = true
      setFeedState({ kind: 'live' })
    }
    const onClose = (reasons: string[]) => {
      setLastCloseReasons(reasons)
      if (!didEose) setInitialTimedOut(true)
    }

    // Special case: length 0 means query current cell plus east/west neighbor cells (3 queries) for wider local coverage.
    // Otherwise, single query with the selected geohash length.
    // No 'since' filter - find all posts regardless of age (important for apps with few users)
    if (geohashLength === 0 && queryGeohash.length === 5) {
      const oneCharHash = queryGeohash.slice(0, 1)
      const neighbors = getEastWestNeighbors(oneCharHash)
      if (neighbors) {
        const cellsToQuery = [oneCharHash, neighbors.east, neighbors.west]
        const totalQueries = cellsToQuery.length
        let currentIndex = 0
        let eoseCount = 0
        const unsubs: (() => void)[] = []

        const checkAllComplete = () => {
          if (eoseCount >= totalQueries) {
            didEose = true
            setFeedState({ kind: 'live' })
          }
        }

        const runNextQuery = () => {
          if (currentIndex >= cellsToQuery.length) {
            checkAllComplete()
            return
          }

          const cell = cellsToQuery[currentIndex]
          currentIndex++
          const unsub = client.subscribe(
            { kinds: [1], '#g': [cell], limit: FEED_QUERY_LIMIT },
            {
              onevent: onEvent,
              oneose: () => {
                eoseCount++
                checkAllComplete()
                if (currentIndex < cellsToQuery.length) setTimeout(runNextQuery, 100)
              },
              onclose: onClose,
              immediate: true,
            },
          )
          unsubs.push(unsub)
          unsubRef.current = () => unsubs.forEach(u => u())
        }

        runNextQuery()
      } else {
        const fallbackHash = queryGeohash.slice(0, 1)
        const unsubMain = client.subscribe(
          { kinds: [1], '#g': [fallbackHash], limit: FEED_QUERY_LIMIT },
          { onevent: onEvent, oneose: onEose, onclose: onClose, immediate: true },
        )
        unsubRef.current = unsubMain
      }
    } else {
      const unsub = client.subscribe(
        { kinds: [1], '#g': [queryGeohash], limit: FEED_QUERY_LIMIT },
        { onevent: onEvent, oneose: onEose, onclose: onClose, immediate: true },
      )
      unsubRef.current = unsub
    }
    return () => {
      unsubRef.current?.()
    }
  }, [client, queryGeohash, isOffline, relaysKey, currentRelays.length, geohashLength, identityPubkey])

  function loadMore() {
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

    const onEventLoadMore = (evt: Event) => {
      if (evt.kind !== 1) return
      if (isReplyNote(evt)) return
      setEvents(prev => (prev.some(e => e.id === evt.id) ? prev : [evt, ...prev]))
    }

    const clear = () => setIsLoadingMore(false)
    const timeoutMs = 15_000
    const timeoutId = window.setTimeout(clear, timeoutMs)

    const unsub = client.subscribe(
      { kinds: [1], '#g': [queryGeohash], limit: FEED_QUERY_LIMIT, until },
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
    setTimeout(() => {
      unsub()
    }, timeoutMs)
  }

  // Auto-backfill: if there are too few posts, automatically load older ones,
  // so the feed is meaningfully filled without needing "Load more".
  useEffect(() => {
    if (isOffline) return
    if (!queryGeohash) return
    if (!sortedEvents.length) return
    if (sortedEvents.length >= FEED_INITIAL_MIN_POSTS) return
    if (isLoadingMore) return

    // Only try to backfill a few times per geo-query.
    const key = queryGeohash
    if (autoBackfillRef.current.key !== key) autoBackfillRef.current = { key, attempts: 0 }
    if (autoBackfillRef.current.attempts >= FEED_AUTO_BACKFILL_MAX_ATTEMPTS) return

    autoBackfillRef.current.attempts++
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
    setLocationFromGeohash,
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
