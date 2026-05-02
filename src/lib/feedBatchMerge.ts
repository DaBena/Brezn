import type { Event } from 'nostr-tools'
import { NOSTR_KINDS } from './breznNostr'
import { isNip52CalendarKind, upsertFeedEvents } from './nip52'
import { isReplyNote } from './nostrUtils'

/** Merge a batch of incoming feed roots into `prev` (order within `incoming` is preserved). */
export function mergeFeedIncoming(prev: Event[], incoming: Event[]): Event[] {
  let next = prev
  for (const evt of incoming) {
    if (evt.kind === NOSTR_KINDS.note) {
      if (isReplyNote(evt)) continue
      if (next.some((e) => e.id === evt.id)) continue
      next = [evt, ...next]
    } else if (isNip52CalendarKind(evt.kind)) {
      next = upsertFeedEvents(next, evt)
    }
  }
  return next
}
