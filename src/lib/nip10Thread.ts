import type { Event } from './nostrPrimitives'
import { NOSTR_KINDS } from './breznNostr'

/** Max visual nest steps (deeper notes stay at this indent). */
export const REPLY_INDENT_MAX_DEPTH = 6

function eTagIds(evt: Event): string[] {
  const out: string[] = []
  for (const t of evt.tags) {
    if (t[0] !== 'e' || typeof t[1] !== 'string' || !t[1]) continue
    out.push(t[1])
  }
  return out
}

/**
 * NIP-10 thread root id: marked `root`, else first `e` when unmarked.
 * Null if the note has no `e` tags (it is already a root).
 */
export function threadRootEventId(evt: Event): string | null {
  if (evt.kind !== NOSTR_KINDS.note) return null
  const eTags = eTagIds(evt)
  if (!eTags.length) return null
  const markedRoot = evt.tags.find(
    (t) => t[0] === 'e' && typeof t[1] === 'string' && t[1] && t[3] === 'root',
  )
  if (markedRoot?.[1]) return markedRoot[1]
  return eTags[0]!
}

/**
 * NIP-10 parent note id: marked `reply`, else last `e` when unmarked,
 * else the only `e` tag.
 */
export function replyParentId(evt: Event): string | null {
  const eTags = eTagIds(evt)
  if (!eTags.length) return null
  const markedReply = evt.tags.find(
    (t) => t[0] === 'e' && typeof t[1] === 'string' && t[1] && t[3] === 'reply',
  )
  if (markedReply?.[1]) return markedReply[1]
  if (eTags.length >= 2) return eTags[eTags.length - 1]!
  return eTags[0]!
}

/** Depth under the thread root: 0 = direct reply, 1 = reply-to-reply, … */
export function replyDepthById(rootId: string, replies: readonly Event[]): Map<string, number> {
  const byId = new Map(replies.map((r) => [r.id, r]))
  const depth = new Map<string, number>()
  const visiting = new Set<string>()

  function depthOf(id: string): number {
    if (id === rootId) return -1
    const cached = depth.get(id)
    if (cached !== undefined) return cached
    if (visiting.has(id)) return 0
    const evt = byId.get(id)
    if (!evt) return 0
    visiting.add(id)
    const parent = replyParentId(evt)
    let d = 0
    if (parent && parent !== rootId) {
      d = Math.min(depthOf(parent) + 1, REPLY_INDENT_MAX_DEPTH)
    }
    visiting.delete(id)
    depth.set(id, d)
    return d
  }

  for (const r of replies) depthOf(r.id)
  return depth
}

const INDENT_CLASS = ['', 'pl-3', 'pl-6', 'pl-9', 'pl-12', 'pl-14', 'pl-16'] as const

export function replyIndentClass(depth: number): string {
  const d = Math.max(0, Math.min(Math.floor(depth), REPLY_INDENT_MAX_DEPTH))
  return INDENT_CLASS[d] ?? ''
}
