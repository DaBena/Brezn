import { useEffect, useMemo, useRef, useState } from 'react'
import type { Event, Filter } from 'nostr-tools'
import type { BreznNostrClient } from '../lib/nostrClient'
import { contentMatchesMutedTerms } from '../lib/moderation'

export function useReplies(params: {
  client: BreznNostrClient
  rootId: string | null
  mutedTerms: string[]
  isOffline: boolean
}) {
  const { client, rootId, mutedTerms, isOffline } = params

  const termsKey = useMemo(() => mutedTerms.join(','), [mutedTerms])
  const queryKey = useMemo(() => `${rootId ?? ''}|${termsKey}|${isOffline ? 'offline' : 'online'}`, [rootId, termsKey, isOffline])

  const [events, setEvents] = useState<Event[]>([])
  const seenRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    // Avoid synchronous setState inside effect body (lint/perf).
    let cancelled = false
    const resetId = window.setTimeout(() => {
      if (!cancelled) setEvents([])
    }, 0)
    seenRef.current = new Set()
    if (isOffline) {
      return () => {
        cancelled = true
        window.clearTimeout(resetId)
      }
    }
    if (!rootId) {
      return () => {
        cancelled = true
        window.clearTimeout(resetId)
      }
    }

    const since = Math.floor(Date.now() / 1000) - 60 * 60 * 24 * 14 // last 14d
    const filter: Filter = { kinds: [1], '#e': [rootId], since, limit: 500 }

    const unsub = client.subscribe(filter, {
      onevent: evt => {
        if (evt.kind !== 1) return
        if (evt.id === rootId) return
        if (mutedTerms.length && contentMatchesMutedTerms(evt.content ?? '', mutedTerms)) return
        if (seenRef.current.has(evt.id)) return
        seenRef.current.add(evt.id)
        setEvents(prev => [...prev, evt])
      },
    })

    return () => {
      cancelled = true
      window.clearTimeout(resetId)
      unsub()
    }
    // queryKey captures all relevant deps.
  }, [client, queryKey, rootId, mutedTerms, isOffline])

  const replies = useMemo(() => {
    return events.slice().sort((a, b) => a.created_at - b.created_at)
  }, [events])

  return { replies }
}

