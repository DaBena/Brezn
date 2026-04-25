import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Event } from 'nostr-tools'
import type { BreznNostrClient } from '../lib/nostrClient'
import {
  decodeGeohashCenter,
  encodeGeohash,
  GEOHASH_LEN_MAX_UI,
  getBrowserLocation,
  getEastWestNeighbors,
} from '../lib/geo'
import { contentMatchesMutedTerms } from '../lib/moderation'
import { getSavedGeo5, setSavedGeo5 } from '../lib/lastLocation'
import { setStorageConsentGiven } from '../lib/storage'
import { deletePost } from '../lib/postService'
import {
  RESEND_DELETION_COOLDOWN_MS,
  FEED_INITIAL_MIN_POSTS,
  FEED_AUTO_BACKFILL_MAX_ATTEMPTS,
  FEED_QUERY_LIMIT,
} from '../lib/constants'
import { computeNextUntilCursor } from '../lib/loadMoreCursor'
import { NOSTR_KINDS, ROOT_FEED_EVENT_KINDS } from '../lib/breznNostr'
import {
  isNip52CalendarKind,
  isValidNip52CalendarEvent,
  nip52CalendarMatchesQueryCells,
  nip52SearchBlob,
  upsertFeedEvents,
} from '../lib/nip52'

export type LoadMorePageResult = {
  added: number
  /** More older roots may exist (or we can advance `until` after an empty duplicate page). */
  canLoadOlder: boolean
}

export type FeedState =
  | { kind: 'need-location'; locationError?: string }
  | { kind: 'loading' }
  | { kind: 'live' }
  | { kind: 'error'; message: string }

function isReplyNote(evt: Event): boolean {
  // NIP-10 reply: kind 1 + `e` tag; feed stays roots-only.
  return evt.kind === 1 && evt.tags.some((t) => t[0] === 'e')
}

/**
 * Mode 0 (precision "cell"): coarse 1-char + east/west plus the saved 5-char `#g`.
 * Many relays match `#g` literally; notes tagged only with the full cell never match `['u']` alone.
 */
function gCellsCoarsePlusFine(queryGeohash: string): string[] {
  const oneCharHash = queryGeohash.slice(0, 1)
  const neighbors = getEastWestNeighbors(oneCharHash)
  const coarse = neighbors ? [oneCharHash, neighbors.east, neighbors.west] : [oneCharHash]
  return coarse.includes(queryGeohash) ? coarse : [...coarse, queryGeohash]
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

  const [isOffline, setIsOffline] = useState(() =>
    typeof navigator !== 'undefined' ? !navigator.onLine : false,
  )

  const initialSavedGeo5 = getSavedGeo5()
  const initialGeohashLength = client.getGeohashLength()
  // Precision 0 → query full 5-char cell (wide REQ); else prefix length matches UI selector.
  const initialQueryGeohash =
    !isOffline && initialSavedGeo5 && initialGeohashLength !== 0
      ? initialSavedGeo5.slice(0, initialGeohashLength)
      : initialSavedGeo5

  const [geohashLength, setGeohashLength] = useState<number>(initialGeohashLength)
  const [feedState, setFeedState] = useState<FeedState>(() =>
    initialQueryGeohash ? { kind: 'loading' } : { kind: 'need-location' },
  )
  const [events, setEvents] = useState<Event[]>([])
  const [queryGeohash, setQueryGeohash] = useState<string | null>(() =>
    isOffline ? null : initialQueryGeohash,
  )
  const [initialTimedOut, setInitialTimedOut] = useState(false)
  const [lastCloseReasons, setLastCloseReasons] = useState<string[] | null>(null)
  const [isLoadingMore, setIsLoadingMore] = useState(false)

  const geoCell = queryGeohash
  const [viewerGeo5, setViewerGeo5] = useState<string | null>(() => getSavedGeo5())
  const viewerPoint = useMemo(() => {
    return viewerGeo5 ? decodeGeohashCenter(viewerGeo5) : null
  }, [viewerGeo5])

  const unsubRef = useRef<null | (() => void)>(null)
  const eventsRef = useRef(events)
  eventsRef.current = events
  /** Next `until` after duplicate/empty relay page. */
  const loadMoreCursorRef = useRef<number | null>(null)
  const loadMoreQueueRef = useRef<Promise<unknown>>(Promise.resolve())
  const autoBackfillRef = useRef<{ key: string; attempts: number }>({ key: '', attempts: 0 })
  const viewerGeo5Ref = useRef<string | null>(viewerGeo5)
  viewerGeo5Ref.current = viewerGeo5
  const identityPubkeyRef = useRef<string | null>(identityPubkey)
  identityPubkeyRef.current = identityPubkey

  const blockedSet = useMemo(() => new Set(blockedPubkeys), [blockedPubkeys])
  const sortedEvents = useMemo(() => {
    const filtered = events.filter((e) => {
      if (blockedSet.has(e.pubkey)) return false
      if (!mutedTerms.length) return true
      if (isNip52CalendarKind(e.kind)) {
        return !contentMatchesMutedTerms(nip52SearchBlob(e), mutedTerms)
      }
      return !contentMatchesMutedTerms(e.content ?? '', mutedTerms)
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

  // Fix flaky navigator.onLine on first paint (e.g. after geo reload).
  useEffect(() => {
    if (typeof window === 'undefined') return
    const t = window.setTimeout(() => {
      if (navigator.onLine) setIsOffline(false)
    }, 200)
    return () => window.clearTimeout(t)
  }, [])

  const relaysRef = useRef<string[]>([])
  useEffect(() => {
    const currentRelays = client.getRelays()
    const prevRelays = relaysRef.current
    const relaysChanged =
      JSON.stringify([...currentRelays].sort()) !== JSON.stringify([...prevRelays].sort())
    if (relaysChanged && prevRelays.length > 0) {
      setEvents([])
      loadMoreCursorRef.current = null
      setFeedState({ kind: 'loading' })
      setInitialTimedOut(false)
      setLastCloseReasons(null)
    }
    relaysRef.current = currentRelays
  }, [client])

  function setLocalQueryFromGeo5(geo5: string, len: number) {
    setEvents([])
    loadMoreCursorRef.current = null
    if (len === 0) {
      setQueryGeohash(geo5)
    } else {
      const clampedLen = Math.max(1, Math.min(5, Math.round(len))) as 1 | 2 | 3 | 4 | 5
      setQueryGeohash(geo5.slice(0, clampedLen))
    }
    setFeedState({ kind: 'loading' })
  }

  function applyGeo5AsLocation(geo5: string): void {
    setSavedGeo5(geo5)
    setViewerGeo5(geo5)
    if (geo5 === viewerGeo5Ref.current) return
    setFeedState({ kind: 'loading' })
    setInitialTimedOut(false)
    setLastCloseReasons(null)
    setLocalQueryFromGeo5(geo5, geohashLength)
  }

  async function requestLocationAndLoad(opts?: {
    forceBrowser?: boolean
    onFinished?: () => void
  }) {
    try {
      if (!opts?.forceBrowser) {
        const savedGeo5 = getSavedGeo5()
        if (savedGeo5) {
          applyGeo5AsLocation(savedGeo5)
          opts?.onFinished?.()
          return
        }
      }

      const savedBeforeRequest = getSavedGeo5()
      if (!savedBeforeRequest) {
        setFeedState({ kind: 'need-location' }) // clear previous error while retrying
      }
      const pos = await getBrowserLocation()
      const geo5 = encodeGeohash(pos, GEOHASH_LEN_MAX_UI) // Always 5 digits
      applyGeo5AsLocation(geo5)
      setStorageConsentGiven(true) // allow IndexedDB (brezn-storage) from now on
      client.persistStateNow() // persist nsec now that user has consented (Allow location)
    } catch (e) {
      // Browser location failed: fall back to last saved cell if any (stay off need-location).
      const savedGeo5 = getSavedGeo5()
      if (savedGeo5) {
        applyGeo5AsLocation(savedGeo5)
        return
      }
      const msg = e instanceof Error ? e.message : 'Location error'
      setFeedState({ kind: 'need-location', locationError: msg })
    } finally {
      opts?.onFinished?.()
    }
  }

  function setLocationFromGeohash(geo5: string): void {
    applyGeo5AsLocation(geo5)
  }

  const autoPromptedRef = useRef(false)
  useEffect(() => {
    if (autoPromptedRef.current) return
    if (isOffline) return
    if (feedState.kind !== 'need-location') return
    autoPromptedRef.current = true
    void requestLocationAndLoad({ forceBrowser: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per need-location
  }, [feedState.kind, isOffline])

  // New notes use hierarchical `#g` tags; legacy posts may need exact `queryGeohash` match.
  const currentRelays = client.getRelays()
  const relaysKey = [...currentRelays].sort().join(',')
  useEffect(() => {
    if (isOffline) return
    if (!queryGeohash) return
    if (currentRelays.length === 0) {
      setFeedState({
        kind: 'error',
        message: 'No relays configured. Please add at least one relay in Settings.',
      })
      return
    }
    unsubRef.current?.()

    setEvents([])
    loadMoreCursorRef.current = null
    setFeedState({ kind: 'loading' })
    setInitialTimedOut(false)
    setLastCloseReasons(null)

    let didEose = false
    let eventCount = 0
    let cancelled = false
    const timerIds: number[] = []

    const queryCellsForCalendar =
      geohashLength === 0 && queryGeohash.length === 5
        ? gCellsCoarsePlusFine(queryGeohash)
        : [queryGeohash]

    const feedKinds = [...ROOT_FEED_EVENT_KINDS]

    const onEvent = (evt: Event) => {
      if (cancelled) return

      if (evt.kind === NOSTR_KINDS.note) {
        if (isReplyNote(evt)) return

        eventCount++
        if (eventCount === 1) setFeedState({ kind: 'live' })
        setEvents((prev) => {
          if (prev.some((e) => e.id === evt.id)) return prev
          return [evt, ...prev]
        })

        if (
          identityPubkeyRef.current &&
          evt.pubkey === identityPubkeyRef.current &&
          deletedNoteIdsRef.current.has(evt.id)
        ) {
          const now = Date.now()
          const last = lastResendTimeByNoteIdRef.current[evt.id] ?? 0
          if (now - last >= RESEND_DELETION_COOLDOWN_MS) {
            lastResendTimeByNoteIdRef.current[evt.id] = now
            void deletePost(client, evt, identityPubkeyRef.current).catch(() => {})
          }
        }
        return
      }

      if (isNip52CalendarKind(evt.kind)) {
        if (!isValidNip52CalendarEvent(evt)) return
        if (!nip52CalendarMatchesQueryCells(evt, queryCellsForCalendar)) return
        eventCount++
        if (eventCount === 1) setFeedState({ kind: 'live' })
        setEvents((prev) => upsertFeedEvents(prev, evt))
      }
    }
    const onEose = () => {
      if (cancelled) return
      didEose = true
      setFeedState({ kind: 'live' })
    }
    const onClose = (reasons: string[]) => {
      if (cancelled) return
      setLastCloseReasons(reasons)
      if (!didEose) setInitialTimedOut(true)
    }

    // Mode 0: band + exact 5-char; else single `#g`. No `since` (sparse feeds).
    if (geohashLength === 0 && queryGeohash.length === 5) {
      const cellsToQuery = gCellsCoarsePlusFine(queryGeohash)
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
          {
            kinds: feedKinds,
            '#g': [cell],
            limit: FEED_QUERY_LIMIT,
          },
          {
            onevent: onEvent,
            oneose: () => {
              if (cancelled) return
              eoseCount++
              checkAllComplete()
              if (currentIndex < cellsToQuery.length) {
                const id = window.setTimeout(runNextQuery, 100)
                timerIds.push(id)
              }
            },
            onclose: onClose,
            immediate: true,
          },
        )
        unsubs.push(unsub)
        unsubRef.current = () => unsubs.forEach((u) => u())
      }

      runNextQuery()
    } else {
      const unsub = client.subscribe(
        {
          kinds: feedKinds,
          '#g': [queryGeohash],
          limit: FEED_QUERY_LIMIT,
        },
        { onevent: onEvent, oneose: onEose, onclose: onClose, immediate: true },
      )
      unsubRef.current = unsub
    }
    return () => {
      cancelled = true
      for (const id of timerIds) window.clearTimeout(id)
      unsubRef.current?.()
    }
  }, [client, queryGeohash, viewerGeo5, isOffline, relaysKey, geohashLength, currentRelays.length])

  const runLoadMorePage = useRef<() => Promise<LoadMorePageResult>>(() =>
    Promise.resolve({ added: 0, canLoadOlder: false }),
  )
  runLoadMorePage.current = () => {
    if (!queryGeohash) {
      return Promise.resolve({ added: 0, canLoadOlder: false })
    }
    const relays = client.getRelays()
    if (relays.length === 0) {
      setFeedState({
        kind: 'error',
        message: 'No relays configured. Please add at least one relay in Settings.',
      })
      return Promise.resolve({ added: 0, canLoadOlder: false })
    }

    const ev = eventsRef.current
    const oldest = ev.reduce((min, e) => Math.min(min, e.created_at), Number.POSITIVE_INFINITY)
    if (!Number.isFinite(oldest) || oldest <= 0) {
      return Promise.resolve({ added: 0, canLoadOlder: false })
    }

    const defaultUntil = oldest - 1
    const until = loadMoreCursorRef.current ?? defaultUntil

    const cellsForLoadMore =
      geohashLength === 0 && queryGeohash.length === 5
        ? gCellsCoarsePlusFine(queryGeohash)
        : [queryGeohash]

    const queryCellsCalendar = cellsForLoadMore
    const kindsLoadMore = [...ROOT_FEED_EVENT_KINDS]

    return new Promise<LoadMorePageResult>((resolve) => {
      let settled = false
      let timeoutId = 0

      let batchRelayCount = 0
      let batchMinCreated: number | null = null

      const unsubs: (() => void)[] = []

      const finish = (n: number) => {
        if (settled) return
        settled = true
        window.clearTimeout(timeoutId)
        for (const u of unsubs) {
          try {
            u()
          } catch {
            /* ignore */
          }
        }
        setIsLoadingMore(false)
        const listAfter = eventsRef.current
        const feedLo = listAfter.length ? Math.min(...listAfter.map((e) => e.created_at)) : oldest
        const feedHi = listAfter.length ? Math.max(...listAfter.map((e) => e.created_at)) : oldest
        loadMoreCursorRef.current =
          n > 0
            ? null
            : computeNextUntilCursor({
                mergedNewCount: n,
                requestUntil: until,
                batchRelayCount,
                batchMinCreated,
                feedOldestCreated: feedLo,
                feedNewestCreated: feedHi,
              })
        const canLoadOlder = n > 0 || loadMoreCursorRef.current !== null
        resolve({ added: n, canLoadOlder })
      }

      setIsLoadingMore(true)
      /** Sync count: state updaters can lag EOSE. */
      let newEventCount = 0
      const relayRootIdsThisBatch = new Set<string>()
      const timeoutMs = 15_000

      const onEventLoadMore = (evt: Event) => {
        if (evt.kind === NOSTR_KINDS.note) {
          if (isReplyNote(evt)) return
          if (relayRootIdsThisBatch.has(evt.id)) return
          if (eventsRef.current.some((e) => e.id === evt.id)) return
          relayRootIdsThisBatch.add(evt.id)
        } else if (isNip52CalendarKind(evt.kind)) {
          if (!isValidNip52CalendarEvent(evt)) return
          if (!nip52CalendarMatchesQueryCells(evt, queryCellsCalendar)) return
        } else {
          return
        }

        batchRelayCount++
        batchMinCreated =
          batchMinCreated === null ? evt.created_at : Math.min(batchMinCreated, evt.created_at)

        newEventCount++
        setEvents((prev) => {
          if (evt.kind === NOSTR_KINDS.note) {
            if (prev.some((e) => e.id === evt.id)) return prev
            return [evt, ...prev]
          }
          return upsertFeedEvents(prev, evt)
        })
      }

      let subsRemaining = cellsForLoadMore.length

      const onOneSubClosed = () => {
        subsRemaining--
        if (subsRemaining <= 0) {
          window.clearTimeout(timeoutId)
          finish(newEventCount)
        }
      }

      for (const cell of cellsForLoadMore) {
        let closed = false
        const markClosed = () => {
          if (closed) return
          closed = true
          onOneSubClosed()
        }
        const unsub = client.subscribe(
          {
            kinds: kindsLoadMore,
            '#g': [cell],
            limit: FEED_QUERY_LIMIT,
            until,
          },
          {
            onevent: onEventLoadMore,
            oneose: markClosed,
            onclose: markClosed,
            immediate: true,
          },
        )
        unsubs.push(unsub)
      }

      timeoutId = window.setTimeout(() => {
        for (const u of unsubs) u()
      }, timeoutMs)
    })
  }

  const loadMorePage = useCallback((): Promise<LoadMorePageResult> => {
    const next = loadMoreQueueRef.current.then(() => runLoadMorePage.current())
    loadMoreQueueRef.current = next.then(
      () => undefined,
      () => undefined,
    )
    return next
  }, [])

  function loadMore() {
    void loadMorePage()
  }

  // If the feed is very short, pull older pages automatically (bounded attempts).
  useEffect(() => {
    if (isOffline) return
    if (!queryGeohash) return
    if (!sortedEvents.length) return
    if (sortedEvents.length >= FEED_INITIAL_MIN_POSTS) return
    if (isLoadingMore) return

    const key = queryGeohash
    if (autoBackfillRef.current.key !== key) autoBackfillRef.current = { key, attempts: 0 }
    if (autoBackfillRef.current.attempts >= FEED_AUTO_BACKFILL_MAX_ATTEMPTS) return

    autoBackfillRef.current.attempts++
    loadMore()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stale loadMore OK
  }, [queryGeohash, isLoadingMore, isOffline, sortedEvents.length])

  function applyGeohashLength(nextLength: number) {
    client.setGeohashLength(nextLength)
    setGeohashLength(nextLength)

    const savedGeo5 = getSavedGeo5()
    if (savedGeo5) {
      setLocalQueryFromGeo5(savedGeo5, nextLength)
    }
  }

  return {
    feedState,
    requestLocationAndLoad,
    setLocationFromGeohash,
    geoCell,
    viewerGeo5,
    isOffline,
    sortedEvents,
    viewerPoint,
    geohashLength,
    initialTimedOut,
    lastCloseReasons,
    isLoadingMore,
    loadMore,
    loadMorePage,
    applyGeohashLength,
  }
}
