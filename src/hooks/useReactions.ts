import { useEffect, useRef, useState } from 'react'
import type { Event, Filter } from 'nostr-tools'
import type { BreznNostrClient } from '../lib/nostrClient'
import { getTagValue } from '../lib/nostrUtils'

export type ReactionSummary = {
  total: number
  viewerReacted: boolean
}

function isCountedReaction(evt: Event): boolean {
  // NIP-25: kind 7 reactions. We treat "-" as non-positive and don't count it.
  const c = (evt.content ?? '').trim()
  return c !== '-'
}

export function useReactions(params: {
  client: BreznNostrClient
  noteIds: string[]
  viewerPubkey: string | null
  isOffline: boolean
}) {
  const { client, noteIds, viewerPubkey, isOffline } = params

  // NOTE: `noteIds` is often created via `.map(...)` in callers.
  // Using the array directly in deps can cause re-subscribes on every render,
  // which in turn can double-count events. Use stable string keys instead.
  const limitedNoteIds = Array.from(new Set(noteIds)).slice(0, 200)
  const noteIdKey = limitedNoteIds.join(',')
  const activeKey = `${noteIdKey}|${viewerPubkey ?? ''}`

  const [state, setState] = useState<{ key: string; byNote: Record<string, ReactionSummary> }>({ key: '', byNote: {} })
  const seenReactionIdsRef = useRef<Set<string>>(new Set())
  const countedPubkeysByNoteRef = useRef<Map<string, Set<string>>>(new Map())
  const scopeKeyRef = useRef<string>('')

  useEffect(() => {
    if (isOffline) return
    if (!noteIdKey) return

    const ids = noteIdKey.split(',').filter(Boolean)
    if (!ids.length) return

    const noteIdSet = new Set(ids)

    // Only reset local dedupe + counters when the query *scope* changes.
    // Otherwise, reconnects/restarts can re-send the same events and we'd double-count them.
    if (scopeKeyRef.current !== activeKey) {
      scopeKeyRef.current = activeKey
      seenReactionIdsRef.current = new Set()
      countedPubkeysByNoteRef.current = new Map()
      // Reset state when scope changes to ensure fresh data
      setState({ key: activeKey, byNote: {} })
    }

    const since = Math.floor(Date.now() / 1000) - 60 * 60 * 24 * 14 // last 14d
    const filter: Filter = { kinds: [7], '#e': ids, since, limit: 2000 }

    const unsub = client.subscribe(filter, {
      onevent: evt => {
        if (evt.kind !== 7) return
        if (!isCountedReaction(evt)) return
        if (seenReactionIdsRef.current.has(evt.id)) return

        const noteId = getTagValue(evt, 'e')
        if (!noteId || !noteIdSet.has(noteId)) return

        seenReactionIdsRef.current.add(evt.id)

        // Count at most one positive reaction per (noteId, pubkey).
        // Nostr relays may contain multiple kind:7 events by the same pubkey for the same target.
        const countedByNote = countedPubkeysByNoteRef.current
        const countedPubkeys = countedByNote.get(noteId) ?? new Set<string>()
        const isNewPubkey = !countedPubkeys.has(evt.pubkey)
        if (isNewPubkey) {
          countedPubkeys.add(evt.pubkey)
          countedByNote.set(noteId, countedPubkeys)
        }

        setState(prev => {
          const base = prev.key === activeKey ? prev.byNote : {}
          const cur = base[noteId] ?? { total: 0, viewerReacted: false }
          const nextTotal = cur.total + (isNewPubkey ? 1 : 0)
          const nextViewerReacted = cur.viewerReacted || (viewerPubkey ? evt.pubkey === viewerPubkey : false)
          return { key: activeKey, byNote: { ...base, [noteId]: { total: nextTotal, viewerReacted: nextViewerReacted } } }
        })
      },
    })

    return () => unsub()
  }, [client, isOffline, activeKey, noteIdKey, viewerPubkey])

  const reactionsByNoteId = state.key === activeKey ? state.byNote : {}
  return { reactionsByNoteId }
}

