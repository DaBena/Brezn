import { useEffect, useMemo, useRef, useState } from 'react'
import type { Event, Filter } from 'nostr-tools'
import type { BreznNostrClient } from '../lib/nostrClient'
import { getTagValue } from '../lib/nostrUtils'

/** Shorter debounce = less time showing empty counts while scope catches up (vs relay REQ churn). */
const REACTION_SUB_DEBOUNCE_MS = 120

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

  // NOTE: `noteIds` is often a new array each render; Set iteration order follows insertion
  // order, so we sort() so the joined key is stable for the same multiset of ids.
  const limitedNoteIds = [...new Set(noteIds)].sort().slice(0, 300)
  const noteIdKey = limitedNoteIds.join(',')
  const scopeKeyLive = `${noteIdKey}|${viewerPubkey ?? ''}`

  const [debouncedScopeKey, setDebouncedScopeKey] = useState(scopeKeyLive)
  useEffect(() => {
    const id = setTimeout(() => setDebouncedScopeKey(scopeKeyLive), REACTION_SUB_DEBOUNCE_MS)
    return () => clearTimeout(id)
  }, [scopeKeyLive])

  const pipe = debouncedScopeKey.indexOf('|')
  const debouncedNoteIdKey = pipe === -1 ? debouncedScopeKey : debouncedScopeKey.slice(0, pipe)
  const debouncedViewerPubkey = pipe === -1 ? '' : debouncedScopeKey.slice(pipe + 1)
  const debouncedLimitedIds = useMemo(
    () =>
      debouncedNoteIdKey
        .split(',')
        .filter((id) => /^[0-9a-f]{64}$/i.test(id))
        .slice(0, 300),
    [debouncedNoteIdKey],
  )
  const activeKey = debouncedScopeKey

  const [state, setState] = useState<{ key: string; byNote: Record<string, ReactionSummary> }>({
    key: '',
    byNote: {},
  })
  const seenReactionIdsRef = useRef<Set<string>>(new Set())
  const countedPubkeysByNoteRef = useRef<Map<string, Set<string>>>(new Map())
  const scopeKeyRef = useRef<string>('')
  /** Last known counts per note (session); avoids flashing 0 during debounce / sub restart. */
  const [stableByNote, setStableByNote] = useState<Record<string, ReactionSummary>>({})

  useEffect(() => {
    if (isOffline) return
    if (!debouncedLimitedIds.length) return

    const noteIdSet = new Set(debouncedLimitedIds)

    // Only reset local dedupe + counters when the query *scope* changes.
    // Otherwise, reconnects/restarts can re-send the same events and we'd double-count them.
    if (scopeKeyRef.current !== activeKey) {
      scopeKeyRef.current = activeKey
      seenReactionIdsRef.current = new Set()
      countedPubkeysByNoteRef.current = new Map()
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset when noteIds/scope change
      setState({ key: activeKey, byNote: {} })
    }

    const since = Math.floor(Date.now() / 1000) - 60 * 60 * 24 * 14 // last 14d
    const filter: Filter = { kinds: [7], '#e': debouncedLimitedIds, since, limit: 5000 }

    const unsub = client.subscribe(filter, {
      onevent: (evt) => {
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

        setState((prev) => {
          const base = prev.key === activeKey ? prev.byNote : {}
          const cur = base[noteId] ?? { total: 0, viewerReacted: false }
          const nextTotal = cur.total + (isNewPubkey ? 1 : 0)
          const nextViewerReacted =
            cur.viewerReacted ||
            (debouncedViewerPubkey ? evt.pubkey === debouncedViewerPubkey : false)
          return {
            key: activeKey,
            byNote: { ...base, [noteId]: { total: nextTotal, viewerReacted: nextViewerReacted } },
          }
        })
      },
    })

    return () => unsub()
  }, [client, isOffline, activeKey, debouncedLimitedIds, debouncedViewerPubkey])

  // Merge live subscription state into stable display map; prune ids no longer subscribed.
  useEffect(() => {
    if (state.key !== activeKey) return
    const allowed = new Set(debouncedLimitedIds)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- derive sticky counts from live sub state
    setStableByNote((prev) => {
      const next = { ...prev }
      for (const [id, sum] of Object.entries(state.byNote)) {
        if (allowed.has(id)) next[id] = sum
      }
      for (const id of Object.keys(next)) {
        if (!allowed.has(id)) delete next[id]
      }
      return next
    })
  }, [state.byNote, state.key, activeKey, debouncedLimitedIds])

  const reactionsByNoteId = useMemo(() => {
    const live = state.key === activeKey ? state.byNote : null
    const out: Record<string, ReactionSummary> = {}
    for (const id of debouncedLimitedIds) {
      const fromLive = live?.[id]
      if (fromLive !== undefined) {
        out[id] = fromLive
      } else if (stableByNote[id] !== undefined) {
        out[id] = stableByNote[id]
      }
    }
    return out
  }, [state.byNote, state.key, activeKey, debouncedLimitedIds, stableByNote])

  return { reactionsByNoteId }
}
