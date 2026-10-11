import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Event } from '../lib/nostrPrimitives'
import type { BreznNostrClient } from '../lib/nostrClient'
import { NOSTR_KINDS } from '../lib/breznNostr'
import {
  SEARCH_PEOPLE_DISPLAY_MAX,
  SEARCH_PEOPLE_PROBE_MAX,
  SEARCH_SUPPORT_PROBE_TIMEOUT_MS,
} from '../lib/constants'
import {
  buildNip50SearchFilters,
  buildPosterProbeFilters,
  buildPubkeyLookupFilters,
  buildSearchSupportProbeFilter,
  isSearchPostEvent,
  keepSearchPerson,
  nip11SearchHint,
  parseKind0Profile,
  parseSearchTargetPubkey,
  scoreSearchPerson,
  searchRelaysFromHints,
  searchResultMatchesQuery,
} from '../lib/nip50Search'
import { getRelayNip11, relaysSupportingNip } from '../lib/nip11'
import { contentLooksLikeUnspacedBlob, contentMatchesMutedTerms } from '../lib/moderation'
import { isNip52CalendarKind, nip52SearchBlob } from '../lib/nip52'

/** EOSE with no events means the relay applied `search`. Any event means it ignored the field. */
function probeRelayHonorsSearch(client: BreznNostrClient, url: string): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false
    let unsub: (() => void) | null = null
    const finish = (honors: boolean) => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      unsub?.()
      resolve(honors)
    }
    const timer = window.setTimeout(() => finish(false), SEARCH_SUPPORT_PROBE_TIMEOUT_MS)
    try {
      unsub = client.subscribeGrouped(
        [buildSearchSupportProbeFilter()],
        {
          relayUrls: [url],
          onevent: () => finish(false),
          oneose: () => finish(true),
          onclose: () => finish(false),
        },
        'search-probe',
      )
      if (settled) unsub()
    } catch {
      finish(false)
    }
  })
}

export type SearchPerson = {
  pubkey: string
  name?: string
  displayName?: string
  picture?: string
  about?: string
  fromKind0: boolean
}

export function useSearch(params: {
  client: BreznNostrClient
  sortedEvents: Event[]
  isOffline: boolean
  mutedTerms: string[]
  blockedPubkeys: string[]
}) {
  const { client, sortedEvents, isOffline, mutedTerms, blockedPubkeys } = params
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('')
  const [networkEvents, setNetworkEvents] = useState<Event[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [probedPosters, setProbedPosters] = useState<Set<string>>(() => new Set())
  const [probePending, setProbePending] = useState(false)
  const probeGenRef = useRef(0)
  const searchGenRef = useRef(0)
  const pageUnsubsRef = useRef<Array<() => void>>([])
  const pageTimeoutRef = useRef(0)

  const blockedSet = useMemo(
    () => new Set(blockedPubkeys.map((p) => p.toLowerCase())),
    [blockedPubkeys],
  )

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  const relaysKey = [...client.getRelays()].sort().join(',')
  const seenRef = useRef<Set<string>>(new Set())

  const clearSearchSubs = useCallback(() => {
    window.clearTimeout(pageTimeoutRef.current)
    pageTimeoutRef.current = 0
    for (const unsub of pageUnsubsRef.current) unsub()
    pageUnsubsRef.current = []
  }, [])

  useEffect(() => {
    if (isOffline) return
    void relaysSupportingNip(client.getRelays(), 50)
  }, [client, relaysKey, isOffline])

  useEffect(() => {
    const gen = ++searchGenRef.current
    clearSearchSubs()
    seenRef.current = new Set()
    const q = debouncedSearchQuery.trim()
    if (!q || isOffline) {
      const t = window.setTimeout(() => {
        if (searchGenRef.current !== gen) return
        setNetworkEvents([])
        setIsSearching(false)
      }, 0)
      return () => {
        searchGenRef.current += 1
        window.clearTimeout(t)
        clearSearchSubs()
      }
    }

    let started = false
    const start = window.setTimeout(() => {
      if (started || searchGenRef.current !== gen) return
      setNetworkEvents([])
      setIsSearching(true)
    }, 0)

    const pk = parseSearchTargetPubkey(q)
    const applyEvent = (evt: Event) => {
      if (searchGenRef.current !== gen) return
      if (blockedSet.has(evt.pubkey.toLowerCase())) return
      if (seenRef.current.has(evt.id)) return
      if (evt.kind === NOSTR_KINDS.note && contentLooksLikeUnspacedBlob(evt.content ?? '')) return
      if (!searchResultMatchesQuery(evt, q.toLowerCase(), pk)) return
      seenRef.current.add(evt.id)
      setNetworkEvents((prev) => (prev.some((e) => e.id === evt.id) ? prev : [...prev, evt]))
    }

    void (async () => {
      const hints = await Promise.all(
        client.getRelays().map(async (url) => {
          const doc = await getRelayNip11(url)
          return { url, hint: nip11SearchHint(doc.nips, doc.ok) }
        }),
      )
      if (searchGenRef.current !== gen) return
      const searchRelays = await searchRelaysFromHints(hints, (url) =>
        probeRelayHonorsSearch(client, url),
      )
      if (searchGenRef.current !== gen) return
      started = true
      setNetworkEvents([])
      setIsSearching(true)

      const filters = buildNip50SearchFilters(q)
      const lookup = pk ? buildPubkeyLookupFilters(pk) : []
      let pending = 0
      const markDoneOnce = () => {
        let done = false
        return () => {
          if (done || searchGenRef.current !== gen) return
          done = true
          pending -= 1
          if (pending <= 0) setIsSearching(false)
        }
      }
      const attach = (nextFilters: typeof filters, label: string, relayUrls?: string[]) => {
        if (searchGenRef.current !== gen || nextFilters.length === 0) return
        if (relayUrls && relayUrls.length === 0) return
        pending += 1
        const done = markDoneOnce()
        const unsub = client.subscribeGrouped(
          nextFilters,
          { onevent: applyEvent, oneose: done, onclose: done, relayUrls },
          label,
        )
        pageUnsubsRef.current.push(unsub)
      }
      attach(filters, 'search', searchRelays)
      attach(lookup, 'search-id')
      if (pending === 0) {
        setIsSearching(false)
        return
      }
      pageTimeoutRef.current = window.setTimeout(() => {
        if (searchGenRef.current === gen) setIsSearching(false)
      }, 12_000)
    })()

    return () => {
      searchGenRef.current += 1
      window.clearTimeout(start)
      clearSearchSubs()
    }
  }, [client, debouncedSearchQuery, isOffline, relaysKey, blockedSet, clearSearchSubs])

  const queryLower = debouncedSearchQuery.trim().toLowerCase()
  const targetPubkey = useMemo(
    () => parseSearchTargetPubkey(debouncedSearchQuery),
    [debouncedSearchQuery],
  )

  const knownPosterSet = useMemo(() => {
    const posted = new Set<string>()
    const add = (evt: Event) => {
      if (isSearchPostEvent(evt)) posted.add(evt.pubkey.toLowerCase())
    }
    for (const evt of networkEvents) add(evt)
    for (const evt of sortedEvents) add(evt)
    return posted
  }, [networkEvents, sortedEvents])

  const candidatePeople = useMemo((): (SearchPerson & { score: number })[] => {
    if (!queryLower) return []
    const map = new Map<string, SearchPerson & { score: number }>()
    if (targetPubkey && !blockedSet.has(targetPubkey)) {
      map.set(targetPubkey, {
        pubkey: targetPubkey,
        fromKind0: false,
        score: 1000,
      })
    }
    for (const evt of networkEvents) {
      if (evt.kind !== NOSTR_KINDS.metadata) continue
      if (blockedSet.has(evt.pubkey.toLowerCase())) continue
      if (!searchResultMatchesQuery(evt, queryLower, targetPubkey)) continue
      const parsed = parseKind0Profile(evt.content ?? '')
      const pk = evt.pubkey.toLowerCase()
      const score = targetPubkey === pk ? 1000 : scoreSearchPerson(parsed, queryLower)
      const prev = map.get(pk)
      if (prev && prev.score > score) continue
      map.set(pk, {
        pubkey: pk,
        name: parsed.name,
        displayName: parsed.displayName,
        picture: parsed.picture,
        about: parsed.about,
        fromKind0: true,
        score,
      })
    }
    return [...map.values()].sort((a, b) => b.score - a.score)
  }, [queryLower, targetPubkey, networkEvents, blockedSet])

  const postedPubkeys = useMemo(() => {
    const posted = new Set(knownPosterSet)
    for (const pk of probedPosters) posted.add(pk)
    return posted
  }, [knownPosterSet, probedPosters])

  const people = useMemo((): SearchPerson[] => {
    return candidatePeople
      .filter((person) => keepSearchPerson(person.pubkey, targetPubkey, postedPubkeys))
      .map(({ score: _score, ...person }) => person)
  }, [candidatePeople, targetPubkey, postedPubkeys])

  const probeKey = useMemo(() => {
    if (!queryLower) return ''
    let confirmed = 0
    const need: string[] = []
    for (const person of candidatePeople) {
      if (keepSearchPerson(person.pubkey, targetPubkey, knownPosterSet)) {
        confirmed += 1
        continue
      }
      need.push(person.pubkey)
      if (need.length >= SEARCH_PEOPLE_PROBE_MAX) break
    }
    if (confirmed >= SEARCH_PEOPLE_DISPLAY_MAX || need.length === 0) return ''
    return need.join(',')
  }, [queryLower, candidatePeople, targetPubkey, knownPosterSet])

  useEffect(() => {
    const gen = ++probeGenRef.current
    if (!probeKey || isOffline) {
      const t = window.setTimeout(() => {
        if (probeGenRef.current !== gen) return
        setProbedPosters(new Set())
        setProbePending(false)
      }, 0)
      return () => window.clearTimeout(t)
    }

    const filters = buildPosterProbeFilters(probeKey.split(','))
    if (filters.length === 0) {
      const t = window.setTimeout(() => {
        if (probeGenRef.current !== gen) return
        setProbedPosters(new Set())
        setProbePending(false)
      }, 0)
      return () => window.clearTimeout(t)
    }

    const start = window.setTimeout(() => {
      if (probeGenRef.current !== gen) return
      setProbedPosters(new Set())
      setProbePending(true)
    }, 0)

    const unsub = client.subscribeGrouped(
      filters,
      {
        onevent: (evt) => {
          if (probeGenRef.current !== gen) return
          if (!isSearchPostEvent(evt)) return
          const pk = evt.pubkey.toLowerCase()
          setProbedPosters((prev) => {
            if (prev.has(pk)) return prev
            const next = new Set(prev)
            next.add(pk)
            return next
          })
        },
        oneose: () => {
          if (probeGenRef.current !== gen) return
          setProbePending(false)
        },
      },
      'search-posted',
    )
    const timeoutId = window.setTimeout(() => {
      if (probeGenRef.current !== gen) return
      setProbePending(false)
    }, 8_000)

    return () => {
      window.clearTimeout(start)
      window.clearTimeout(timeoutId)
      unsub()
    }
  }, [client, probeKey, isOffline, relaysKey])

  const filteredEvents = useMemo(() => {
    if (!queryLower) return sortedEvents
    const seen = new Set<string>()
    const out: Event[] = []
    const consider = (evt: Event) => {
      if (!isSearchPostEvent(evt)) return
      if (blockedSet.has(evt.pubkey.toLowerCase())) return
      if (evt.kind === NOSTR_KINDS.note && contentLooksLikeUnspacedBlob(evt.content ?? '')) return
      if (mutedTerms.length) {
        const blob = isNip52CalendarKind(evt.kind) ? nip52SearchBlob(evt) : (evt.content ?? '')
        if (contentMatchesMutedTerms(blob, mutedTerms)) return
      }
      if (seen.has(evt.id)) return
      seen.add(evt.id)
      out.push(evt)
    }
    for (const evt of networkEvents) {
      if (searchResultMatchesQuery(evt, queryLower, targetPubkey)) consider(evt)
    }
    for (const evt of sortedEvents) {
      if (searchResultMatchesQuery(evt, queryLower, targetPubkey)) consider(evt)
    }
    out.sort((a, b) => b.created_at - a.created_at)
    return out
  }, [queryLower, targetPubkey, sortedEvents, networkEvents, blockedSet, mutedTerms])

  return {
    searchQuery,
    setSearchQuery,
    filteredEvents,
    people,
    isSearching: Boolean(queryLower) && (isSearching || probePending),
    hasQuery: Boolean(queryLower),
  }
}
