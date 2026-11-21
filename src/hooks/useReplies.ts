import { useEffect, useMemo, useRef, useState } from 'react'
import type { Event, Filter } from '../lib/nostrPrimitives'
import type { BreznNostrClient } from '../lib/nostrClient'
import { contentLooksLikeUnspacedBlob, contentMatchesMutedTerms } from '../lib/moderation'

/** `#e` values for a thread: root plus known replies so parent-only nested notes match. */
export function threadReplyETagValues(rootId: string, knownReplyIds: readonly string[]): string[] {
  const out = [rootId]
  const seen = new Set([rootId])
  for (const id of knownReplyIds) {
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

const EXPAND_DEBOUNCE_MS = 250

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
  const queryKey = useMemo(
    () => `${rootId ?? ''}|${termsKey}|${blockedKey}|${isOffline ? 'offline' : 'online'}`,
    [rootId, termsKey, blockedKey, isOffline],
  )

  const [events, setEvents] = useState<Event[]>([])
  const seenRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    setEvents([])
    seenRef.current = new Set()
    if (isOffline || !rootId) return

    let cancelled = false
    let unsub: (() => void) | null = null
    let expandTimer: ReturnType<typeof setTimeout> | null = null
    const knownReplyIds: string[] = []
    let subscribedKey = ''

    const blockedSet = new Set(blockedPubkeys)

    const accept = (evt: Event): boolean => {
      if (evt.kind !== 1) return false
      if (evt.id === rootId) return false
      if (blockedSet.has(evt.pubkey)) return false
      if (contentLooksLikeUnspacedBlob(evt.content ?? '')) return false
      if (mutedTerms.length && contentMatchesMutedTerms(evt.content ?? '', mutedTerms)) return false
      if (seenRef.current.has(evt.id)) return false
      return true
    }

    const startOrRestart = () => {
      if (cancelled) return
      const eTags = threadReplyETagValues(rootId, knownReplyIds)
      const nextKey = eTags.join(',')
      if (nextKey === subscribedKey && unsub) return
      subscribedKey = nextKey
      unsub?.()
      const filter: Filter = { kinds: [1], '#e': eTags, limit: 500 }
      unsub = client.subscribe(filter, {
        immediate: true,
        onevent: (evt) => {
          if (cancelled) return
          if (!accept(evt)) return
          seenRef.current.add(evt.id)
          knownReplyIds.push(evt.id)
          setEvents((prev) => [...prev, evt])
          // Nested replies often tag only the parent; widen `#e` after a short debounce.
          if (expandTimer) clearTimeout(expandTimer)
          expandTimer = setTimeout(() => {
            expandTimer = null
            startOrRestart()
          }, EXPAND_DEBOUNCE_MS)
        },
      })
    }

    startOrRestart()

    return () => {
      cancelled = true
      if (expandTimer) clearTimeout(expandTimer)
      unsub?.()
    }
    // queryKey captures rootId, mutedTerms, blockedPubkeys, isOffline
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, queryKey])

  const replies = useMemo(() => {
    return events.slice().sort((a, b) => a.created_at - b.created_at)
  }, [events])

  return { replies }
}
