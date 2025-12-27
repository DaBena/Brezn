import { useEffect, useMemo, useRef, useState } from 'react'
import type { Event } from 'nostr-tools'
import type { BreznNostrClient } from '../lib/nostrClient'
import {
  decodeGeohashCenter,
  encodeGeohash,
  GEOHASH_LEN_MAX_UI,
  GEOHASH_LEN_MIN_UI,
  getBrowserLocation,
} from '../lib/geo'
import { contentMatchesMutedTerms } from '../lib/moderation'
import { loadJson, saveJson } from '../lib/storage'

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

function isReplyNote(evt: Event): boolean {
  // NIP-10 replies are kind:1 with at least one `e` tag.
  // We keep the main feed "root posts only" and show replies in a thread view.
  return evt.kind === 1 && evt.tags.some(t => t[0] === 'e')
}

export function useLocalFeed(params: {
  client: BreznNostrClient
  mutedTerms: string[]
  blockedPubkeys: string[]
}) {
  const { client, mutedTerms, blockedPubkeys } = params

  const cached = loadJson<{ updatedAt: number; geoCell?: string; events: Event[] } | null>(FEED_CACHE_KEY, null)

  const [isOffline, setIsOffline] = useState(() => (typeof navigator !== 'undefined' ? !navigator.onLine : false))

  function readSavedGeo5(): string | null {
    const v = loadJson<SavedLocation | null>(LAST_LOCATION_KEY, null)
    if (!v || typeof v.geohash5 !== 'string') return null
    const s = v.geohash5.trim()
    if (s.length < GEOHASH_LEN_MIN_UI) return null
    return s
  }

  const initialSavedGeo5 = readSavedGeo5()
  const initialGeohashLength = client.getGeohashLength()
  const initialQueryGeohash =
    !isOffline && initialSavedGeo5 ? initialSavedGeo5.slice(0, initialGeohashLength) : null

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

  // Persist a small "last seen" cache for offline read-only mode.
  useEffect(() => {
    if (!sortedEvents.length) return
    // Keep it small and recent.
    const top = sortedEvents.slice(0, 200)
    saveJson(FEED_CACHE_KEY, { updatedAt: Date.now(), geoCell: geoCell ?? undefined, events: top })
  }, [geoCell, sortedEvents])

  function setLocalQueryFromGeo5(geo5: string, len: number) {
    const clampedLen = Math.max(1, Math.min(5, Math.round(len))) as 1 | 2 | 3 | 4 | 5
    const queryHash = geo5.slice(0, clampedLen)
    setEvents([])
    setQueryGeohash(queryHash)
    setFeedState({ kind: 'loading' })
  }

  async function requestLocationAndLoad(opts?: { forceBrowser?: boolean }) {
    setFeedState({ kind: 'loading' })
    setInitialTimedOut(false)
    setLastCloseReasons(null)
    try {
      // Prefer a stored last location to avoid prompting on every app open.
      if (!opts?.forceBrowser) {
        const savedGeo5 = readSavedGeo5()
        if (savedGeo5) {
          setViewerGeo5(savedGeo5) // Update state with saved 5-digit geohash
          setLocalQueryFromGeo5(savedGeo5, geohashLength)
          return
        }
      }

      const pos = await getBrowserLocation()
      const geo5 = encodeGeohash(pos, GEOHASH_LEN_MAX_UI) // Always 5 digits
      saveJson(LAST_LOCATION_KEY, { geohash5: geo5, savedAt: Date.now() } satisfies SavedLocation)
      setViewerGeo5(geo5) // Update state with new 5-digit geohash
      setLocalQueryFromGeo5(geo5, geohashLength)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Location error'
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
  useEffect(() => {
    if (isOffline) return
    if (!queryGeohash) return
    unsubRef.current?.()

    let didEose = false
    const timeoutId = window.setTimeout(() => {
      if (!didEose) {
        setInitialTimedOut(true)
      }
    }, 12_500)

    // No time limit - with few users, we want to find all posts regardless of age
    // New posts have tuple tags and will be found regardless of age

    const onEvent = (evt: Event) => {
      if (evt.kind !== 1) return
      if (isReplyNote(evt)) return
      
      // basic de-dupe
      setEvents(prev => {
        if (prev.some(e => e.id === evt.id)) {
          return prev
        }
        return [evt, ...prev]
      })
    }
    const onEose = () => {
      didEose = true
      window.clearTimeout(timeoutId)
      setFeedState({ kind: 'live' })
    }
    const onClose = (reasons: string[]) => {
      setLastCloseReasons(reasons)
      if (!didEose) setInitialTimedOut(true)
    }

    // Single query with the selected geohash length
    // No 'since' filter - find all posts regardless of age (important for apps with few users)
    const unsub = client.subscribe(
      { kinds: [1], '#g': [queryGeohash], limit: 200 },
      { onevent: onEvent, oneose: onEose, onclose: onClose },
    )
    
    unsubRef.current = unsub
    return () => {
      window.clearTimeout(timeoutId)
      unsub()
    }
  }, [client, queryGeohash, isOffline])

  function loadMore() {
    if (isLoadingMore) return
    if (!queryGeohash) return

    const oldest = events.reduce((min, e) => Math.min(min, e.created_at), Number.POSITIVE_INFINITY)
    if (!Number.isFinite(oldest) || oldest <= 0) return

    setIsLoadingMore(true)

    const until = oldest - 1

    const onEvent = (evt: Event) => {
      if (evt.kind !== 1) return
      if (isReplyNote(evt)) return
      setEvents(prev => (prev.some(e => e.id === evt.id) ? prev : [evt, ...prev]))
    }

    const clear = () => {
      setIsLoadingMore(false)
    }

    const timeoutId = window.setTimeout(clear, 12_500)
    
    // Single query with the selected geohash length
    const unsub = client.subscribe(
      { kinds: [1], '#g': [queryGeohash], limit: 200, until },
      {
        onevent: onEvent,
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

  // Auto-backfill: wenn zu wenig Posts da sind, automatisch ältere nachladen,
  // damit der Feed ohne "Mehr laden" direkt sinnvoll gefüllt ist.
  useEffect(() => {
    if (isOffline) return
    if (!queryGeohash) return
    if (!sortedEvents.length) return
    if (sortedEvents.length >= INITIAL_MIN_POSTS) return
    if (isLoadingMore) return

    // Versuche pro Geo-Query nur ein paar Mal nachzuladen.
    const key = queryGeohash
    if (autoBackfillRef.current.key !== key) autoBackfillRef.current = { key, attempts: 0 }
    if (autoBackfillRef.current.attempts >= AUTO_BACKFILL_MAX_ATTEMPTS) return

    autoBackfillRef.current.attempts++
    loadMore()
    // Intentionally omit loadMore from deps; wir brauchen nur die aktuellen Render-Werte.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryGeohash, isLoadingMore, isOffline, sortedEvents.length])

  function applyGeohashLength(nextLength: number) {
    const clamped = Math.max(1, Math.min(5, Math.round(nextLength))) as 1 | 2 | 3 | 4 | 5
    client.setGeohashLength(clamped)
    setGeohashLength(clamped)

    // If we already have a stored last location, rebuild the query without prompting.
    const savedGeo5 = readSavedGeo5()
    if (savedGeo5) {
      setLocalQueryFromGeo5(savedGeo5, clamped)
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
