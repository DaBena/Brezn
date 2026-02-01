import { useEffect, useMemo, useRef, useState } from 'react'
import type { Event, Filter } from 'nostr-tools'
import type { BreznNostrClient } from '../lib/nostrClient'
import { contentMatchesMutedTerms } from '../lib/moderation'

export function useReplies(params: {
  client: BreznNostrClient
  rootId: string | null
  mutedTerms: string[]
  blockedPubkeys: string[]
  isOffline: boolean
}) {
  const { client, rootId, mutedTerms, blockedPubkeys, isOffline } = params

  const termsKey = useMemo(() => mutedTerms.join(','), [mutedTerms])
  const blockedKey = useMemo(() => blockedPubkeys.join(','), [blockedPubkeys])
  const queryKey = useMemo(() => `${rootId ?? ''}|${termsKey}|${blockedKey}|${isOffline ? 'offline' : 'online'}`, [rootId, termsKey, blockedKey, isOffline])

  const [events, setEvents] = useState<Event[]>([])
  const seenRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    setEvents([])
    seenRef.current = new Set()
    if (isOffline || !rootId) return

    const since = Math.floor(Date.now() / 1000) - 60 * 60 * 24 * 14 // last 14d
    const filter: Filter = { kinds: [1], '#e': [rootId], since, limit: 500 }

    const blockedSet = new Set(blockedPubkeys)
    const unsub = client.subscribe(filter, {
      onevent: evt => {
        if (evt.kind !== 1) return
        if (evt.id === rootId) return
        if (blockedSet.has(evt.pubkey)) return
        if (mutedTerms.length && contentMatchesMutedTerms(evt.content ?? '', mutedTerms)) return
        if (seenRef.current.has(evt.id)) return
        seenRef.current.add(evt.id)
        setEvents(prev => [...prev, evt])
      },
    })

    return unsub
    // queryKey captures rootId, mutedTerms, blockedPubkeys, isOffline
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, queryKey])

  const replies = useMemo(() => {
    return events.slice().sort((a, b) => a.created_at - b.created_at)
  }, [events])

  return { replies }
}

