import { useEffect, useMemo, useState } from 'react'
import type { Event } from 'nostr-tools'
import type { BreznNostrClient } from '../lib/nostrClient'
import { resolveEventsById } from '../lib/eventResolver'

export function useReferencedPosts(client: BreznNostrClient | undefined, eventIdsInput: string[]) {
  const eventIds = useMemo(
    () => [
      ...new Set(
        eventIdsInput
          .map((v) => (v ?? '').trim().toLowerCase())
          .filter((v) => /^[0-9a-f]{64}$/.test(v)),
      ),
    ],
    [eventIdsInput],
  )
  const [byId, setById] = useState<Record<string, Event | null>>({})
  const [loadingIds, setLoadingIds] = useState<Record<string, true>>({})
  const missingKey = useMemo(
    () =>
      eventIds
        .filter((id) => !(id in byId))
        .slice()
        .sort()
        .join(','),
    [eventIds, byId],
  )
  const hasById = Object.keys(byId).length > 0
  const hasLoadingIds = Object.keys(loadingIds).length > 0

  useEffect(() => {
    const schedule = (fn: () => void) => {
      if (typeof queueMicrotask === 'function') queueMicrotask(fn)
      else void Promise.resolve().then(fn)
    }

    const missingIds = missingKey.split(',').filter((id) => /^[0-9a-f]{64}$/.test(id))

    if (!client || eventIds.length === 0) {
      if (!hasById && !hasLoadingIds) return
      schedule(() => {
        setById({})
        setLoadingIds({})
      })
      return
    }
    let active = true
    if (!missingIds.length) return
    schedule(() => {
      setLoadingIds((prev) => {
        const next = { ...prev }
        for (const id of missingIds) next[id] = true
        return next
      })
    })

    void resolveEventsById(client, missingIds).then((resolved) => {
      if (!active) return
      setById((prev) => ({ ...prev, ...resolved }))
      setLoadingIds((prev) => {
        const next = { ...prev }
        for (const id of missingIds) delete next[id]
        return next
      })
    })

    return () => {
      active = false
    }
  }, [client, eventIds, missingKey, hasById, hasLoadingIds])

  return { byId, loadingIds }
}
