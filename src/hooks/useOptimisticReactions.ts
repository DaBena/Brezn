import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactionSummary } from './useReactions'

const REACTED_STORAGE_KEY = 'brezn:reacted'

export function useOptimisticReactions(reactionsByNoteId: Record<string, ReactionSummary>) {
  const [optimisticReactedByNoteId, setOptimisticReactedByNoteId] = useState<Record<string, true>>(() => {
    // Load persisted reacted note IDs from localStorage
    try {
      const stored = localStorage.getItem(REACTED_STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored) as string[]
        return Object.fromEntries(parsed.map(id => [id, true]))
      }
    } catch {
      // Ignore errors
    }
    return {}
  })
  const reactedNoteIdsRef = useRef<Set<string>>(new Set(Object.keys(optimisticReactedByNoteId)))

  // Persist reacted note IDs to localStorage
  useEffect(() => {
    const ids = Object.keys(optimisticReactedByNoteId)
    reactedNoteIdsRef.current = new Set(ids)
    try {
      localStorage.setItem(REACTED_STORAGE_KEY, JSON.stringify(ids))
    } catch {
      // Ignore errors (localStorage might be full or disabled)
    }
  }, [optimisticReactedByNoteId])

  const addOptimisticReaction = (noteId: string) => {
    setOptimisticReactedByNoteId(prev => (prev[noteId] ? prev : { ...prev, [noteId]: true }))
  }

  const removeOptimisticReaction = (noteId: string) => {
    setOptimisticReactedByNoteId(prev => {
      if (!prev[noteId]) return prev
      const next = { ...prev }
      delete next[noteId]
      return next
    })
  }

  const mergedReactionsByNoteId = useMemo(() => {
    if (!Object.keys(optimisticReactedByNoteId).length) return reactionsByNoteId
    const merged: Record<string, ReactionSummary> = { ...reactionsByNoteId }
    for (const noteId of Object.keys(optimisticReactedByNoteId)) {
      const cur = merged[noteId] ?? { total: 0, viewerReacted: false }
      merged[noteId] = { ...cur, viewerReacted: true }
    }
    return merged
  }, [optimisticReactedByNoteId, reactionsByNoteId])

  return {
    optimisticReactedByNoteId,
    reactedNoteIdsRef,
    addOptimisticReaction,
    removeOptimisticReaction,
    mergedReactionsByNoteId,
  }
}
