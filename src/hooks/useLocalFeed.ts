import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Event } from '../lib/nostrPrimitives'
import type { BreznNostrClient } from '../lib/nostrClient'
import {
  decodeGeohashCenter,
  encodeGeohash,
  GEOHASH_LEN_MAX_UI,
  getBrowserLocation,
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
  FEED_SUBSCRIPTION_BATCH_MAX_MS,
} from '../lib/constants'
import { mergeFeedIncoming } from '../lib/feedBatchMerge'
import { filterFeedEventsByQuery, getQueryCellsForFeed } from '../lib/feedGeoMatch'
import { computeNextUntilCursor } from '../lib/loadMoreCursor'
import { NOSTR_KINDS, ROOT_FEED_EVENT_KINDS } from '../lib/breznNostr'
import {
  isNip52CalendarKind,
  isValidNip52CalendarEvent,
  nip52CalendarMatchesQueryCells,
  nip52SearchBlob,
  upsertFeedEvents,
} from '../lib/nip52'
import { isReplyNote } from '../lib/nostrUtils'
import { i18n } from '../i18n/i18n'

export type LoadMorePageResult = {
  added: number
  /** More older roots may exist (or we can advance `until` after an empty duplicate page). */
  canLoadOlder: boolean
}

export type FeedState =
  | { kind: 'need-location'; locationError?: string }
  | { kind: 'loading' }
  | { kind: 'live' }
  | { kind: 'error'; message: string; code?: 'no-relays' }

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
        code: 'no-relays',
        message: i18n.t('feed.noRelays'),
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

    const queryCellsForCalendar = getQueryCellsForFeed(queryGeohash, geohashLength)

    const feedKinds = [...ROOT_FEED_EVENT_KINDS]

    const pendingBatch: Event[] = []
    let rafFlushId: number | null = null
    let maxWaitFlushId: number | null = null

    const flushPending = () => {
      if (rafFlushId != null) {
        cancelAnimationFrame(rafFlushId)
        rafFlushId = null
      }
      if (maxWaitFlushId != null) {
        window.clearTimeout(maxWaitFlushId)
        maxWaitFlushId = null
      }
      if (cancelled || pendingBatch.length === 0) return

      const batch = pendingBatch.splice(0, pendingBatch.length)

      let counted = 0
      for (const evt of batch) {
        if (evt.kind === NOSTR_KINDS.note && !isReplyNote(evt)) counted++
        else if (isNip52CalendarKind(evt.kind)) counted++
      }

      for (const evt of batch) {
        if (evt.kind !== NOSTR_KINDS.note || isReplyNote(evt)) continue
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
      }

      const prevCount = eventCount
      eventCount += counted
      if (prevCount === 0 && counted > 0) setFeedState({ kind: 'live' })

      setEvents((prev) =>
        filterFeedEventsByQuery(mergeFeedIncoming(prev, batch), queryGeohash, geohashLength),
      )
    }

    const scheduleFlush = () => {
      if (cancelled) return
      if (rafFlushId == null) {
        rafFlushId = requestAnimationFrame(() => {
          rafFlushId = null
          flushPending()
        })
      }
      if (maxWaitFlushId == null) {
        maxWaitFlushId = window.setTimeout(() => {
          maxWaitFlushId = null
          if (rafFlushId != null) {
            cancelAnimationFrame(rafFlushId)
            rafFlushId = null
          }
          flushPending()
        }, FEED_SUBSCRIPTION_BATCH_MAX_MS)
      }
    }

    const onEvent = (evt: Event) => {
      if (cancelled) return

      if (evt.kind === NOSTR_KINDS.note) {
        if (isReplyNote(evt)) return
        pendingBatch.push(evt)
        scheduleFlush()
        return
      }

      if (isNip52CalendarKind(evt.kind)) {
        if (!isValidNip52CalendarEvent(evt)) return
        if (!nip52CalendarMatchesQueryCells(evt, queryCellsForCalendar)) return
        pendingBatch.push(evt)
        scheduleFlush()
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

    // Mode 0: band + exact 5-char — one NDK grouped REQ for all cells (parallel), not staggered subs.
    if (geohashLength === 0 && queryGeohash.length === 5) {
      const cellsToQuery = getQueryCellsForFeed(queryGeohash, geohashLength)
      const filters = cellsToQuery.map((cell) => ({
        kinds: feedKinds,
        '#g': [cell],
        limit: FEED_QUERY_LIMIT,
      }))
      unsubRef.current = client.subscribeGrouped(
        filters,
        { onevent: onEvent, oneose: onEose, onclose: onClose },
        'feed-cells',
      )
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
      if (rafFlushId != null) cancelAnimationFrame(rafFlushId)
      if (maxWaitFlushId != null) window.clearTimeout(maxWaitFlushId)
      pendingBatch.length = 0
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
        code: 'no-relays',
        message: i18n.t('feed.noRelays'),
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

    const cellsForLoadMore = getQueryCellsForFeed(queryGeohash, geohashLength)

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
          const merged =
            evt.kind === NOSTR_KINDS.note
              ? prev.some((e) => e.id === evt.id)
                ? prev
                : [evt, ...prev]
              : upsertFeedEvents(prev, evt)
          return filterFeedEventsByQuery(merged, queryGeohash, geohashLength)
        })
      }

      const markDone = () => {
        window.clearTimeout(timeoutId)
        finish(newEventCount)
      }

      const filters = cellsForLoadMore.map((cell) => ({
        kinds: kindsLoadMore,
        '#g': [cell],
        limit: FEED_QUERY_LIMIT,
        until,
      }))
      const unsub = client.subscribeGrouped(
        filters,
        {
          onevent: onEventLoadMore,
          oneose: markDone,
          onclose: markDone,
        },
        'feed-loadmore',
      )
      unsubs.push(unsub)

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
