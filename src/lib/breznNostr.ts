export const NOSTR_KINDS = {
  metadata: 0,
  note: 1,
  deletion: 5,
  reaction: 7,
  report: 1984, // NIP-56: Reporting content
  /** NIP-52 calendar events (read-only in Brezn feed). */
  nip52DateEvent: 31922,
  nip52TimeEvent: 31923,
} as const

/** Kind-1 roots + NIP-52 for local geo feed and author profile list. */
export const ROOT_FEED_EVENT_KINDS = [
  NOSTR_KINDS.note,
  NOSTR_KINDS.nip52DateEvent,
  NOSTR_KINDS.nip52TimeEvent,
] as const
