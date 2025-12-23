import { useEffect, useMemo, useRef, useState } from 'react'
import type { Event } from 'nostr-tools'
import type { BreznNostrClient } from '../lib/nostrClient'
import { chunkArray } from '../lib/array'
import {
  clampLocalRadiusKm,
  decodeGeohashCenter,
  encodeGeohash,
  GEOHASH_LEN_MAX_UI,
  GEOHASH_LEN_MIN_UI,
  geohashCellsWithinRadiusKm,
  getBrowserLocation,
  maxLocalRadiusKmForGeoLen,
} from '../lib/geo'
import { contentMatchesMutedTerms } from '../lib/moderation'
import { loadJson, saveJson } from '../lib/storage'

export type FeedState =
  | { kind: 'need-location' }
  | { kind: 'loading' }
  | { kind: 'live' }
  | { kind: 'error'; message: string }

type SavedLocation = { geohash6: string; savedAt: number }

const FEED_CACHE_KEY = 'brezn:feed-cache:v1'
const LAST_LOCATION_KEY = 'brezn:last-location:v1'
const LOCAL_GEO_LEN = 5
const LOCAL_RADIUS_DEFAULT_KM = 500
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
}) {
  const { client, mutedTerms } = params

  const cached = loadJson<{ updatedAt: number; geoCell?: string; events: Event[] } | null>(FEED_CACHE_KEY, null)
  const savedLocation = loadJson<SavedLocation | null>(LAST_LOCATION_KEY, null)

  const [isOffline, setIsOffline] = useState(() => (typeof navigator !== 'undefined' ? !navigator.onLine : false))

  const initialSavedGeo6 =
    typeof savedLocation?.geohash6 === 'string' && savedLocation.geohash6.length >= GEOHASH_LEN_MIN_UI ? savedLocation.geohash6 : null

  const initialLocalGeoCell =
    !isOffline && initialSavedGeo6 ? initialSavedGeo6.slice(0, LOCAL_GEO_LEN) : null

  const initialRadiusKm = (() => {
    const v = client.getLocalRadiusKm()
    const raw = typeof v === 'number' && Number.isFinite(v) ? v : LOCAL_RADIUS_DEFAULT_KM
    return clampLocalRadiusKm(LOCAL_GEO_LEN, raw)
  })()

  const initialLocalGeoCellsQuery =
    !isOffline && initialLocalGeoCell
      ? geohashCellsWithinRadiusKm({ center: initialLocalGeoCell, len: LOCAL_GEO_LEN, radiusKm: initialRadiusKm })
      : []

  const [radiusKm, setRadiusKm] = useState<number>(initialRadiusKm)
  const [feedState, setFeedState] = useState<FeedState>(() => {
    if (cached?.events?.length && isOffline) return { kind: 'live' }
    return initialLocalGeoCellsQuery.length ? { kind: 'loading' } : { kind: 'need-location' }
  })
  const [events, setEvents] = useState<Event[]>(() => (cached?.events?.length ? cached.events : []))
  const [geoCell, setGeoCell] = useState<string | null>(() => (isOffline ? (cached?.geoCell ?? null) : initialLocalGeoCell))
  const [geoCellsQuery, setGeoCellsQuery] = useState<string[]>(() => (isOffline ? [] : initialLocalGeoCellsQuery))
  const [initialTimedOut, setInitialTimedOut] = useState(false)
  const [lastCloseReasons, setLastCloseReasons] = useState<string[] | null>(null)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [viewerGeo6, setViewerGeo6] = useState<string | null>(() => initialSavedGeo6)

  const viewerPoint = useMemo(() => (viewerGeo6 ? decodeGeohashCenter(viewerGeo6) : null), [viewerGeo6])

  const unsubRef = useRef<null | (() => void)>(null)
  const autoBackfillRef = useRef<{ key: string; attempts: number }>({ key: '', attempts: 0 })

  const sortedEvents = useMemo(() => {
    const filtered = events.filter(e => !(mutedTerms.length && contentMatchesMutedTerms(e.content ?? '', mutedTerms)))
    return filtered.sort((a, b) => b.created_at - a.created_at)
  }, [events, mutedTerms])

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

  function readSavedGeo6(): string | null {
    const v = loadJson<SavedLocation | null>(LAST_LOCATION_KEY, null)
    if (!v || typeof v.geohash6 !== 'string') return null
    const s = v.geohash6.trim()
    if (s.length < GEOHASH_LEN_MIN_UI) return null
    return s
  }

  function setLocalQueryFromGeo6(geo6: string, rKm: number) {
    const cell = geo6.slice(0, LOCAL_GEO_LEN)
    const cells = geohashCellsWithinRadiusKm({ center: cell, len: LOCAL_GEO_LEN, radiusKm: rKm })
    setEvents([])
    setGeoCell(cell)
    setGeoCellsQuery(cells)
    setFeedState({ kind: 'loading' })
  }

  async function requestLocationAndLoad(opts?: { forceBrowser?: boolean }) {
    setFeedState({ kind: 'loading' })
    setInitialTimedOut(false)
    setLastCloseReasons(null)
    try {
      const rKm = clampLocalRadiusKm(LOCAL_GEO_LEN, radiusKm)
      // Prefer a stored last location to avoid prompting on every app open.
      if (!opts?.forceBrowser) {
        const savedGeo6 = readSavedGeo6()
        if (savedGeo6) {
          setViewerGeo6(savedGeo6)
          setLocalQueryFromGeo6(savedGeo6, rKm)
          return
        }
      }

      const pos = await getBrowserLocation()
      const geo6 = encodeGeohash(pos, GEOHASH_LEN_MAX_UI)
      saveJson(LAST_LOCATION_KEY, { geohash6: geo6, savedAt: Date.now() } satisfies SavedLocation)
      setViewerGeo6(geo6)
      setLocalQueryFromGeo6(geo6, rKm)
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

  useEffect(() => {
    if (isOffline) return
    if (!geoCellsQuery.length) return
    unsubRef.current?.()

    let didEose = false
    const timeoutId = window.setTimeout(() => {
      if (!didEose) setInitialTimedOut(true)
    }, 12_500)

    const since = Math.floor(Date.now() / 1000) - 60 * 60 * 24 // last 24h
    const MAX_GEO_TAGS_PER_SUB = 500

    const onEvent = (evt: Event) => {
      if (evt.kind !== 1) return
      if (isReplyNote(evt)) return
      // basic de-dupe
      setEvents(prev => (prev.some(e => e.id === evt.id) ? prev : [evt, ...prev]))
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

    const unsubs: Array<() => void> = []
    for (const cells of chunkArray(geoCellsQuery, MAX_GEO_TAGS_PER_SUB)) {
      unsubs.push(
        client.subscribe(
          { kinds: [1], '#g': cells, limit: 200, since },
          { onevent: onEvent, oneose: onEose, onclose: onClose },
        ),
      )
    }
    const unsub = () => {
      for (const u of unsubs) u()
    }
    unsubRef.current = unsub
    return () => {
      window.clearTimeout(timeoutId)
      unsub()
    }
  }, [client, geoCellsQuery, isOffline])

  function loadMore() {
    if (isLoadingMore) return
    if (!geoCellsQuery.length) return

    const oldest = events.reduce((min, e) => Math.min(min, e.created_at), Number.POSITIVE_INFINITY)
    if (!Number.isFinite(oldest) || oldest <= 0) return

    setIsLoadingMore(true)

    const until = oldest - 1
    const MAX_GEO_TAGS_PER_SUB = 500

    const onEvent = (evt: Event) => {
      if (evt.kind !== 1) return
      if (isReplyNote(evt)) return
      setEvents(prev => (prev.some(e => e.id === evt.id) ? prev : [evt, ...prev]))
    }

    const unsubs: Array<() => void> = []
    const done = new Set<number>()

    const clear = () => {
      for (const u of unsubs) u()
      setIsLoadingMore(false)
    }

    const timeoutId = window.setTimeout(clear, 12_500)
    const markDone = (idx: number) => {
      done.add(idx)
      if (done.size >= unsubs.length) {
        window.clearTimeout(timeoutId)
        clear()
      }
    }

    chunkArray(geoCellsQuery, MAX_GEO_TAGS_PER_SUB).forEach((cells, idx) => {
      unsubs.push(
        client.subscribe(
          { kinds: [1], '#g': cells, limit: 200, until },
          { onevent: onEvent, oneose: () => markDone(idx), onclose: () => markDone(idx) },
        ),
      )
    })
  }

  // Auto-backfill: wenn zu wenig Posts da sind, automatisch ältere nachladen,
  // damit der Feed ohne "Mehr laden" direkt sinnvoll gefüllt ist.
  useEffect(() => {
    if (isOffline) return
    if (!geoCellsQuery.length) return
    if (!sortedEvents.length) return
    if (sortedEvents.length >= INITIAL_MIN_POSTS) return
    if (isLoadingMore) return

    // Versuche pro Geo-Query nur ein paar Mal nachzuladen.
    const key = geoCellsQuery.join(',')
    if (autoBackfillRef.current.key !== key) autoBackfillRef.current = { key, attempts: 0 }
    if (autoBackfillRef.current.attempts >= AUTO_BACKFILL_MAX_ATTEMPTS) return

    autoBackfillRef.current.attempts++
    loadMore()
    // Intentionally omit loadMore from deps; wir brauchen nur die aktuellen Render-Werte.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geoCellsQuery, isLoadingMore, isOffline, sortedEvents.length])

  function applyRadiusKm(nextRadiusKm: number) {
    const clamped = clampLocalRadiusKm(LOCAL_GEO_LEN, nextRadiusKm)
    client.setLocalRadiusKm(clamped)
    setRadiusKm(clamped)

    // If we already have a stored last location, rebuild the query without prompting.
    const savedGeo6 = readSavedGeo6()
    if (savedGeo6) {
      setViewerGeo6(savedGeo6)
      setLocalQueryFromGeo6(savedGeo6, clamped)
    }
  }

  return {
    feedState,
    requestLocationAndLoad,
    geoCell,
    isOffline,
    sortedEvents,
    viewerPoint,
    geoLen: LOCAL_GEO_LEN,
    radiusKm,
    radiusKmMax: maxLocalRadiusKmForGeoLen(LOCAL_GEO_LEN),
    initialTimedOut,
    lastCloseReasons,
    isLoadingMore,
    loadMore,
    applyRadiusKm,
  }
}

