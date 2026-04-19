import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactionSummary } from './useReactions'

export function useOptimisticReactions(reactionsByNoteId: Record<string, ReactionSummary>) {
  const [optimisticReactedByNoteId, setOptimisticReactedByNoteId] = useState<Record<string, true>>(
    {},
  )
  const reactedNoteIdsRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    reactedNoteIdsRef.current = new Set(Object.keys(optimisticReactedByNoteId))
  }, [optimisticReactedByNoteId])

  const addOptimisticReaction = (noteId: string) => {
    setOptimisticReactedByNoteId((prev) => (prev[noteId] ? prev : { ...prev, [noteId]: true }))
  }

  const removeOptimisticReaction = (noteId: string) => {
    setOptimisticReactedByNoteId((prev) => {
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
