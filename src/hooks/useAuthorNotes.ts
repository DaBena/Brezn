import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Event, Filter } from 'nostr-tools'
import type { BreznNostrClient } from '../lib/nostrClient'
import { contentMatchesMutedTerms } from '../lib/moderation'

const PAGE_SIZE = 50
const HISTORY_SECONDS = 60 * 60 * 24 * 365

/** Kind-1 root note: no NIP-10 `e` tag (same idea as useLocalFeed / isReplyNote). */
function isRootNote(evt: Event): boolean {
  return evt.kind === 1 && !evt.tags.some(t => t[0] === 'e')
}

function mergeAndSort(prev: Event[], incoming: Event[]): Event[] {
  const byId = new Map<string, Event>()
  for (const e of prev) byId.set(e.id, e)
  for (const e of incoming) byId.set(e.id, e)
  return [...byId.values()].sort((a, b) => b.created_at - a.created_at)
}

export function useAuthorNotes(params: {
  client: BreznNostrClient
  authorPubkey: string | null
  mutedTerms: string[]
  blockedPubkeys: string[]
  deletedNoteIds: Set<string>
  isOffline: boolean
}) {
  const { client, authorPubkey, mutedTerms, blockedPubkeys, deletedNoteIds, isOffline } = params

  const mutedRef = useRef(mutedTerms)
  const blockedRef = useRef(blockedPubkeys)
  const deletedRef = useRef(deletedNoteIds)

  const [events, setEvents] = useState<Event[]>([])
  const [hasMore, setHasMore] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const seenIdsRef = useRef<Set<string>>(new Set())
  const eventsRef = useRef<Event[]>([])

  useLayoutEffect(() => {
    mutedRef.current = mutedTerms
    blockedRef.current = blockedPubkeys
    deletedRef.current = deletedNoteIds
  }, [mutedTerms, blockedPubkeys, deletedNoteIds])

  useLayoutEffect(() => {
    eventsRef.current = events
  }, [events])

  useEffect(() => {
    if (!authorPubkey) return
    seenIdsRef.current = new Set()
    queueMicrotask(() => {
      setEvents([])
      setHasMore(true)
      setLoadingMore(false)
    })
  }, [authorPubkey])

  useEffect(() => {
    if (isOffline || !authorPubkey) return
    if (blockedPubkeys.includes(authorPubkey)) {
      queueMicrotask(() => {
        setEvents([])
        setHasMore(false)
      })
      return
    }

    const since = Math.floor(Date.now() / 1000) - HISTORY_SECONDS
    const filter: Filter = {
      kinds: [1],
      authors: [authorPubkey],
      limit: PAGE_SIZE,
      since,
    }

    const accept = (evt: Event): boolean => {
      if (evt.kind !== 1 || evt.pubkey !== authorPubkey) return false
      if (!isRootNote(evt)) return false
      if (blockedRef.current.includes(evt.pubkey)) return false
      if (contentMatchesMutedTerms(evt.content ?? '', mutedRef.current)) return false
      if (deletedRef.current.has(evt.id)) return false
      return true
    }

    const unsub = client.subscribe(filter, {
      onevent: evt => {
        if (!accept(evt)) return
        if (seenIdsRef.current.has(evt.id)) return
        seenIdsRef.current.add(evt.id)
        setEvents(prev => mergeAndSort(prev, [evt]))
      },
    })

    return () => unsub()
  }, [client, isOffline, authorPubkey, blockedPubkeys])

  const loadMore = useCallback(() => {
    if (!authorPubkey || isOffline || loadingMore || !hasMore) return
    if (blockedRef.current.includes(authorPubkey)) return

    const current = eventsRef.current
    const oldest = current.length ? Math.min(...current.map(e => e.created_at)) : Math.floor(Date.now() / 1000)
    const until = oldest - 1
    if (until <= 0) {
      setHasMore(false)
      return
    }

    setLoadingMore(true)
    const filter: Filter = {
      kinds: [1],
      authors: [authorPubkey],
      limit: PAGE_SIZE,
      until,
    }

    const accept = (evt: Event): boolean => {
      if (evt.kind !== 1 || evt.pubkey !== authorPubkey) return false
      if (!isRootNote(evt)) return false
      if (blockedRef.current.includes(evt.pubkey)) return false
      if (contentMatchesMutedTerms(evt.content ?? '', mutedRef.current)) return false
      if (deletedRef.current.has(evt.id)) return false
      return true
    }

    const batchById = new Map<string, Event>()
    let done = false
    const cleanup: { timeoutId: number; unsub: () => void } = { timeoutId: 0, unsub: () => {} }

    const finish = () => {
      if (done) return
      done = true
      window.clearTimeout(cleanup.timeoutId)
      cleanup.unsub()
      setLoadingMore(false)
      const batch = [...batchById.values()]
      for (const evt of batch) seenIdsRef.current.add(evt.id)
      if (batch.length) setEvents(prev => mergeAndSort(prev, batch))
      if (batch.length < PAGE_SIZE) setHasMore(false)
    }

    cleanup.unsub = client.subscribe(filter, {
      onevent: evt => {
        if (!accept(evt)) return
        if (seenIdsRef.current.has(evt.id)) return
        batchById.set(evt.id, evt)
      },
      oneose: finish,
    })

    cleanup.timeoutId = window.setTimeout(finish, 6000) as number
  }, [authorPubkey, client, hasMore, isOffline, loadingMore])

  const sortedEvents = useMemo(() => [...events].sort((a, b) => b.created_at - a.created_at), [events])

  return { events: sortedEvents, hasMore, loadingMore, loadMore }
}
